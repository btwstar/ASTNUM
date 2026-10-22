/**
 * POST   /api/demo → seed a realistic demo dataset (idempotent: replaces
 *                    previous demo rows; wipes user-owned rows first).
 * DELETE /api/demo → remove all demo rows (demo:* ids).
 *
 * Pure data comes from src/lib/demo.ts (shared with the offline/APK build).
 * The library seed (exercises/foods/templates/muscles) is ensured first so
 * demo workouts reference real exercise slugs.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { buildDemoData, DEMO_ID_PREFIX } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** User-owned tables wiped before demo insert (library tables untouched). */
async function wipeUserTables(): Promise<void> {
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
    db.bodyCircumferences.deleteMany(),
    db.bodyMeasurements.deleteMany(),
    db.progressPhotos.deleteMany(),
    db.foodLogs.deleteMany(),
    db.waterLogs.deleteMany(),
    db.nutritionGoals.deleteMany(),
  ]);
}

async function removeDemoOnly(): Promise<void> {
  await db.$transaction([
    db.habitLogs.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.streakFreezes.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.habits.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.tasks.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.noteTags.deleteMany({ where: { noteId: { startsWith: DEMO_ID_PREFIX } } }),
    db.tags.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.notes.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.sets.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.workouts.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.bodyMeasurements.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.bodyCircumferences.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.foodLogs.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.waterLogs.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
    db.nutritionGoals.deleteMany({ where: { id: { startsWith: DEMO_ID_PREFIX } } }),
  ]);
}

export async function POST() {
  try {
    await ensureSeed();
    const d = buildDemoData(new Date());

    await wipeUserTables();

    await db.$transaction([
      db.habits.createMany({ data: d.habits }),
      db.habitLogs.createMany({ data: d.habitLogs }),
      db.streakFreezes.createMany({ data: d.freezes }),
      db.notes.createMany({ data: d.notes }),
      db.tags.createMany({ data: d.tags }),
      db.noteTags.createMany({ data: d.noteTags }),
      db.tasks.createMany({ data: d.tasks }),
      db.workouts.createMany({ data: d.workouts }),
      db.sets.createMany({ data: d.sets }),
      db.bodyMeasurements.createMany({ data: d.measurements }),
      db.bodyCircumferences.createMany({ data: d.circumferences }),
      db.foodLogs.createMany({ data: d.foodLogs }),
      db.waterLogs.createMany({ data: d.waterLogs }),
      db.nutritionGoals.createMany({ data: [d.goals!] }),
      db.settings.upsert({
        where: { key: "demo:seeded" },
        create: { key: "demo:seeded", value: new Date().toISOString(), updatedAt: new Date().toISOString() },
        update: { value: new Date().toISOString(), updatedAt: new Date().toISOString() },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
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
      },
    });
  } catch (e) {
    console.error("demo POST error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "demo seed failed" } },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await removeDemoOnly();
    await db.settings.deleteMany({ where: { key: "demo:seeded" } });
    return NextResponse.json({ ok: true, data: { cleared: true } });
  } catch (e) {
    console.error("demo DELETE error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "demo clear failed" } },
      { status: 500 }
    );
  }
}
