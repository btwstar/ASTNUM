/**
 * /api/demo — port of src/app/api/demo/route.ts (verbatim logic).
 *
 * POST   → seed the realistic demo dataset (idempotent: wipes USER-owned
 *          tables first, then inserts the PURE buildDemoData rows).
 * DELETE → remove all demo rows (demo: id prefix).
 *
 * The dataset itself is REUSED from @/lib/demo (buildDemoData) — never
 * duplicated; deterministic counts live there.
 */

import { buildDemoData, DEMO_ID_PREFIX } from "@/lib/demo";
import { ensureSeeded, getDb, markDirty } from "../db";
import { ok, propagate } from "../shared";

/** User-owned tables wiped before demo insert (library tables untouched). */
function wipeUserTables(): void {
  const db = getDb();
  db.noteTags = [];
  db.tasks = [];
  db.tags = [];
  db.notes = [];
  db.habitLogs = [];
  db.streakFreezes = [];
  db.habits = [];
  db.sets = [];
  db.workouts = [];
  db.bodyCircumferences = [];
  db.bodyMeasurements = [];
  db.progressPhotos = [];
  db.foodLogs = [];
  db.waterLogs = [];
  db.nutritionGoals = [];
}

function removeDemoOnly(): void {
  const db = getDb();
  const isDemo = (id: string | null) => id !== null && id.startsWith(DEMO_ID_PREFIX);
  db.habitLogs = db.habitLogs.filter((r) => !isDemo(r.id));
  db.streakFreezes = db.streakFreezes.filter((r) => !isDemo(r.id));
  db.habits = db.habits.filter((r) => !isDemo(r.id));
  db.tasks = db.tasks.filter((r) => !isDemo(r.id));
  db.noteTags = db.noteTags.filter((r) => !isDemo(r.noteId));
  db.tags = db.tags.filter((r) => !isDemo(r.id));
  db.notes = db.notes.filter((r) => !isDemo(r.id));
  db.sets = db.sets.filter((r) => !isDemo(r.id));
  db.workouts = db.workouts.filter((r) => !isDemo(r.id));
  db.bodyMeasurements = db.bodyMeasurements.filter((r) => !isDemo(r.id));
  db.bodyCircumferences = db.bodyCircumferences.filter((r) => !isDemo(r.id));
  db.foodLogs = db.foodLogs.filter((r) => !isDemo(r.id));
  db.waterLogs = db.waterLogs.filter((r) => !isDemo(r.id));
  db.nutritionGoals = db.nutritionGoals.filter((r) => !isDemo(r.id));
}

export function demoSeed() {
  try {
    const db = getDb();
    ensureSeeded();
    const d = buildDemoData(new Date());

    wipeUserTables();

    db.habits.push(...d.habits);
    db.habitLogs.push(...d.habitLogs);
    db.streakFreezes.push(...d.freezes);
    db.notes.push(...d.notes);
    db.tags.push(...d.tags);
    db.noteTags.push(...d.noteTags);
    db.tasks.push(...d.tasks);
    db.workouts.push(...d.workouts);
    db.sets.push(...d.sets);
    db.bodyMeasurements.push(...d.measurements);
    db.bodyCircumferences.push(...d.circumferences);
    db.foodLogs.push(...d.foodLogs);
    db.waterLogs.push(...d.waterLogs);
    if (d.goals) db.nutritionGoals.push(d.goals);

    const now = new Date().toISOString();
    const flagIndex = db.settings.findIndex((r) => r.key === "demo:seeded");
    if (flagIndex >= 0) {
      db.settings[flagIndex] = { key: "demo:seeded", value: now, updatedAt: now };
    } else {
      db.settings.push({ key: "demo:seeded", value: now, updatedAt: now });
    }

    markDirty();

    return ok({
      seeded: true,
      counts: {
        habits: d.habits.length,
        habitLogs: d.habitLogs.length,
        tasks: d.tasks.length,
        notes: d.notes.length,
        workouts: d.workouts.length,
        sets: d.sets.length,
        measurements: d.measurements.length,
        foodLogs: d.foodLogs.length,
        waterLogs: d.waterLogs.length,
      },
    });
  } catch (e) {
    propagate(e, "demo seed failed");
  }
}

export function demoClear() {
  try {
    const db = getDb();
    removeDemoOnly();
    db.settings = db.settings.filter((r) => r.key !== "demo:seeded");
    markDirty();
    return ok({ cleared: true });
  } catch (e) {
    propagate(e, "demo clear failed");
  }
}
