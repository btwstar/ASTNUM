/// <reference types="bun-types" />
/**
 * Seed library test. Runs against the dev DB (idempotency matters,
 * not purity): ensureSeed() guards every table by count, so re-running is safe.
 *
 *   bun test tests/seed.test.ts
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { MUSCLE_IDS, MUSCLE_GROUPS } from "../src/lib/seed/data";
import { EXERCISES } from "../src/lib/seed/exercises";
import { FOODS } from "../src/lib/seed/foods";
import { TEMPLATES } from "../src/lib/seed/templates";
import { ensureSeed } from "../src/lib/seed";
import { db } from "../src/lib/db";

const CANONICAL = new Set<string>(MUSCLE_IDS);

describe("ASTNUM seed library", () => {
  beforeAll(async () => {
    await ensureSeed();
  });

  // ── capacity ────────────────────────────────────────────────────────────
  test("seeds exactly the 15 canonical muscle groups", async () => {
    expect(await db.muscleGroups.count()).toBe(15);
  });

  test("seeds at least 160 exercises", async () => {
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(160);
  });

  test("seeds at least 160 foods", async () => {
    expect(await db.foods.count()).toBeGreaterThanOrEqual(160);
  });

  test("seeds at least 6 workout templates", async () => {
    expect(await db.workoutTemplates.count()).toBeGreaterThanOrEqual(6);
  });

  // ── spot checks ────────────────────────────────────────────────────────
  test("bench press maps chest as primary", async () => {
    const row = await db.exerciseMuscles.findUnique({
      where: { exerciseId_muscleId: { exerciseId: "bench-press", muscleId: "chest" } },
    });
    expect(row).not.toBeNull();
    expect(row?.role).toBe("primary");
    expect(row?.weight).toBe(1);
  });

  test("bench press maps triceps as secondary", async () => {
    const row = await db.exerciseMuscles.findUnique({
      where: { exerciseId_muscleId: { exerciseId: "bench-press", muscleId: "triceps" } },
    });
    expect(row).not.toBeNull();
    expect(row?.role).toBe("secondary");
    expect(row?.weight).toBe(0.5);
  });

  test("كشري (koshari) exists in the food library", async () => {
    const koshari = await db.foods.findFirst({ where: { nameAr: { contains: "كشري" } } });
    expect(koshari).not.toBeNull();
    expect(koshari?.kcal).toBeGreaterThan(0);
    expect(koshari?.servingG).not.toBeNull();
  });

  test("all seeded foods are non-custom with a serving size", async () => {
    const bad = await db.foods.count({ where: { custom: true } });
    expect(bad).toBe(0);
    const noServing = await db.foods.count({ where: { servingG: null } });
    expect(noServing).toBe(0);
  });

  // ── data invariants (source arrays) ─────────────────────────────────────
  test("no duplicate exercise slugs", () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no duplicate food slugs", () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every exercise has at least one primary muscle", () => {
    for (const e of EXERCISES) {
      expect(
        e.muscles.some((m) => m.role === "primary"),
        `exercise "${e.id}" has no primary muscle`,
      ).toBe(true);
    }
  });

  test("every muscleId used is canonical, roles/weights are consistent", () => {
    for (const e of EXERCISES) {
      const seen = new Set<string>();
      for (const m of e.muscles) {
        expect(CANONICAL.has(m.muscleId), `exercise "${e.id}" uses unknown muscle "${m.muscleId}"`).toBe(true);
        expect(seen.has(m.muscleId), `exercise "${e.id}" maps muscle "${m.muscleId}" twice`).toBe(false);
        seen.add(m.muscleId);
        if (m.role === "primary") expect(m.weight).toBe(1);
        else if (m.role === "secondary") expect(m.weight).toBe(0.5);
        else throw new Error(`exercise "${e.id}" has invalid role "${m.role}"`);
      }
    }
  });

  test("every canonical muscle has multiple primary exercises", () => {
    for (const id of MUSCLE_IDS) {
      const primaries = EXERCISES.filter((e) => e.muscles.some((m) => m.muscleId === id && m.role === "primary"));
      expect(primaries.length, `muscle "${id}" has ${primaries.length} primary exercises`).toBeGreaterThanOrEqual(2);
    }
  });

  test("all equipment types are covered", () => {
    const equipment = new Set(EXERCISES.map((e) => e.equipment));
    for (const eq of ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"]) {
      expect(equipment.has(eq as (typeof EXERCISES)[number]["equipment"]), `missing equipment "${eq}"`).toBe(true);
    }
  });

  test("muscle groups in DB match the frozen canonical definitions", async () => {
    const rows = await db.muscleGroups.findMany();
    expect(rows.length).toBe(MUSCLE_GROUPS.length);
    for (const m of MUSCLE_GROUPS) {
      const row = rows.find((r) => r.id === m.id);
      expect(row, `missing muscle group "${m.id}" in DB`).toBeDefined();
      expect(row?.nameAr).toBe(m.nameAr);
      expect(row?.region).toBe(m.region);
    }
  });

  test("template exercise prescriptions reference real exercises", () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const tpl of TEMPLATES) {
      expect(tpl.exercises.length).toBeGreaterThanOrEqual(5);
      expect(tpl.exercises.length).toBeLessThanOrEqual(8);
      for (const te of tpl.exercises) {
        expect(ids.has(te.exerciseId), `template "${tpl.id}" references unknown exercise "${te.exerciseId}"`).toBe(true);
        expect(te.targetSets).toBeGreaterThanOrEqual(3);
        expect(te.targetSets).toBeLessThanOrEqual(4);
        expect(te.targetReps).toBeGreaterThanOrEqual(8);
        expect(te.targetReps).toBeLessThanOrEqual(12);
      }
    }
  });

  // ── idempotency ────────────────────────────────────────────────────────
  test("ensureSeed is idempotent (second call changes nothing)", async () => {
    const snapshot = {
      muscles: await db.muscleGroups.count(),
      exercises: await db.exercises.count(),
      mappings: await db.exerciseMuscles.count(),
      templates: await db.workoutTemplates.count(),
      templateExercises: await db.templateExercises.count(),
      foods: await db.foods.count(),
    };
    await ensureSeed(); // second (or third) call must be a no-op
    expect(await db.muscleGroups.count()).toBe(snapshot.muscles);
    expect(await db.exercises.count()).toBe(snapshot.exercises);
    expect(await db.exerciseMuscles.count()).toBe(snapshot.mappings);
    expect(await db.workoutTemplates.count()).toBe(snapshot.templates);
    expect(await db.templateExercises.count()).toBe(snapshot.templateExercises);
    expect(await db.foods.count()).toBe(snapshot.foods);
  });
});
