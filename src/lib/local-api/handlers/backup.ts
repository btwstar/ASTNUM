/**
 * /api/backup — port of src/app/api/backup/route.ts (verbatim logic).
 *
 * GET    → full JSON export of every table (single file).
 * POST   → restore from an export (wipe current data first, then insert).
 * DELETE → wipe ALL data (requires ?confirm=DELETE).
 *
 * The restore counts quirk is preserved 1:1: only muscleGroups/exercises are
 * counted, and totalTables = keys(counts).length (the server's `* 0` math).
 */

import {
  getDb,
  markDirty,
  TABLE_KEYS,
  type TableKey,
  type NoteRow,
  type ExerciseRow,
  type HabitRow,
  type FoodRow,
} from "../db";
import { fail, ok, propagate, rawJson, type LocalRequest } from "../shared";

interface BackupPayload {
  version: 1;
  exportedAt: string;
  tables: Partial<Record<TableKey, unknown[]>>;
}

function exportAll(): BackupPayload {
  const db = getDb();
  const tables: Partial<Record<TableKey, unknown[]>> = {};
  for (const key of TABLE_KEYS) {
    tables[key] = [...(db[key] as unknown[])] as unknown[];
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

function wipeAll(): void {
  const db = getDb();
  const tables = db as unknown as Record<TableKey, unknown[]>;
  for (const key of TABLE_KEYS) {
    tables[key] = [];
  }
}

export function backupExport(): BackupPayload {
  try {
    return ok(exportAll());
  } catch (e) {
    propagate(e, "export failed");
  }
}

export function backupRestore(req: LocalRequest) {
  try {
    const body = rawJson(req) as Partial<BackupPayload> | null;
    if (!body || body.version !== 1 || !body.tables) {
      fail("VALIDATION", "invalid backup file (expected version 1 with tables)", 400);
    }

    const db = getDb();
    const t = body.tables;
    const rows = (key: TableKey): unknown[] =>
      Array.isArray(t[key]) ? (t[key] as unknown[]) : [];

    const counts: Record<string, number> = {};

    wipeAll();

    // seeds first so FK-like references stay valid, then user data
    if (rows("muscleGroups").length) {
      db.muscleGroups = rows("muscleGroups") as never;
      counts.muscleGroups = rows("muscleGroups").length;
    }
    if (rows("exercises").length) {
      // normalize pre-v1.7 backups (no media pair) so the row type holds
      db.exercises = (rows("exercises") as ExerciseRow[]).map((e) => ({
        ...e,
        image: e.image ?? null,
        imageThumb: e.imageThumb ?? null,
      }));
      counts.exercises = rows("exercises").length;
    }
    if (rows("exerciseMuscles").length) db.exerciseMuscles = rows("exerciseMuscles") as never;
    if (rows("workoutTemplates").length) db.workoutTemplates = rows("workoutTemplates") as never;
    if (rows("templateExercises").length) db.templateExercises = rows("templateExercises") as never;
    if (rows("foods").length) {
      // normalize pre-v1.13 backups (no photo pair) so the row type holds
      // (foods stay UNCOUNTED — the server's restore-counts quirk is 1:1)
      db.foods = (rows("foods") as FoodRow[]).map((f) => ({
        ...f,
        image: f.image ?? null,
        imageThumb: f.imageThumb ?? null,
      }));
    }
    if (rows("habits").length) {
      // normalize pre-v1.7 backups (no gymTemplateId) so the row type holds
      db.habits = (rows("habits") as HabitRow[]).map((h) => ({
        ...h,
        gymTemplateId: h.gymTemplateId ?? null,
      }));
    }
    if (rows("habitLogs").length) db.habitLogs = rows("habitLogs") as never;
    if (rows("streakFreezes").length) db.streakFreezes = rows("streakFreezes") as never;
    if (rows("notes").length) {
      // normalize pre-v1.4 backups (no image pair) so the row type holds
      db.notes = (rows("notes") as NoteRow[]).map((n) => ({
        ...n,
        image: n.image ?? null,
        imageThumb: n.imageThumb ?? null,
      }));
    }
    if (rows("tags").length) db.tags = rows("tags") as never;
    if (rows("noteTags").length) db.noteTags = rows("noteTags") as never;
    if (rows("tasks").length) db.tasks = rows("tasks") as never;
    if (rows("workouts").length) db.workouts = rows("workouts") as never;
    if (rows("sets").length) db.sets = rows("sets") as never;
    if (rows("bodyMeasurements").length) db.bodyMeasurements = rows("bodyMeasurements") as never;
    if (rows("bodyCircumferences").length) {
      db.bodyCircumferences = rows("bodyCircumferences") as never;
    }
    if (rows("progressPhotos").length) db.progressPhotos = rows("progressPhotos") as never;
    if (rows("foodLogs").length) db.foodLogs = rows("foodLogs") as never;
    if (rows("nutritionGoals").length) db.nutritionGoals = rows("nutritionGoals") as never;
    if (rows("settings").length) db.settings = rows("settings") as never;

    markDirty();

    const total = Object.values(counts).reduce((a, b) => a + b, 0) + Object.keys(counts).length * 0;
    return ok({
      restored: true,
      counts,
      totalTables: Object.keys(counts).length + total * 0,
    });
  } catch (e) {
    propagate(
      e,
      "restore failed — data may be inconsistent, import your backup again"
    );
  }
}

export function backupWipe(req: LocalRequest) {
  const confirm = req.query.get("confirm");
  if (confirm !== "DELETE") {
    fail("VALIDATION", "missing confirm=DELETE", 400);
  }
  try {
    wipeAll();
    markDirty();
    return ok({ wiped: true });
  } catch (e) {
    propagate(e, "wipe failed");
  }
}
