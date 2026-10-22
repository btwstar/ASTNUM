/**
 * /api/muscles/** — port of the muscle-map API routes (verbatim logic):
 *   src/app/api/muscles/route.ts              (GET the 15 canonical groups)
 *   src/app/api/muscles/load/route.ts         (GET heatmap aggregation)
 *   src/app/api/muscles/targets/route.ts       (PATCH weekly target)
 *   src/app/api/muscles/[id]/exercises/route.ts (GET suggested exercises)
 * plus the muscles/_lib.ts helpers. Heatmap math is REUSED from
 * @/lib/logic/heatmap (computeMuscleLoad / heatLevel) — never duplicated.
 */

import { addDaysToKey, toLocalDateKey } from "@/lib/i18n/format";
import { computeMuscleLoad, heatLevel, type MuscleLoadRow } from "@/lib/logic/heatmap";
import { ensureSeeded, getDb } from "../db";
import { fail, jsonOrNull, ok, propagate, sortRows, type LocalRequest } from "../shared";

interface MuscleGroupDTO {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  region: "front" | "back";
  weeklyTarget: number;
  sortOrder: number;
}

function validationError(message: string): never {
  return fail("VALIDATION", message, 400);
}

function notFoundMsg(message: string): never {
  return fail("NOT_FOUND", message, 404);
}

/* ── GET /api/muscles ─────────────────────────────────────────────── */

export function musclesList() {
  try {
    ensureSeeded();
    const db = getDb();
    const groups = sortRows([...db.muscleGroups], [["sortOrder", "asc"]]);

    const muscles: MuscleGroupDTO[] = groups.map((g) => ({
      id: g.id,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      svgId: g.svgId,
      region: g.region === "back" ? "back" : "front",
      weeklyTarget: g.weeklyTarget,
      sortOrder: g.sortOrder,
    }));

    return ok({ muscles });
  } catch (e) {
    propagate(e, "failed_to_load_muscles");
  }
}

/* ── GET /api/muscles/load?days=7|30 ──────────────────────────────── */

export interface MuscleLoadDTO extends MuscleGroupDTO {
  rawSets: number;
  weightedSets: number;
  volume: number;
  lastTrainedAt: string | null;
  level: 0 | 1 | 2 | 3 | 4;
}

export function musclesLoad(req: LocalRequest) {
  try {
    const db = getDb();
    const rawDays = req.query.get("days");
    const days = Number(rawDays);
    if (!Number.isInteger(days) || (days !== 7 && days !== 30)) {
      validationError("days must be 7 or 30");
    }

    ensureSeeded();

    const todayKey = toLocalDateKey();
    const startKey = addDaysToKey(todayKey, -(days - 1)); // inclusive window

    const groups = sortRows([...db.muscleGroups], [["sortOrder", "asc"]]);
    const workouts = db.workouts.filter(
      (w) => w.deletedAt === null && w.date >= startKey && w.date <= todayKey
    );

    const rows: MuscleLoadRow[] = [];
    if (workouts.length > 0) {
      const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));
      const workoutIds = new Set(workouts.map((w) => w.id));
      const sets = db.sets.filter((s) => workoutIds.has(s.workoutId));
      const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
      const mappings =
        exerciseIds.length > 0
          ? db.exerciseMuscles.filter((m) => exerciseIds.includes(m.exerciseId))
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
    propagate(e, "failed_to_load_muscle_load");
  }
}

/* ── PATCH /api/muscles/targets ───────────────────────────────────── */

export const TARGET_MIN = 4;
export const TARGET_MAX = 40;

export function musclesTargetUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = jsonOrNull(req) as
      | { muscleId?: unknown; weeklyTarget?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      validationError("json body with muscleId and weeklyTarget required");
    }

    const muscleId = typeof body.muscleId === "string" ? body.muscleId : "";
    if (!muscleId) validationError("muscleId required");

    const rawTarget = body.weeklyTarget;
    if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget)) {
      validationError("weeklyTarget must be a number");
    }

    const existing = db.muscleGroups.find((g) => g.id === muscleId);
    if (!existing) notFoundMsg("muscle not found");

    const weeklyTarget = Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(rawTarget)));
    existing.weeklyTarget = weeklyTarget;
    existing.updatedAt = new Date().toISOString();

    return ok({
      muscle: {
        id: existing.id,
        nameAr: existing.nameAr,
        nameEn: existing.nameEn,
        svgId: existing.svgId,
        region: existing.region,
        weeklyTarget: existing.weeklyTarget,
        sortOrder: existing.sortOrder,
      },
    });
  } catch (e) {
    propagate(e, "failed_to_update_target");
  }
}

/* ── GET /api/muscles/[id]/exercises ──────────────────────────────── */

export function muscleExercises(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;

    const muscle = db.muscleGroups.find((g) => g.id === id);
    if (!muscle) notFoundMsg("muscle not found");

    const mappings = db.exerciseMuscles.filter((m) => m.muscleId === id);
    if (mappings.length === 0) return ok({ exercises: [] });

    const exerciseIds = mappings.map((m) => m.exerciseId);
    const exercises = db.exercises.filter((e) => exerciseIds.includes(e.id) && e.deletedAt === null);
    const roleById = new Map(mappings.map((m) => [m.exerciseId, m.role]));

    const list = exercises
      .map((e) => ({
        id: e.id,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        equipment: e.equipment,
        role: roleById.get(e.id) === "primary" ? ("primary" as const) : ("secondary" as const),
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "primary" ? -1 : 1; // primary first
        return a.nameEn.localeCompare(b.nameEn);
      })
      .slice(0, 8);

    return ok({ exercises: list });
  } catch (e) {
    propagate(e, "failed_to_load_exercises");
  }
}
