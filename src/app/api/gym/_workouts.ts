/**
 * Shared workout helpers for gym routes (server-only).
 * Private module so route files export HTTP handlers only (Next validates
 * route exports).
 */
import { db } from "@/lib/db";

export interface WorkoutSummary {
  id: string;
  date: string;
  templateId: string | null;
  name: string | null;
  durationSec: number;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  volume: number;
  setCount: number;
  workSetCount: number;
}

type WorkoutRow = {
  id: string;
  date: string;
  templateId: string | null;
  name: string | null;
  durationSec: number;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** Summarize workouts with per-set aggregates (single sets fetch, no N+1). */
export async function summarizeWorkouts(
  workoutRows: WorkoutRow[]
): Promise<WorkoutSummary[]> {
  const ids = workoutRows.map((w) => w.id);
  const sets = ids.length
    ? await db.sets.findMany({ where: { workoutId: { in: ids } } })
    : [];
  const byWorkout = new Map<
    string,
    { volume: number; setCount: number; workSetCount: number }
  >();
  for (const w of workoutRows) {
    byWorkout.set(w.id, { volume: 0, setCount: 0, workSetCount: 0 });
  }
  for (const s of sets) {
    const agg = byWorkout.get(s.workoutId);
    if (!agg) continue;
    agg.setCount += 1;
    if (s.setType !== "warmup") {
      agg.workSetCount += 1;
      agg.volume += s.reps * s.weight;
    }
  }
  return workoutRows.map((w) => ({
    id: w.id,
    date: w.date,
    templateId: w.templateId,
    name: w.name,
    durationSec: w.durationSec,
    notes: w.notes,
    completedAt: w.completedAt,
    createdAt: w.createdAt,
    ...(byWorkout.get(w.id) ?? { volume: 0, setCount: 0, workSetCount: 0 }),
  }));
}

/** Prisma select shape matching WorkoutRow (used by callers that query raw rows). */
export const WORKOUT_ROW_SELECT = {
  id: true,
  date: true,
  templateId: true,
  name: true,
  durationSec: true,
  notes: true,
  completedAt: true,
  createdAt: true,
} as const;
