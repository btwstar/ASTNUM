/**
 * /api/gym/** — port of the gym API routes (verbatim logic):
 *   src/app/api/gym/workouts/route.ts         (GET roster + POST start/resume)
 *   src/app/api/gym/workouts/[id]/route.ts    (GET session + PATCH + DELETE)
 *   src/app/api/gym/workouts/[id]/sets/route.ts (POST log set, PR detection)
 *   src/app/api/gym/sets/[id]/route.ts         (DELETE hard-remove a set)
 *   src/app/api/gym/templates/route.ts        (GET list + POST create)
 *   src/app/api/gym/templates/[id]/route.ts   (PATCH + DELETE)
 *   src/app/api/gym/exercises/route.ts        (GET library + POST custom)
 *   src/app/api/gym/stats/route.ts            (GET charts/PRs/history)
 * plus the server-only companions gym/_helpers.ts, gym/_workouts.ts,
 * gym/_templates.ts. PR math is REUSED from @/lib/logic/pr (detectPrs/epley1RM).
 */

import { addDaysToKey, dayKeyToWeekday, toLocalDateKey } from "@/lib/i18n/format";
import { resolveExerciseMediaPair } from "@/lib/image-compress";
import { detectPrs, epley1RM, type PrType } from "@/lib/logic/pr";
import {
  appendIdUnique,
  encodeDaysJson,
  encodeIdsJson,
  parseDaysJson,
  parseIdsJson,
  removeId,
  validateDaysInput,
} from "@/lib/logic/gym-smart";
import { ensureSeeded, getDb, uuid } from "../db";
import {
  bad,
  fail,
  ok,
  propagate,
  readJsonObject,
  sortRows,
  type LocalRequest,
} from "../shared";
import type { ExerciseRow, SetRow, WorkoutRow } from "../db";

/* ── gym/_helpers.ts port ─────────────────────────────────────────── */

export const EQUIPMENT_VALUES = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
  "none",
] as const;
export type EquipmentValue = (typeof EQUIPMENT_VALUES)[number];

export const SET_TYPES = ["warmup", "work", "failure"] as const;
export type SetTypeValue = (typeof SET_TYPES)[number];

function notFoundWhat(what: string): never {
  return fail("NOT_FOUND", what, 404);
}

/** "YYYY-MM-DD" or null (gym variant — regex + UTC parse check). */
function validDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

function resolveTodayKey(req: LocalRequest): string {
  const q = req.query.get("today");
  const key = validDateKey(q);
  return key ?? toLocalDateKey();
}

function validReps(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1000 || !Number.isInteger(n)) return null;
  return n;
}

function validWeight(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 2000) return null;
  return Math.round(n * 1000) / 1000;
}

function validRpe(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return Math.round(n * 2) / 2; // half steps
}

function validSetType(value: unknown): SetTypeValue {
  return typeof value === "string" && (SET_TYPES as readonly string[]).includes(value)
    ? (value as SetTypeValue)
    : "work";
}

function validEquipment(value: unknown): EquipmentValue | null {
  return typeof value === "string" && (EQUIPMENT_VALUES as readonly string[]).includes(value)
    ? (value as EquipmentValue)
    : null;
}

/** Int bounded into [min, max] or null. */
function validInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/* ── gym/_workouts.ts port ────────────────────────────────────────── */

export interface WorkoutSummary {
  id: string;
  date: string;
  templateId: string | null;
  name: string | null;
  durationSec: number;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  volume: number;
  setCount: number;
  workSetCount: number;
}

/** Summarize workouts with per-set aggregates (warmups never count as volume). */
export function summarizeWorkouts(workoutRows: WorkoutRow[]): WorkoutSummary[] {
  const db = getDb();
  const ids = workoutRows.map((w) => w.id);
  const sets = ids.length ? db.sets.filter((s) => ids.includes(s.workoutId)) : [];
  const byWorkout = new Map<string, { volume: number; setCount: number; workSetCount: number }>();
  for (const w of workoutRows) {
    byWorkout.set(w.id, { volume: 0, setCount: 0, workSetCount: 0 });
  }
  for (const s of sets) {
    const agg = byWorkout.get(s.workoutId);
    if (!agg) continue;
    agg.setCount += 1;
    if (s.setType !== "warmup") {
      agg.workSetCount += 1;
      agg.volume += s.reps * s.weight;
    }
  }
  return workoutRows.map((w) => ({
    id: w.id,
    date: w.date,
    templateId: w.templateId,
    name: w.name,
    durationSec: w.durationSec,
    notes: w.notes,
    completedAt: w.completedAt,
    createdAt: w.createdAt,
    ...(byWorkout.get(w.id) ?? { volume: 0, setCount: 0, workSetCount: 0 }),
  }));
}

/* ── gym/_templates.ts port ───────────────────────────────────────── */

export interface TemplateExerciseInput {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
}

/** User-created templates get ids "utpl-<uuid>" — everything else is built-in. */
export function isBuiltinTemplate(id: string): boolean {
  return !id.startsWith("utpl-");
}

/** Shared loader: templates + joined exercises (mirrors the 3-query server flow). */
export function loadTemplates() {
  const db = getDb();
  const templates = sortRows(
    db.workoutTemplates.filter((t) => t.deletedAt === null),
    [
      ["createdAt", "asc"],
      ["id", "asc"],
    ]
  );
  const templateExercises = sortRows([...db.templateExercises], [
    ["sortOrder", "asc"],
    ["id", "asc"],
  ]);
  const exercises = db.exercises.filter((e) => e.deletedAt === null);

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const byTemplate = new Map<string, typeof templateExercises>();
  for (const te of templateExercises) {
    let list = byTemplate.get(te.templateId);
    if (!list) {
      list = [];
      byTemplate.set(te.templateId, list);
    }
    list.push(te);
  }
  return templates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    builtin: isBuiltinTemplate(tpl.id),
    days: parseDaysJson(tpl.daysJson),
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
    exercises: (byTemplate.get(tpl.id) ?? []).map((te) => {
      const ex = exerciseById.get(te.exerciseId);
      return {
        id: te.id,
        exerciseId: te.exerciseId,
        targetSets: te.targetSets,
        targetReps: te.targetReps,
        sortOrder: te.sortOrder,
        exercise: ex
          ? { nameAr: ex.nameAr, nameEn: ex.nameEn, equipment: ex.equipment }
          : null,
      };
    }),
  }));
}

/** Normalize + validate an exercises array → { exercises } or { error }. */
export function parseTemplateExercises(
  raw: unknown
): { exercises: TemplateExerciseInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "exercises_required" };
  if (raw.length > 30) return { error: "too_many_exercises" };
  const out: TemplateExerciseInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "invalid_exercise_entry" };
    }
    const r = item as { exerciseId?: unknown; targetSets?: unknown; targetReps?: unknown };
    if (typeof r.exerciseId !== "string" || !r.exerciseId) return { error: "invalid_exercise_id" };
    const sets = validInt(r.targetSets ?? 3, 1, 12);
    const reps = validInt(r.targetReps ?? 10, 1, 100);
    if (sets === null || reps === null) return { error: "invalid_targets" };
    out.push({ exerciseId: r.exerciseId, targetSets: sets, targetReps: reps });
  }
  return { exercises: out };
}

/** Bilingual name storage: "AR | EN" (frozen seed convention). */
export function templateNameFrom(nameAr: string, nameEn: string): string {
  return `${nameAr} | ${nameEn}`;
}

/* ── GET/POST /api/gym/workouts ───────────────────────────────────── */

function findActiveWorkout(): WorkoutRow | undefined {
  const candidates = sortRows(
    getDb().workouts.filter((w) => w.completedAt === null && w.deletedAt === null),
    [["createdAt", "desc"]]
  );
  return candidates[0];
}

export function workoutsList(req: LocalRequest) {
  try {
    const db = getDb();
    const todayKey = resolveTodayKey(req);

    const activeRow = findActiveWorkout();
    const historyRows = sortRows(
      db.workouts.filter((w) => w.completedAt !== null && w.deletedAt === null),
      [
        ["completedAt", "desc"],
        ["createdAt", "desc"],
      ]
    ).slice(0, 30);

    const all = summarizeWorkouts([...(activeRow ? [activeRow] : []), ...historyRows]);
    const active = activeRow ? all.find((w) => w.id === activeRow.id) ?? null : null;
    const history = all.filter((w) => w.id !== activeRow?.id);

    return ok({ today: todayKey, active, history });
  } catch (e) {
    propagate(e, "failed_to_load_workouts");
  }
}

export function workoutsStart(req: LocalRequest) {
  try {
    const db = getDb();
    const body = readJsonObject(req);
    const todayKey = resolveTodayKey(req);

    // One active session at a time — starting returns the existing one.
    const existing = findActiveWorkout();
    if (existing) {
      const [summary] = summarizeWorkouts([existing]);
      return ok({ workout: summary, resumed: true });
    }

    let templateId: string | null = null;
    let name: string | null = null;
    let carryJson: string | null = null;
    if (body && body.templateId !== undefined && body.templateId !== null) {
      if (typeof body.templateId !== "string" || !body.templateId) {
        bad("invalid_template_id");
      }
      const tpl = db.workoutTemplates.find((t) => t.id === body.templateId);
      if (!tpl || tpl.deletedAt) notFoundWhat("template_not_found");
      templateId = tpl.id;
      name = tpl.name; // stored "AR | EN"
      carryJson = tpl.carryJson ?? null; // v1.17 carry snapshot
    }

    const now = new Date().toISOString();
    const created: WorkoutRow = {
      id: uuid(),
      date: todayKey, // local YYYY-MM-DD
      templateId,
      name,
      durationSec: 0,
      notes: null,
      deferredJson: null,
      carryJson,
      completedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.workouts.push(created);
    const [summary] = summarizeWorkouts([created]);
    return ok({ workout: summary, resumed: false });
  } catch (e) {
    propagate(e, "failed_to_start_workout");
  }
}

/* ── GET/PATCH/DELETE /api/gym/workouts/[id] ──────────────────────── */

export function workoutDetail(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const workout = db.workouts.find((w) => w.id === id);
    if (!workout || workout.deletedAt) notFoundWhat("workout_not_found");

    const sets = sortRows(
      db.sets.filter((s) => s.workoutId === id),
      [
        ["createdAt", "asc"],
        ["id", "asc"],
      ]
    );

    // v1.17 — deferral bookkeeping for this session
    const deferredIds = parseIdsJson(workout.deferredJson);
    const carriedIds = parseIdsJson(workout.carryJson);

    // template prescription (planned rows) — carried exercises FIRST, the
    // rest in template order (mirror of the server GET, incl. dropping
    // carried ids that are no longer in the prescription)
    let templateExercises: Array<Record<string, unknown>> = [];
    if (workout.templateId) {
      const rows = sortRows(
        db.templateExercises.filter((te) => te.templateId === workout.templateId),
        [
          ["sortOrder", "asc"],
          ["id", "asc"],
        ]
      );
      const exIds = [...new Set(rows.map((r) => r.exerciseId))];
      const exercises = exIds.length ? db.exercises.filter((e) => exIds.includes(e.id)) : [];
      const nameById = new Map(exercises.map((e) => [e.id, e]));
      const toDTO = (r: (typeof rows)[number]) => {
        const ex = nameById.get(r.exerciseId) as ExerciseRow | undefined;
        return {
          id: r.id,
          exerciseId: r.exerciseId,
          targetSets: r.targetSets,
          targetReps: r.targetReps,
          sortOrder: r.sortOrder,
          exercise: ex
            ? { nameAr: ex.nameAr, nameEn: ex.nameEn, equipment: ex.equipment }
            : null,
        };
      };
      const carriedSet = new Set(carriedIds);
      templateExercises = [
        ...carriedIds
          .map((exId) => rows.find((r) => r.exerciseId === exId))
          .filter((r): r is (typeof rows)[number] => Boolean(r))
          .map(toDTO),
        ...rows.filter((r) => !carriedSet.has(r.exerciseId)).map(toDTO),
      ];
    }

    // last performance per involved exercise — latest work set in any OTHER
    // non-deleted workout.
    const involvedIds = [
      ...new Set([
        ...templateExercises.map((te) => te.exerciseId as string),
        ...sets.map((s) => s.exerciseId),
      ]),
    ];
    const lastPerformance: Record<
      string,
      { reps: number; weightKg: number; date: string } | null
    > = {};
    if (involvedIds.length > 0) {
      const otherWorkouts = db.workouts.filter((w) => w.deletedAt === null && w.id !== id);
      const otherIds = new Set(otherWorkouts.map((w) => w.id));
      const dateByWorkout = new Map(otherWorkouts.map((w) => [w.id, w.date]));
      const priorSets = sortRows(
        db.sets.filter(
          (s) =>
            involvedIds.includes(s.exerciseId) &&
            otherIds.has(s.workoutId) &&
            s.setType !== "warmup"
        ),
        [["createdAt", "desc"]]
      );
      const seen = new Set<string>();
      for (const s of priorSets) {
        if (seen.has(s.exerciseId)) continue; // first hit = latest
        seen.add(s.exerciseId);
        lastPerformance[s.exerciseId] = {
          reps: s.reps,
          weightKg: s.weight,
          date: dateByWorkout.get(s.workoutId) ?? "",
        };
      }
    }
    for (const exId of involvedIds) {
      if (!(exId in lastPerformance)) lastPerformance[exId] = null;
    }

    const [summary] = summarizeWorkouts([workout]);
    return ok({
      workout: summary,
      sets: sets.map((s) => ({
        id: s.id,
        workoutId: s.workoutId,
        exerciseId: s.exerciseId,
        setType: s.setType,
        reps: s.reps,
        weightKg: s.weight,
        rpe: s.rpe,
        isPr: s.isPr,
        createdAt: s.createdAt,
      })),
      templateExercises,
      lastPerformance,
      deferredIds,
      carriedIds,
    });
  } catch (e) {
    propagate(e, "failed_to_load_workout");
  }
}

export function workoutUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const workout = db.workouts.find((w) => w.id === id);
    if (!workout || workout.deletedAt) notFoundWhat("workout_not_found");

    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    let justFinished = false;
    if (body.durationSec !== undefined) {
      const duration = validInt(body.durationSec, 0, 24 * 60 * 60);
      if (duration === null) bad("invalid_duration");
      workout.durationSec = duration;
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== "string") bad("invalid_notes");
      workout.notes = body.notes.trim().slice(0, 2000) || null;
    }
    if (body.finish === true && workout.completedAt === null) {
      workout.completedAt = new Date().toISOString(); // first finish wins
      justFinished = true;
    }
    if (body.finish !== undefined && body.finish !== true) {
      bad("finish_must_be_true");
    }

    // v1.17 تأجيل — defer / undefer a planned exercise (mirror of the server
    // PATCH rules: finished session, no template, id not in the prescription,
    // or already-started exercise → 400; idempotent otherwise).
    if (body.deferExercise !== undefined || body.undeferExercise !== undefined) {
      if (workout.completedAt !== null) bad("workout_already_finished");
      if (!workout.templateId) bad("no_template");
      const exId =
        typeof body.deferExercise === "string" && body.deferExercise
          ? body.deferExercise
          : typeof body.undeferExercise === "string" && body.undeferExercise
            ? body.undeferExercise
            : "";
      if (!exId) bad("invalid_exercise_id");
      const inTemplate = db.templateExercises.some(
        (te) => te.templateId === workout.templateId && te.exerciseId === exId
      );
      if (!inTemplate) bad("not_in_template");
      const tpl = db.workoutTemplates.find((t) => t.id === workout.templateId);
      if (!tpl) bad("no_template");

      if (body.deferExercise !== undefined) {
        const hasSets = db.sets.some(
          (s) => s.workoutId === id && s.exerciseId === exId
        );
        if (hasSets) bad("exercise_already_started");
        workout.deferredJson = encodeIdsJson(
          appendIdUnique(parseIdsJson(workout.deferredJson), exId)
        );
        tpl.carryJson = encodeIdsJson(
          appendIdUnique(parseIdsJson(tpl.carryJson), exId)
        );
      } else {
        workout.deferredJson = encodeIdsJson(
          removeId(parseIdsJson(workout.deferredJson), exId)
        );
        tpl.carryJson = encodeIdsJson(removeId(parseIdsJson(tpl.carryJson), exId));
      }
      tpl.updatedAt = new Date().toISOString();
    }
    workout.updatedAt = new Date().toISOString();

    // Auto-complete the linked gym-plan habit (first finish only) — the
    // local twin of the web route: upsert a done log on the workout's date.
    let linkedHabit: { id: string; name: string } | null = null;
    if (justFinished && workout.templateId) {
      const habit = db.habits.find(
        (h) =>
          h.gymTemplateId === workout.templateId &&
          h.deletedAt === null &&
          !h.archived
      );
      if (habit) {
        const now = new Date().toISOString();
        const existing = db.habitLogs.find(
          (l) => l.habitId === habit.id && l.date === workout.date
        );
        if (existing) {
          existing.done = true;
          existing.updatedAt = now;
        } else {
          db.habitLogs.push({
            id: uuid(),
            habitId: habit.id,
            date: workout.date,
            done: true,
            updatedAt: now,
          });
        }
        linkedHabit = { id: habit.id, name: habit.name };
      }
    }

    const [summary] = summarizeWorkouts([workout]);
    return ok({
      workout: summary,
      linkedHabit,
      deferredIds: parseIdsJson(workout.deferredJson),
      carriedIds: parseIdsJson(workout.carryJson),
    });
  } catch (e) {
    propagate(e, "failed_to_update_workout");
  }
}

export function workoutDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const workout = db.workouts.find((w) => w.id === id);
    if (!workout || workout.deletedAt) notFoundWhat("workout_not_found");
    workout.deletedAt = new Date().toISOString();
    return ok({ deleted: id });
  } catch (e) {
    propagate(e, "failed_to_delete_workout");
  }
}

/* ── POST /api/gym/workouts/[id]/sets ─────────────────────────────── */

export function workoutLogSet(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const workout = db.workouts.find((w) => w.id === id);
    if (!workout || workout.deletedAt) notFoundWhat("workout_not_found");
    if (workout.completedAt) bad("workout_already_finished");

    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    if (typeof body.exerciseId !== "string" || !body.exerciseId) {
      bad("exercise_id_required");
    }
    const exercise = db.exercises.find((e) => e.id === body.exerciseId);
    if (!exercise || exercise.deletedAt) notFoundWhat("exercise_not_found");

    const reps = validReps(body.reps);
    if (reps === null) bad("invalid_reps");
    const weightKg = validWeight(body.weightKg);
    if (weightKg === null) bad("invalid_weight");
    const setType = validSetType(body.setType);
    let rpe: number | null = null;
    if (body.rpe !== undefined && body.rpe !== null && body.rpe !== "") {
      rpe = validRpe(body.rpe);
      if (rpe === null) bad("invalid_rpe");
    }

    // PR history: all previous sets of this exercise in non-deleted workouts.
    const liveIds = new Set(db.workouts.filter((w) => w.deletedAt === null).map((w) => w.id));
    const history = db.sets.filter(
      (s) => s.exerciseId === exercise.id && liveIds.has(s.workoutId)
    );

    const prs: PrType[] =
      setType === "warmup"
        ? [] // warmups never set records
        : detectPrs({
            reps,
            weightKg,
            pastSets: history.map((s) => ({
              reps: s.reps,
              weightKg: s.weight,
              setType: s.setType,
              createdAt: s.createdAt,
            })),
          });

    const now = new Date().toISOString();
    const set: SetRow = {
      id: uuid(),
      workoutId: id,
      exerciseId: exercise.id,
      setType,
      reps,
      weight: weightKg,
      rpe,
      isPr: prs.length > 0,
      createdAt: now,
      updatedAt: now,
    };
    db.sets.push(set);

    // v1.17 — the deferral is fulfilled: clear it from this workout AND the
    // template's carry (mirror of the server POST bookkeeping).
    const stillDeferred = removeId(parseIdsJson(workout.deferredJson), exercise.id);
    workout.deferredJson = encodeIdsJson(stillDeferred);
    if (workout.templateId) {
      const tpl = db.workoutTemplates.find((t) => t.id === workout.templateId);
      const carry = parseIdsJson(tpl?.carryJson);
      if (carry.includes(exercise.id) && tpl) {
        tpl.carryJson = encodeIdsJson(removeId(carry, exercise.id));
        tpl.updatedAt = now;
      }
    }

    return ok({
      set: {
        id: set.id,
        workoutId: set.workoutId,
        exerciseId: set.exerciseId,
        setType: set.setType,
        reps: set.reps,
        weightKg: set.weight,
        rpe: set.rpe,
        isPr: set.isPr,
        createdAt: set.createdAt,
      },
      prs,
    });
  } catch (e) {
    propagate(e, "failed_to_log_set");
  }
}

/* ── DELETE /api/gym/sets/[id] (hard delete — isPr stays historical) ── */

export function setDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const set = db.sets.find((s) => s.id === id);
    if (!set) notFoundWhat("set_not_found");
    db.sets.splice(db.sets.indexOf(set), 1);
    return ok({ deleted: id });
  } catch (e) {
    propagate(e, "failed_to_delete_set");
  }
}

/* ── PATCH /api/gym/sets/[id] — EDIT a logged set (v1.9: تعديل السجل).
 * Body: { reps, weightKg, setType?, rpe? }. Works for active-session sets
 * AND finished-session sets (fixing history is the point). isPr is
 * re-evaluated honestly against every OTHER live set of the same exercise. */

export function setUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const set = db.sets.find((s) => s.id === id);
    if (!set) notFoundWhat("set_not_found");

    // guard: the owning workout must still be live (soft-delete respected)
    const workout = db.workouts.find((w) => w.id === set.workoutId);
    if (!workout || workout.deletedAt) notFoundWhat("workout_not_found");

    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    const reps = validReps(body.reps);
    if (reps === null) bad("invalid_reps");
    const weightKg = validWeight(body.weightKg);
    if (weightKg === null) bad("invalid_weight");
    const setType = validSetType(body.setType);
    let rpe: number | null = null;
    if (body.rpe !== undefined && body.rpe !== null && body.rpe !== "") {
      rpe = validRpe(body.rpe);
      if (rpe === null) bad("invalid_rpe");
    }

    // PR history: all OTHER live sets of this exercise (self excluded —
    // the row is being re-evaluated, not compared against itself).
    const liveIds = new Set(db.workouts.filter((w) => w.deletedAt === null).map((w) => w.id));
    const history = db.sets.filter(
      (s) => s.exerciseId === set.exerciseId && liveIds.has(s.workoutId) && s.id !== set.id
    );

    const prs: PrType[] =
      setType === "warmup"
        ? [] // warmups never hold records
        : detectPrs({
            reps,
            weightKg,
            pastSets: history.map((s) => ({
              reps: s.reps,
              weightKg: s.weight,
              setType: s.setType,
              createdAt: s.createdAt,
            })),
          });

    set.reps = reps;
    set.weight = weightKg;
    set.setType = setType;
    set.rpe = rpe;
    set.isPr = prs.length > 0;
    set.updatedAt = new Date().toISOString();

    return ok({
      set: {
        id: set.id,
        workoutId: set.workoutId,
        exerciseId: set.exerciseId,
        setType: set.setType,
        reps: set.reps,
        weightKg: set.weight,
        rpe: set.rpe,
        isPr: set.isPr,
        createdAt: set.createdAt,
      },
      prs,
    });
  } catch (e) {
    propagate(e, "failed_to_edit_set");
  }
}

/* ── GET/POST /api/gym/templates ──────────────────────────────────── */

export function templatesList() {
  try {
    ensureSeeded();
    const templates = loadTemplates();
    return ok({ templates });
  } catch (e) {
    propagate(e, "failed_to_load_templates");
  }
}

export function templatesCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!nameAr && !nameEn && !name) bad("name_required");
    if (nameAr.length > 80 || nameEn.length > 80 || name.length > 80) {
      bad("name_too_long");
    }
    const finalAr = nameAr || name.replace(/\s\|\s/g, " ") || nameEn;
    const finalEn = nameEn || name.replace(/\s\|\s/g, " ") || nameAr;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 300)
        : null;

    const parsed = parseTemplateExercises(body.exercises);
    if ("error" in parsed) bad(parsed.error);
    const exercises = parsed.exercises;

    // v1.17 day scheduling — validate + encode before touching the DB
    const daysParsed = validateDaysInput(body.days);
    if (daysParsed.kind === "invalid") bad("invalid_days");

    // every exerciseId must exist in the library
    const known = new Set(db.exercises.filter((e) => e.deletedAt === null).map((e) => e.id));
    if (exercises.some((te) => !known.has(te.exerciseId))) bad("unknown_exercise_id");

    const now = new Date().toISOString();
    const id = `utpl-${uuid()}`;
    db.workoutTemplates.push({
      id,
      name: templateNameFrom(finalAr, finalEn),
      description,
      daysJson: daysParsed.kind === "days" ? encodeDaysJson(daysParsed.days) : null,
      carryJson: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    exercises.forEach((te, i) => {
      db.templateExercises.push({
        id: `te-${uuid()}`,
        templateId: id,
        exerciseId: te.exerciseId,
        targetSets: te.targetSets,
        targetReps: te.targetReps,
        sortOrder: i,
      });
    });

    const created = loadTemplates().find((tpl) => tpl.id === id);
    return ok({ template: created ?? null });
  } catch (e) {
    propagate(e, "failed_to_create_template");
  }
}

/* ── PATCH/DELETE /api/gym/templates/[id] ─────────────────────────── */

export function templateUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const tpl = db.workoutTemplates.find((t) => t.id === id);
    if (!tpl || tpl.deletedAt) notFoundWhat("template_not_found");

    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (nameAr || nameEn || name) {
      if (nameAr.length > 80 || nameEn.length > 80 || name.length > 80) {
        bad("name_too_long");
      }
      const finalAr = nameAr || name.replace(/\s\|\s/g, " ") || nameEn;
      const finalEn = nameEn || name.replace(/\s\|\s/g, " ") || nameAr;
      tpl.name = templateNameFrom(finalAr, finalEn);
    }
    if (body.description !== undefined) {
      tpl.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim().slice(0, 300)
          : null;
    }
    // v1.17 day scheduling — [] clears (any day), omitted = untouched
    const daysParsed = validateDaysInput(body.days);
    if (daysParsed.kind === "invalid") bad("invalid_days");
    if (daysParsed.kind === "days") tpl.daysJson = encodeDaysJson(daysParsed.days);

    tpl.updatedAt = new Date().toISOString();

    const replaceExercises = body.exercises !== undefined;
    if (replaceExercises) {
      const parsed = parseTemplateExercises(body.exercises);
      if ("error" in parsed) bad(parsed.error);
      const known = new Set(db.exercises.filter((e) => e.deletedAt === null).map((e) => e.id));
      if (parsed.exercises.some((te) => !known.has(te.exerciseId))) {
        bad("unknown_exercise_id");
      }
      db.templateExercises = db.templateExercises.filter((te) => te.templateId !== id);
      parsed.exercises.forEach((te, i) => {
        db.templateExercises.push({
          id: `te-${uuid()}`,
          templateId: id,
          exerciseId: te.exerciseId,
          targetSets: te.targetSets,
          targetReps: te.targetReps,
          sortOrder: i,
        });
      });
    }

    const updated = loadTemplates().find((t) => t.id === id);
    return ok({ template: updated ?? null });
  } catch (e) {
    propagate(e, "failed_to_update_template");
  }
}

export function templateDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const tpl = db.workoutTemplates.find((t) => t.id === id);
    if (!tpl || tpl.deletedAt) notFoundWhat("template_not_found");
    tpl.deletedAt = new Date().toISOString();
    return ok({ deleted: id });
  } catch (e) {
    propagate(e, "failed_to_delete_template");
  }
}

/* ── GET/POST /api/gym/exercises ──────────────────────────────────── */

export function exercisesList(req: LocalRequest) {
  try {
    const db = getDb();
    ensureSeeded();

    const q = (req.query.get("q") ?? "").trim().toLowerCase();
    const muscle = req.query.get("muscle")?.trim() ?? "";
    const equipment = req.query.get("equipment")?.trim() ?? "";

    const exercises = sortRows(
      db.exercises.filter((e) => e.deletedAt === null),
      [
        ["createdAt", "asc"],
        ["id", "asc"],
      ]
    );

    const musclesByExercise = new Map<string, Array<{ muscleId: string; role: string; weight: number }>>();
    for (const m of db.exerciseMuscles) {
      let list = musclesByExercise.get(m.exerciseId);
      if (!list) {
        list = [];
        musclesByExercise.set(m.exerciseId, list);
      }
      list.push({ muscleId: m.muscleId, role: m.role, weight: m.weight });
    }

    const equipmentFilter = equipment === "" ? null : validEquipment(equipment);

    const list: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      equipment: string;
      custom: boolean;
      imageThumb: string | null;
      muscles: Array<{ muscleId: string; role: string; weight: number }>;
    }> = [];
    for (const e of exercises) {
      const muscles = musclesByExercise.get(e.id) ?? [];
      if (muscle && !muscles.some((m) => m.muscleId === muscle)) continue;
      if (equipmentFilter && e.equipment !== equipmentFilter) continue;
      if (q && !e.nameAr.toLowerCase().includes(q) && !e.nameEn.toLowerCase().includes(q)) {
        continue;
      }
      list.push({
        id: e.id,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        equipment: e.equipment,
        custom: e.custom,
        imageThumb: e.imageThumb,
        muscles,
      });
    }

    return ok({ exercises: list });
  } catch (e) {
    propagate(e, "failed_to_load_exercises");
  }
}

export function exercisesCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    if (!nameAr && !nameEn) bad("name_required");
    if (nameAr.length > 120 || nameEn.length > 120) bad("name_too_long");
    const finalAr = nameAr || nameEn;
    const finalEn = nameEn || nameAr;

    const equipment =
      body.equipment === undefined ? "other" : validEquipment(body.equipment);
    if (!equipment) bad("invalid_equipment");

    // Muscles: at least one PRIMARY mapping; every muscleId must exist.
    const rawMuscles = Array.isArray(body.muscles) ? body.muscles : [];
    const parsed: Array<{ muscleId: string; role: "primary" | "secondary" }> = [];
    for (const raw of rawMuscles) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("invalid_muscles");
      const r = raw as { muscleId?: unknown; role?: unknown };
      if (typeof r.muscleId !== "string" || !r.muscleId) bad("invalid_muscle_id");
      if (r.role !== "primary" && r.role !== "secondary") bad("invalid_muscle_role");
      if (parsed.some((p) => p.muscleId === r.muscleId)) continue; // dedupe silently
      parsed.push({ muscleId: r.muscleId, role: r.role });
    }
    if (parsed.length === 0 || !parsed.some((p) => p.role === "primary")) {
      bad("primary_muscle_required");
    }
    const knownMuscles = new Set(db.muscleGroups.map((m) => m.id));
    if (parsed.some((p) => !knownMuscles.has(p.muscleId))) bad("unknown_muscle_id");

    // Optional media pair (image / GIF / video + thumbnail).
    const media = resolveExerciseMediaPair(body.image, body.imageThumb);
    if (media.kind === "invalid") bad("invalid_media");

    const now = new Date().toISOString();
    const id = `custom-${uuid()}`;
    db.exercises.push({
      id,
      nameAr: finalAr,
      nameEn: finalEn,
      equipment,
      custom: true,
      deletedAt: null,
      image: media.kind === "set" ? media.image : null,
      imageThumb: media.kind === "set" ? media.imageThumb : null,
      createdAt: now,
      updatedAt: now,
    });
    for (const p of parsed) {
      db.exerciseMuscles.push({
        exerciseId: id,
        muscleId: p.muscleId,
        role: p.role,
        weight: p.role === "primary" ? 1 : 0.5,
      });
    }

    return ok({
      exercise: {
        id,
        nameAr: finalAr,
        nameEn: finalEn,
        equipment,
        custom: true,
        imageThumb: media.kind === "set" ? media.imageThumb : null,
        muscles: parsed.map((p) => ({
          muscleId: p.muscleId,
          role: p.role,
          weight: p.role === "primary" ? 1 : 0.5,
        })),
      },
    });
  } catch (e) {
    propagate(e, "failed_to_create_exercise");
  }
}

/* ── GET/PATCH/DELETE /api/gym/exercises/[id] ─────────────────────── */

/** The exercise row or a NOT_FOUND failure (never returns null). */
function loadExercise(id: string): ExerciseRow {
  const db = getDb();
  const exercise = db.exercises.find((e) => e.id === id && e.deletedAt === null);
  if (!exercise) notFoundWhat("exercise_not_found");
  return exercise;
}

export function exerciseDetail(req: LocalRequest) {
  try {
    const { id } = req.params;
    const exercise = loadExercise(id);
    const muscles = getDb()
      .exerciseMuscles.filter((m) => m.exerciseId === id)
      .map((m) => ({ muscleId: m.muscleId, role: m.role, weight: m.weight }));
    return ok({
      exercise: {
        id: exercise.id,
        nameAr: exercise.nameAr,
        nameEn: exercise.nameEn,
        equipment: exercise.equipment,
        custom: exercise.custom,
        image: exercise.image,
        imageThumb: exercise.imageThumb,
        muscles,
      },
    });
  } catch (e) {
    propagate(e, "failed_to_load_exercise");
  }
}

export function exerciseMediaUpdate(req: LocalRequest) {
  try {
    const { id } = req.params;
    const exercise = loadExercise(id);

    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");

    const media = resolveExerciseMediaPair(body.image, body.imageThumb);
    if (media.kind === "invalid") bad("invalid_media");
    if (media.kind === "absent") bad("media_pair_required");

    exercise.image = media.kind === "set" ? media.image : null;
    exercise.imageThumb = media.kind === "set" ? media.imageThumb : null;
    exercise.updatedAt = new Date().toISOString();

    return ok({
      exercise: {
        id: exercise.id,
        nameAr: exercise.nameAr,
        nameEn: exercise.nameEn,
        equipment: exercise.equipment,
        custom: exercise.custom,
        image: exercise.image,
        imageThumb: exercise.imageThumb,
      },
    });
  } catch (e) {
    propagate(e, "failed_to_update_exercise");
  }
}

export function exerciseDelete(req: LocalRequest) {
  try {
    const { id } = req.params;
    const exercise = loadExercise(id);
    // Soft delete: history/stats keep resolving names; lists filter it out.
    exercise.deletedAt = new Date().toISOString();
    exercise.updatedAt = new Date().toISOString();
    return ok({ deleted: id });
  } catch (e) {
    propagate(e, "failed_to_delete_exercise");
  }
}

/* ── GET /api/gym/stats ───────────────────────────────────────────── */

/** Monday-start week key of a YYYY-MM-DD (pure calendar math, UTC-based). */
function weekStartOf(dateKey: string): string {
  const wd = dayKeyToWeekday(dateKey); // 0 = Sunday
  const mondayOffset = (wd + 6) % 7;
  return addDaysToKey(dateKey, -mondayOffset);
}

const WEIGHT_EPS = 1e-6;

export function gymStats(req: LocalRequest) {
  try {
    const db = getDb();
    const todayKey = resolveTodayKey(req);
    const exerciseId = req.query.get("exerciseId")?.trim() ?? "";

    // one sweep: live workouts + their sets
    const workouts = db.workouts.filter((w) => w.deletedAt === null);
    const liveIds = new Set(workouts.map((w) => w.id));
    const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));
    const allSets = sortRows(
      db.sets.filter((s) => liveIds.has(s.workoutId)),
      [["createdAt", "asc"]]
    );

    // ── weekly volume buckets (8 weeks incl. current, oldest first) ──────
    const currentWeekStart = weekStartOf(todayKey);
    const weeklyVolume: Array<{ weekStart: string; volume: number; setCount: number }> = [];
    const bucketIndex = new Map<string, number>();
    for (let i = 7; i >= 0; i -= 1) {
      const ws = addDaysToKey(currentWeekStart, -7 * i);
      bucketIndex.set(ws, weeklyVolume.length);
      weeklyVolume.push({ weekStart: ws, volume: 0, setCount: 0 });
    }
    for (const s of allSets) {
      if (s.setType === "warmup") continue;
      const wDate = dateByWorkout.get(s.workoutId);
      if (!wDate) continue;
      const idx = bucketIndex.get(weekStartOf(wDate));
      if (idx === undefined) continue; // older than the 8-week window
      weeklyVolume[idx].volume += s.reps * s.weight;
      weeklyVolume[idx].setCount += 1;
    }

    // ── personal records per exercise (work sets only) ──────────────────
    interface PrAcc {
      exerciseId: string;
      maxWeight: number;
      maxWeightReps: number;
      maxE1rm: number;
      maxVolume: number;
      lastDone: string;
      lastAt: string;
    }
    const prAcc = new Map<string, PrAcc>();
    for (const s of allSets) {
      if (s.setType === "warmup") continue;
      let acc = prAcc.get(s.exerciseId);
      if (!acc) {
        acc = {
          exerciseId: s.exerciseId,
          maxWeight: s.weight,
          maxWeightReps: s.reps,
          maxE1rm: epley1RM(s.weight, s.reps),
          maxVolume: s.reps * s.weight,
          lastDone: dateByWorkout.get(s.workoutId) ?? "",
          lastAt: s.createdAt,
        };
        prAcc.set(s.exerciseId, acc);
        continue;
      }
      if (s.weight > acc.maxWeight) {
        acc.maxWeight = s.weight;
        acc.maxWeightReps = s.reps;
      } else if (Math.abs(s.weight - acc.maxWeight) <= WEIGHT_EPS && s.reps > acc.maxWeightReps) {
        acc.maxWeightReps = s.reps;
      }
      acc.maxE1rm = Math.max(acc.maxE1rm, epley1RM(s.weight, s.reps));
      acc.maxVolume = Math.max(acc.maxVolume, s.reps * s.weight);
      if (s.createdAt >= acc.lastAt) {
        acc.lastAt = s.createdAt;
        acc.lastDone = dateByWorkout.get(s.workoutId) ?? acc.lastDone;
      }
    }

    const exIds = [...prAcc.keys()];
    const exercises = exIds.length ? db.exercises.filter((e) => exIds.includes(e.id)) : [];
    const nameById = new Map(exercises.map((e) => [e.id, e]));
    const personalRecords = [...prAcc.values()]
      .map((acc) => {
        const ex = nameById.get(acc.exerciseId);
        return {
          exerciseId: acc.exerciseId,
          nameAr: ex?.nameAr ?? "",
          nameEn: ex?.nameEn ?? "",
          maxWeight: acc.maxWeight,
          maxWeightReps: acc.maxWeightReps,
          maxE1rm: acc.maxE1rm,
          maxVolume: acc.maxVolume,
          lastDone: acc.lastDone,
          lastAt: acc.lastAt,
        };
      })
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));

    // ── per-exercise session history (charts) ───────────────────────────
    let exerciseHistory: Array<{
      workoutId: string;
      date: string;
      e1rm: number;
      volume: number;
      topWeight: number;
      setCount: number;
    }> = [];
    if (exerciseId) {
      const exercise = db.exercises.find((e) => e.id === exerciseId);
      if (!exercise || exercise.deletedAt) notFoundWhat("exercise_not_found");

      const sessions = new Map<
        string,
        { workoutId: string; date: string; e1rm: number; volume: number; topWeight: number; setCount: number }
      >();
      for (const s of allSets) {
        if (s.exerciseId !== exerciseId || s.setType === "warmup") continue;
        const date = dateByWorkout.get(s.workoutId);
        if (!date) continue;
        let sess = sessions.get(s.workoutId);
        if (!sess) {
          sess = {
            workoutId: s.workoutId,
            date,
            e1rm: 0,
            volume: 0,
            topWeight: 0,
            setCount: 0,
          };
          sessions.set(s.workoutId, sess);
        }
        sess.e1rm = Math.max(sess.e1rm, epley1RM(s.weight, s.reps));
        sess.volume += s.reps * s.weight;
        sess.topWeight = Math.max(sess.topWeight, s.weight);
        sess.setCount += 1;
      }
      exerciseHistory = [...sessions.values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.workoutId < b.workoutId ? -1 : 1
      );
    }

    return ok({ today: todayKey, weeklyVolume, personalRecords, exerciseHistory });
  } catch (e) {
    propagate(e, "failed_to_load_stats");
  }
}
