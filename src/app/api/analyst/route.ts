/**
 * /api/analyst — the Statistics engine route (v1.9: الإحصائيات).
 *
 * GET ?lang=(ar|en)&today=(YYYY-MM-DD)
 *   → { insights: AnalystInsight[] } — 16 deterministic statistics computed
 *     from the user's own data (today's volume, week vs last week, weight
 *     change, tasks completed, total completions, streaks, calories…).
 *     Pure logic lives in @/lib/logic/analyst (shared with the offline
 *     adapter); this route only builds the snapshot from Prisma.
 *
 * Envelope contract: { ok: true, data } | { ok: false, error: { code, message } }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import {
  computeAnalystInsights,
  type AnalystSnapshot,
} from "@/lib/logic/analyst";

export const dynamic = "force-dynamic";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const lang = sp.get("lang") === "en" ? "en" : "ar";
    const todayParam = sp.get("today") ?? "";
    const nowKey = DATE_KEY_RE.test(todayParam) ? todayParam : toLocalDateKey();

    /* ── snapshot from Prisma (single sweep per table) ─────────── */
    const [habits, habitLogs, freezes, workouts, sets, exercises, muscleGroups, exerciseMuscles, measurements, foodLogs, goalsRows, tasks] =
      await Promise.all([
        db.habits.findMany({
          where: { deletedAt: null, archived: false },
          select: { id: true, name: true, scheduleJson: true },
        }),
        db.habitLogs.findMany({ select: { habitId: true, date: true, done: true } }),
        db.streakFreezes.findMany({ select: { habitId: true, date: true } }),
        db.workouts.findMany({
          where: { deletedAt: null },
          select: { id: true, date: true, completedAt: true, durationSec: true },
        }),
        db.sets.findMany({
          select: { workoutId: true, exerciseId: true, setType: true, reps: true, weight: true },
        }),
        db.exercises.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
        db.muscleGroups.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
        db.exerciseMuscles.findMany({
          select: { exerciseId: true, muscleId: true, role: true, weight: true },
        }),
        db.bodyMeasurements.findMany({
          where: { weight: { not: null } },
          select: { date: true, weight: true },
          orderBy: { date: "asc" },
        }),
        db.foodLogs.findMany({ select: { date: true, kcal: true, protein: true } }),
        db.nutritionGoals.findMany({ select: { kcal: true, protein: true } }),
        db.tasks.findMany({
          where: { deletedAt: null },
          select: { done: true, doneAt: true },
        }),
      ]);

    const freezesByHabit: Record<string, string[]> = {};
    for (const f of freezes) {
      (freezesByHabit[f.habitId] ??= []).push(f.date);
    }

    const liveHabitIds = new Set(habits.map((h) => h.id));
    const snapshot: AnalystSnapshot = {
      nowKey,
      habits,
      habitLogs: habitLogs.filter((l) => liveHabitIds.has(l.habitId)),
      freezesByHabit,
      workouts,
      sets,
      exercises,
      muscleGroups,
      exerciseMuscles,
      measurements: measurements.map((m) => ({ date: m.date, weight: m.weight as number })),
      foodLogs,
      goals: goalsRows.length
        ? { kcal: goalsRows[0].kcal, protein: goalsRows[0].protein }
        : null,
      tasks,
    };

    const insights = computeAnalystInsights(snapshot, lang);
    return Response.json({ ok: true, data: { insights } });
  } catch (e) {
    console.error("analyst GET error", e);
    return Response.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "failed to analyze your data" } },
      { status: 500 }
    );
  }
}
