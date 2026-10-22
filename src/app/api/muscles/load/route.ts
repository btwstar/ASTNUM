/**
 * GET /api/muscles/load?days=7|30 — heatmap aggregation.
 *
 * Joins Sets (of non-deleted Workouts inside the trailing `days` window) with
 * ExerciseMuscles and aggregates per canonical muscle via computeMuscleLoad,
 * then assigns a 0..4 heat level from each muscle's weeklyTarget.
 *
 *   rows   = one (set × exercise-muscle-mapping) pair
 *   window = [today − (days − 1) .. today] (inclusive, local date keys)
 *
 * Response: { periodDays, todayKey, startKey, muscles: [{ ...group, rawSets,
 * weightedSets, volume, lastTrainedAt, level }] }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { addDaysToKey, toLocalDateKey } from "@/lib/i18n/format";
import { computeMuscleLoad, heatLevel, type MuscleLoadRow } from "@/lib/logic/heatmap";
import { ensureSeeded, ok, serverError, validationError, type MuscleGroupDTO } from "../_lib";

export const dynamic = "force-dynamic";

export interface MuscleLoadDTO extends MuscleGroupDTO {
  rawSets: number;
  weightedSets: number;
  volume: number;
  lastTrainedAt: string | null;
  level: 0 | 1 | 2 | 3 | 4;
}

export async function GET(req: NextRequest) {
  try {
    const rawDays = req.nextUrl.searchParams.get("days");
    const days = Number(rawDays);
    if (!Number.isInteger(days) || (days !== 7 && days !== 30)) {
      return validationError("days must be 7 or 30");
    }

    await ensureSeeded();

    const todayKey = toLocalDateKey();
    const startKey = addDaysToKey(todayKey, -(days - 1)); // inclusive window of `days` days

    const [groups, workouts] = await Promise.all([
      db.muscleGroups.findMany({ orderBy: { sortOrder: "asc" } }),
      db.workouts.findMany({
        where: { deletedAt: null, date: { gte: startKey, lte: todayKey } },
        select: { id: true, date: true },
      }),
    ]);

    const rows: MuscleLoadRow[] = [];
    if (workouts.length > 0) {
      const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));
      const sets = await db.sets.findMany({
        where: { workoutId: { in: [...dateByWorkout.keys()] } },
        select: { workoutId: true, exerciseId: true, setType: true, reps: true, weight: true, createdAt: true },
      });
      const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
      const mappings =
        exerciseIds.length > 0
          ? await db.exerciseMuscles.findMany({ where: { exerciseId: { in: exerciseIds } } })
          : [];
      const mappingsByExercise = new Map<string, typeof mappings>();
      for (const m of mappings) {
        const list = mappingsByExercise.get(m.exerciseId);
        if (list) list.push(m);
        else mappingsByExercise.set(m.exerciseId, [m]);
      }

      for (const s of sets) {
        const workoutDate = dateByWorkout.get(s.workoutId);
        if (!workoutDate) continue;
        for (const m of mappingsByExercise.get(s.exerciseId) ?? []) {
          rows.push({
            muscleId: m.muscleId,
            role: m.role === "primary" ? "primary" : "secondary",
            reps: s.reps,
            weightKg: s.weight,
            setType: s.setType,
            workoutDate,
            createdAt: s.createdAt,
          });
        }
      }
    }

    const loads = computeMuscleLoad(
      rows,
      groups.map((g) => g.id)
    );

    const muscles: MuscleLoadDTO[] = groups.map((g) => {
      const load = loads[g.id] ?? {
        muscleId: g.id,
        rawSets: 0,
        weightedSets: 0,
        volume: 0,
        lastTrainedAt: null,
      };
      return {
        id: g.id,
        nameAr: g.nameAr,
        nameEn: g.nameEn,
        svgId: g.svgId,
        region: g.region === "back" ? "back" : "front",
        weeklyTarget: g.weeklyTarget,
        sortOrder: g.sortOrder,
        rawSets: load.rawSets,
        weightedSets: load.weightedSets,
        volume: load.volume,
        lastTrainedAt: load.lastTrainedAt,
        level: heatLevel(load.weightedSets, g.weeklyTarget, days),
      };
    });

    return ok({ periodDays: days, todayKey, startKey, muscles });
  } catch (e) {
    console.error("muscles load GET error", e);
    return serverError("failed_to_load_muscle_load");
  }
}
