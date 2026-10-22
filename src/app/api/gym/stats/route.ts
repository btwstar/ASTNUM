/**
 * /api/gym/stats — progress charts.
 *
 * GET ?today=YYYY-MM-DD            → anchor for the "current week" bucket edge.
 * GET ?exerciseId=<id>             → also include that exercise's per-SESSION
 *                                    history for the Recharts line
 *                                    [{date, e1rm, volume, topWeight, setCount}]
 *                                    (oldest first).
 *
 * Response:
 *  weeklyVolume     — 8 Monday-start buckets (current week first from the
 *                     oldest), volume = Σ reps×kg over WORK sets of non-deleted
 *                     workouts; setCount = work sets in the bucket.
 *  personalRecords  — per exercise (work sets only, non-deleted workouts):
 *                     {exerciseId, nameAr, nameEn, maxWeight, maxWeightReps,
 *                      maxE1rm, maxVolume, lastDone} sorted by lastDone desc.
 *  exerciseHistory  — only with ?exerciseId (404 when the exercise is unknown).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { epley1RM } from "@/lib/logic/pr";
import { addDaysToKey, dayKeyToWeekday } from "@/lib/i18n/format";
import { notFound, ok, resolveTodayKey, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

/** Monday-start week key of a YYYY-MM-DD (pure calendar math, UTC-based). */
function weekStartOf(dateKey: string): string {
  const wd = dayKeyToWeekday(dateKey); // 0 = Sunday
  const mondayOffset = (wd + 6) % 7;
  return addDaysToKey(dateKey, -mondayOffset);
}

const WEIGHT_EPS = 1e-6;

export async function GET(req: NextRequest) {
  try {
    const todayKey = resolveTodayKey(req);
    const exerciseId = req.nextUrl.searchParams.get("exerciseId")?.trim() ?? "";

    // one sweep: live workouts + their sets (a personal DB stays tiny; group in JS)
    const workouts = await db.workouts.findMany({
      where: { deletedAt: null },
      select: { id: true, date: true },
    });
    const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));
    const allSets = await db.sets.findMany({
      where: { workoutId: { in: [...dateByWorkout.keys()] } },
      orderBy: { createdAt: "asc" },
    });

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
      lastDone: string; // workout date key of the latest set
      lastAt: string; // latest set createdAt (sort key)
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

    const exercises = prAcc.size
      ? await db.exercises.findMany({
          where: { id: { in: [...prAcc.keys()] } },
          select: { id: true, nameAr: true, nameEn: true },
        })
      : [];
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

    // ── per-exercise session history (charts) ────────────────────────────
    let exerciseHistory: Array<{
      workoutId: string;
      date: string;
      e1rm: number;
      volume: number;
      topWeight: number;
      setCount: number;
    }> = [];
    if (exerciseId) {
      const exercise = await db.exercises.findUnique({ where: { id: exerciseId } });
      if (!exercise || exercise.deletedAt) return notFound("exercise_not_found");

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
    console.error("gym stats GET error", e);
    return serverError("failed_to_load_stats");
  }
}
