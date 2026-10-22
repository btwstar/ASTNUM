/**
 * GET  /api/backup → full JSON export of every table (single file).
 * POST /api/backup → restore from an export (wipes current data first, then inserts).
 * DELETE /api/backup → wipe ALL data (destructive, requires ?confirm=DELETE).
 *
 * Local-first: the file stays on the user's device unless they share it.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface BackupPayload {
  version: 1;
  exportedAt: string;
  tables: {
    habits?: unknown[];
    habitLogs?: unknown[];
    streakFreezes?: unknown[];
    notes?: unknown[];
    tasks?: unknown[];
    tags?: unknown[];
    noteTags?: unknown[];
    exercises?: unknown[];
    muscleGroups?: unknown[];
    exerciseMuscles?: unknown[];
    workoutTemplates?: unknown[];
    templateExercises?: unknown[];
    workouts?: unknown[];
    sets?: unknown[];
    bodyMeasurements?: unknown[];
    bodyCircumferences?: unknown[];
    progressPhotos?: unknown[];
    foods?: unknown[];
    foodLogs?: unknown[];
    waterLogs?: unknown[];
    nutritionGoals?: unknown[];
    settings?: unknown[];
  };
}

const TABLE_KEYS = [
  "habits",
  "habitLogs",
  "streakFreezes",
  "notes",
  "tasks",
  "tags",
  "noteTags",
  "exercises",
  "muscleGroups",
  "exerciseMuscles",
  "workoutTemplates",
  "templateExercises",
  "workouts",
  "sets",
  "bodyMeasurements",
  "bodyCircumferences",
  "progressPhotos",
  "foods",
  "foodLogs",
  "waterLogs",
  "nutritionGoals",
  "settings",
] as const;

async function exportAll(): Promise<BackupPayload> {
  const [
    habits, habitLogs, streakFreezes, notes, tasks, tags, noteTags,
    exercises, muscleGroups, exerciseMuscles, workoutTemplates, templateExercises,
    workouts, sets, bodyMeasurements, bodyCircumferences, progressPhotos,
    foods, foodLogs, waterLogs, nutritionGoals, settings,
  ] = await Promise.all([
    db.habits.findMany(), db.habitLogs.findMany(), db.streakFreezes.findMany(),
    db.notes.findMany(), db.tasks.findMany(), db.tags.findMany(), db.noteTags.findMany(),
    db.exercises.findMany(), db.muscleGroups.findMany(), db.exerciseMuscles.findMany(),
    db.workoutTemplates.findMany(), db.templateExercises.findMany(),
    db.workouts.findMany(), db.sets.findMany(),
    db.bodyMeasurements.findMany(), db.bodyCircumferences.findMany(), db.progressPhotos.findMany(),
    db.foods.findMany(), db.foodLogs.findMany(), db.waterLogs.findMany(), db.nutritionGoals.findMany(),
    db.settings.findMany(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      habits, habitLogs, streakFreezes, notes, tasks, tags, noteTags,
      exercises, muscleGroups, exerciseMuscles, workoutTemplates, templateExercises,
      workouts, sets, bodyMeasurements, bodyCircumferences, progressPhotos,
      foods, foodLogs, waterLogs, nutritionGoals, settings,
    },
  };
}

async function wipeAll(): Promise<void> {
  // child/leaf tables first to respect logical dependencies
  await db.$transaction([
    db.noteTags.deleteMany(),
    db.tasks.deleteMany(),
    db.tags.deleteMany(),
    db.notes.deleteMany(),
    db.habitLogs.deleteMany(),
    db.streakFreezes.deleteMany(),
    db.habits.deleteMany(),
    db.sets.deleteMany(),
    db.workouts.deleteMany(),
    db.templateExercises.deleteMany(),
    db.workoutTemplates.deleteMany(),
    db.exerciseMuscles.deleteMany(),
    db.exercises.deleteMany(),
    db.muscleGroups.deleteMany(),
    db.bodyCircumferences.deleteMany(),
    db.bodyMeasurements.deleteMany(),
    db.progressPhotos.deleteMany(),
    db.foodLogs.deleteMany(),
    db.waterLogs.deleteMany(),
    db.foods.deleteMany(),
    db.nutritionGoals.deleteMany(),
    db.settings.deleteMany(),
  ]);
}

export async function GET() {
  try {
    const payload = await exportAll();
    return NextResponse.json({ ok: true, data: payload });
  } catch (e) {
    console.error("backup GET error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "export failed" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BackupPayload>;
    if (!body || body.version !== 1 || !body.tables) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "invalid backup file (expected version 1 with tables)" } },
        { status: 400 }
      );
    }

    const t = body.tables;
    const rows = (key: (typeof TABLE_KEYS)[number]): unknown[] =>
      Array.isArray(t[key]) ? (t[key] as unknown[]) : [];

    const counts: Record<string, number> = {};

    await wipeAll();

    // seeds first so FK-like references stay valid, then user data
    await db.$transaction(async (tx) => {
      if (rows("muscleGroups").length) { await tx.muscleGroups.createMany({ data: rows("muscleGroups") as never[] }); counts.muscleGroups = rows("muscleGroups").length; }
      if (rows("exercises").length) { await tx.exercises.createMany({ data: rows("exercises") as never[] }); counts.exercises = rows("exercises").length; }
      if (rows("exerciseMuscles").length) { await tx.exerciseMuscles.createMany({ data: rows("exerciseMuscles") as never[] }); }
      if (rows("workoutTemplates").length) { await tx.workoutTemplates.createMany({ data: rows("workoutTemplates") as never[] }); }
      if (rows("templateExercises").length) { await tx.templateExercises.createMany({ data: rows("templateExercises") as never[] }); }
      if (rows("foods").length) { await tx.foods.createMany({ data: rows("foods") as never[] }); }
      if (rows("habits").length) { await tx.habits.createMany({ data: rows("habits") as never[] }); }
      if (rows("habitLogs").length) { await tx.habitLogs.createMany({ data: rows("habitLogs") as never[] }); }
      if (rows("streakFreezes").length) { await tx.streakFreezes.createMany({ data: rows("streakFreezes") as never[] }); }
      if (rows("notes").length) { await tx.notes.createMany({ data: rows("notes") as never[] }); }
      if (rows("tags").length) { await tx.tags.createMany({ data: rows("tags") as never[] }); }
      if (rows("noteTags").length) { await tx.noteTags.createMany({ data: rows("noteTags") as never[] }); }
      if (rows("tasks").length) { await tx.tasks.createMany({ data: rows("tasks") as never[] }); }
      if (rows("workouts").length) { await tx.workouts.createMany({ data: rows("workouts") as never[] }); }
      if (rows("sets").length) { await tx.sets.createMany({ data: rows("sets") as never[] }); }
      if (rows("bodyMeasurements").length) { await tx.bodyMeasurements.createMany({ data: rows("bodyMeasurements") as never[] }); }
      if (rows("bodyCircumferences").length) { await tx.bodyCircumferences.createMany({ data: rows("bodyCircumferences") as never[] }); }
      if (rows("progressPhotos").length) { await tx.progressPhotos.createMany({ data: rows("progressPhotos") as never[] }); }
      if (rows("foodLogs").length) { await tx.foodLogs.createMany({ data: rows("foodLogs") as never[] }); }
      if (rows("waterLogs").length) { await tx.waterLogs.createMany({ data: rows("waterLogs") as never[] }); }
      if (rows("nutritionGoals").length) { await tx.nutritionGoals.createMany({ data: rows("nutritionGoals") as never[] }); }
      if (rows("settings").length) { await tx.settings.createMany({ data: rows("settings") as never[] }); }
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0) + Object.keys(counts).length * 0;
    return NextResponse.json({ ok: true, data: { restored: true, counts, totalTables: Object.keys(counts).length + total * 0 } });
  } catch (e) {
    console.error("backup POST error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "restore failed — data may be inconsistent, import your backup again" } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const confirm = req.nextUrl.searchParams.get("confirm");
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message: "missing confirm=DELETE" } },
      { status: 400 }
    );
  }
  try {
    await wipeAll();
    return NextResponse.json({ ok: true, data: { wiped: true } });
  } catch (e) {
    console.error("backup DELETE error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "wipe failed" } },
      { status: 500 }
    );
  }
}
