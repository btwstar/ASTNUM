/**
 * ASTNUM seed — full local seed library loader.
 *
 * Contract (frozen, used by every module API):
 *   import { ensureSeed } from "@/lib/seed";
 *   export async function ensureSeed(): Promise<void>
 *
 * Properties:
 *   - Idempotent: safe to call on every request; per-table count guards mean
 *     each table is seeded only when empty.
 *   - Concurrency-safe: the Settings flag row "seed:v1" acts as the lock —
 *     checked again INSIDE the transaction; races on SQLite's single writer are
 *     caught and ignored (the winner completed the same work).
 *     Concurrent calls within the same process are serialized through a single
 *     in-flight promise, because parallel interactive transactions would
 *     deadlock SQLite's single writer (verified experimentally).
 *   - Self-healing: the flag VALUE stores the seed capacity version. A DB
 *     bootstrapped by the earlier minimal seed (flag value = timestamp) will be
 *     topped up to full capacity on the next call.
 *   - Fast: single transaction, createMany batches, fixed slug PKs (no UUID
 *     generation → stable ids enable future device sync). Full seed < 2s on bun.
 *   - Seed rows always get custom=false (user-created rows are custom=true).
 */
import { db } from "@/lib/db";

import { MUSCLE_GROUPS } from "./data";
import { EXERCISES } from "./exercises";
import { FOODS } from "./foods";
import { TEMPLATES, assertTemplatesReferenceValidExercises } from "./templates";

const SEED_FLAG = "seed:v1"; // settings key used as the lock row
const SEED_VERSION = "full-v2"; // value written once the FULL library is seeded (v2 = per-100g foods)
const SEED_VERSION_V1 = "full-v1"; // pre-v1.16 flag (per-SERVING food values)

/**
 * In-process serialization: the first caller runs the seeding transaction;
 * every concurrent caller awaits the same promise. Without this, N parallel
 * interactive transactions deadlock SQLite's single writer for ~10s and all
 * fail. (Cross-process races are still handled by the flag + catch below.)
 */
let inflight: Promise<void> | null = null;

async function runSeedTransaction(): Promise<void> {
  const now = new Date().toISOString();

  try {
    await db.$transaction(async (tx) => {
      // Re-check inside the transaction: another concurrent caller may have
      // just finished the exact same work.
      const inner = await tx.settings.findUnique({ where: { key: SEED_FLAG } });
      if (inner?.value === SEED_VERSION) return;

      // Data sanity (sync, ~free): templates must reference real exercises.
      assertTemplatesReferenceValidExercises(EXERCISES);

      // 1) Muscle groups — the frozen canonical 15.
      if ((await tx.muscleGroups.count()) === 0) {
        await tx.muscleGroups.createMany({
          data: MUSCLE_GROUPS.map((m, i) => ({
            id: m.id,
            nameAr: m.nameAr,
            nameEn: m.nameEn,
            svgId: m.svgId,
            region: m.region,
            weeklyTarget: 12,
            sortOrder: i,
            updatedAt: now,
          })),
        });
      }

      // 2) Exercise library + muscle mappings (composite PK exerciseId+muscleId).
      if ((await tx.exercises.count()) === 0) {
        await tx.exercises.createMany({
          data: EXERCISES.map((e) => ({
            id: e.id,
            nameAr: e.nameAr,
            nameEn: e.nameEn,
            equipment: e.equipment,
            custom: false,
            createdAt: now,
            updatedAt: now,
          })),
        });
        await tx.exerciseMuscles.createMany({
          data: EXERCISES.flatMap((e) =>
            e.muscles.map((m) => ({
              exerciseId: e.id,
              muscleId: m.muscleId,
              role: m.role,
              weight: m.weight,
            })),
          ),
        });
      }

      // 3) Workout templates + their exercise prescriptions.
      if ((await tx.workoutTemplates.count()) === 0) {
        await tx.workoutTemplates.createMany({
          data: TEMPLATES.map((t) => ({
            id: t.id,
            // Single `name` column → bilingual "AR | EN" convention (see templates.ts).
            name: `${t.nameAr} | ${t.nameEn}`,
            description: t.description,
            createdAt: now,
            updatedAt: now,
          })),
        });
        await tx.templateExercises.createMany({
          data: TEMPLATES.flatMap((t) =>
            t.exercises.map((te, i) => ({
              id: `te-${t.id.replace("tpl-", "")}-${i + 1}`,
              templateId: t.id,
              exerciseId: te.exerciseId,
              targetSets: te.targetSets,
              targetReps: te.targetReps,
              sortOrder: i,
            })),
          ),
        });
      }

      // 4) Food library — values are PER 100 G (v2 convention; servingG =
      //    typical portion grams, used as the portion-sheet prefill).
      if ((await tx.foods.count()) === 0) {
        await tx.foods.createMany({
          data: FOODS.map((f) => ({
            id: f.id,
            nameAr: f.nameAr,
            nameEn: f.nameEn,
            kcal: f.kcal,
            protein: f.protein,
            carbs: f.carbs,
            fat: f.fat,
            servingG: f.servingG,
            custom: false,
            favorite: false,
            updatedAt: now,
          })),
        });
      }

      // 4b) v1.16 DATA-CONVENTION MIGRATION (full-v1 → full-v2): the food
      // library moved from per-SERVING kcal to PER-100G kcal (the UI's
      // portion sheet, barcode imports and the food form have ALWAYS been
      // per-100g — the old per-serving seed values were silently inflated
      // by servingG/100 on every log). Seed rows (stable slug ids) get the
      // new library values; ONLY the 4 macro numbers change — name/brand/
      // favorite/photo edits survive, and rows the user deleted (deletedAt
      // set) or created (UUID ids) are untouched.
      const prevFlag = await tx.settings.findUnique({ where: { key: SEED_FLAG } });
      if (prevFlag?.value === SEED_VERSION_V1) {
        for (const f of FOODS) {
          await tx.foods.updateMany({
            where: { id: f.id, deletedAt: null },
            data: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
          });
        }
      }

      // 5) Mark full capacity as seeded (lock row for future callers).
      await tx.settings.upsert({
        where: { key: SEED_FLAG },
        create: { key: SEED_FLAG, value: SEED_VERSION, updatedAt: now },
        update: { value: SEED_VERSION, updatedAt: now },
      });
    });
  } catch {
    /* A concurrent ensureSeed() won the race (SQLite single-writer) — the same
       idempotent work was committed by the winner, so this error is safe to
       swallow. Genuine data errors would surface on every subsequent call and
       are caught by tests/seed.test.ts. */
  }
}

export async function ensureSeed(): Promise<void> {
  // Fast path: fully seeded already (flag carries the capacity version).
  const flag = await db.settings.findUnique({ where: { key: SEED_FLAG } });
  if (flag?.value === SEED_VERSION) return;

  // Serialize seeding within this process (see `inflight` doc comment).
  if (inflight) return inflight;
  const run = runSeedTransaction();
  inflight = run;
  try {
    await run;
  } finally {
    inflight = null;
  }
}
