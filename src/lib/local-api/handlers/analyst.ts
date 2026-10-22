/**
 * /api/analyst — offline port of the analyst route.
 *
 * GET ?lang=(ar|en)&today=(YYYY-MM-DD) → { insights } computed from the
 * in-browser database with the SAME pure engine (@/lib/logic/analyst) the
 * server route uses — the analyst is 100% offline-capable by design
 * (this is the module that replaced the AI assistant, which could never
 * work inside the APK).
 */

import { toLocalDateKey } from "@/lib/i18n/format";
import { computeAnalystInsights, type AnalystSnapshot } from "@/lib/logic/analyst";
import { getDb } from "../db";
import { ok, propagate, type LocalRequest } from "../shared";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function analystGet(req: LocalRequest) {
  try {
    const db = getDb();
    const lang = req.query.get("lang") === "en" ? "en" : "ar";
    const todayParam = req.query.get("today") ?? "";
    const nowKey = DATE_KEY_RE.test(todayParam) ? todayParam : toLocalDateKey();

    const liveHabits = db.habits.filter((h) => h.deletedAt === null && !h.archived);
    const liveHabitIds = new Set(liveHabits.map((h) => h.id));

    const freezesByHabit: Record<string, string[]> = {};
    for (const f of db.streakFreezes) {
      (freezesByHabit[f.habitId] ??= []).push(f.date);
    }

    const measurements = db.bodyMeasurements
      .filter((m) => typeof m.weight === "number" && m.weight !== null)
      .map((m) => ({ date: m.date, weight: m.weight as number }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const goalsRow = db.nutritionGoals[0] ?? null;

    const snapshot: AnalystSnapshot = {
      nowKey,
      habits: liveHabits.map((h) => ({ id: h.id, name: h.name, scheduleJson: h.scheduleJson })),
      habitLogs: db.habitLogs
        .filter((l) => liveHabitIds.has(l.habitId))
        .map((l) => ({ habitId: l.habitId, date: l.date, done: l.done })),
      freezesByHabit,
      workouts: db.workouts
        .filter((w) => w.deletedAt === null)
        .map((w) => ({
          id: w.id,
          date: w.date,
          completedAt: w.completedAt,
          durationSec: w.durationSec,
        })),
      sets: db.sets.map((s) => ({
        workoutId: s.workoutId,
        exerciseId: s.exerciseId,
        setType: s.setType,
        reps: s.reps,
        weight: s.weight,
      })),
      exercises: db.exercises.map((e) => ({ id: e.id, nameAr: e.nameAr, nameEn: e.nameEn })),
      muscleGroups: db.muscleGroups.map((m) => ({
        id: m.id,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
      })),
      exerciseMuscles: db.exerciseMuscles,
      measurements,
      foodLogs: db.foodLogs.map((l) => ({ date: l.date, kcal: l.kcal, protein: l.protein })),
      goals: goalsRow ? { kcal: goalsRow.kcal, protein: goalsRow.protein } : null,
      tasks: db.tasks
        .filter((t) => t.deletedAt === null)
        .map((t) => ({ done: t.done, doneAt: t.doneAt })),
    };

    const insights = computeAnalystInsights(snapshot, lang);
    return ok({ insights });
  } catch (e) {
    propagate(e, "failed to analyze your data");
  }
}
