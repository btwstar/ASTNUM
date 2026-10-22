/**
 * Muscle heatmap engine — PURE logic, no I/O, no i18n, no React.
 *
 * Used by:
 *   - src/app/api/muscles/load/route.ts  (server-side aggregation)
 *   - src/components/muscle-map/**         (client-side insight)
 *   - tests/heatmap.test.ts               (bun:test)
 *
 * Domain rules (frozen contract):
 *   - Warmup sets never count toward raw sets, weighted sets, volume or lastTrainedAt.
 *   - Weighted set = 1.0 for a primary mapping, 0.5 for a secondary mapping
 *     (a set of an exercise that maps to a muscle both ways counts per mapping).
 *   - Volume (kg) = Σ reps × weight over PRIMARY non-warmup rows only.
 *   - Heat levels (0..4) compare weighted sets against the expected count:
 *       expected = weeklyTarget × periodDays / 7
 *       0 = no work | 1 = < 70% | 2 = 70–120% (inclusive) | 3 = >120–150% (inclusive) | 4 = > 150%
 */

/** One joined row = one (set × exercise-muscle-mapping) pair. */
export interface MuscleLoadRow {
  muscleId: string;
  role: "primary" | "secondary";
  reps: number;
  weightKg: number;
  setType: string; // "warmup" | "work" | "failure" — anything other than warmup counts
  workoutDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp (tie-break for lastTrainedAt)
}

export interface MuscleLoadResult {
  muscleId: string;
  /** count of non-warmup rows (integer) */
  rawSets: number;
  /** primary 1.0 / secondary 0.5, warmups excluded */
  weightedSets: number;
  /** Σ reps × weightKg over primary non-warmup rows */
  volume: number;
  /** max workoutDate among non-warmup rows, null when never trained in window */
  lastTrainedAt: string | null;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface NeglectedInsight {
  muscleId: string;
  daysSince: number;
}

/** YYYY-MM-DD day difference (a - b), pure calendar math via UTC. */
export function diffDaysBetween(dateKeyA: string, dateKeyB: string): number {
  const a = Date.parse(`${dateKeyA}T00:00:00Z`);
  const b = Date.parse(`${dateKeyB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

function isWarmup(setType: string): boolean {
  return setType === "warmup";
}

/**
 * Aggregate joined set rows per muscle. Every muscle in `muscleIds` gets an
 * entry (zeros + null lastTrainedAt) even when it has no rows — the map always
 * needs all 15 regions.
 */
export function computeMuscleLoad(
  rows: readonly MuscleLoadRow[],
  muscleIds: readonly string[]
): Record<string, MuscleLoadResult> {
  const result: Record<string, MuscleLoadResult> = {};
  for (const id of muscleIds) {
    result[id] = { muscleId: id, rawSets: 0, weightedSets: 0, volume: 0, lastTrainedAt: null };
  }

  for (const row of rows) {
    const acc = result[row.muscleId];
    if (!acc) continue; // unknown muscle id — ignore (schema guards ids anyway)
    if (isWarmup(row.setType)) continue; // warmups never count

    acc.rawSets += 1;
    acc.weightedSets += row.role === "primary" ? 1 : 0.5;
    if (row.role === "primary") {
      const reps = Number.isFinite(row.reps) && row.reps > 0 ? row.reps : 0;
      const weightKg = Number.isFinite(row.weightKg) && row.weightKg > 0 ? row.weightKg : 0;
      acc.volume += reps * weightKg;
    }
    if (!acc.lastTrainedAt || row.workoutDate > acc.lastTrainedAt) {
      acc.lastTrainedAt = row.workoutDate;
    }
  }

  // Round the half-steps so 0.5 sums stay clean (e.g. 0.1+0.2 float noise).
  for (const id of Object.keys(result)) {
    result[id].weightedSets = Math.round(result[id].weightedSets * 2) / 2;
    result[id].volume = Math.round(result[id].volume * 100) / 100;
  }
  return result;
}

/**
 * Map weighted sets to the 0..4 heat scale.
 *
 * Boundaries (validated by tests — treat the test cases as the contract):
 *   target 10, 7 days → expected 10: 6.99 → 1, 7 → 2, 12 → 2, 12.1 → 3, 15 → 3, 15.1 → 4.
 */
export function heatLevel(weightedSets: number, weeklyTarget: number, periodDays: number): HeatLevel {
  if (!Number.isFinite(weightedSets) || weightedSets <= 0) return 0;
  const expected = (weeklyTarget * periodDays) / 7;
  if (!Number.isFinite(expected) || expected <= 0) return 0;

  const ratio = weightedSets / expected;
  const EPS = 1e-9; // guard against float noise on exact boundaries
  if (ratio < 0.7 - EPS) return 1;
  if (ratio > 1.5 + EPS) return 4;
  if (ratio > 1.2 + EPS) return 3;
  return 2;
}

/**
 * Most-neglected muscle insight.
 *
 * Candidates = muscles with expected > 0 delivering less than 50% of the
 * expected weighted sets. Ranked by ratio (ascending = worst first), ties broken
 * by days since last training (longer = worse).
 *
 * daysSince:
 *   - lastTrainedAt present → todayKey − lastTrainedAt (>= 0, future dates clamp to 0)
 *   - never trained in the window → todayKey − earliest lastTrainedAt in the dataset
 *     (i.e. "not trained since before your earliest logged workout"); 0 when the
 *     dataset holds no training evidence at all.
 *
 * Returns null when there is nothing worth flagging (all muscles ≥ 50% of
 * expected, no candidates, or empty input).
 */
export function neglectedInsight(
  results: readonly (Partial<MuscleLoadResult> & { muscleId: string; weeklyTarget?: number })[],
  targets: Readonly<Record<string, number>> | ReadonlyMap<string, number>,
  todayKey: string,
  periodDays = 7
): NeglectedInsight | null {
  if (!todayKey || results.length === 0) return null;

  const targetOf = (r: { muscleId: string; weeklyTarget?: number }): number => {
    if (targets instanceof Map) {
      const explicit = targets.get(r.muscleId);
      if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
    } else if (targets && typeof targets === "object") {
      const explicit = (targets as Record<string, number>)[r.muscleId];
      if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
    }
    return typeof r.weeklyTarget === "number" && Number.isFinite(r.weeklyTarget) ? r.weeklyTarget : 0;
  };

  const trainedDates: string[] = [];
  for (const r of results) {
    if (typeof r.lastTrainedAt === "string" && r.lastTrainedAt) trainedDates.push(r.lastTrainedAt);
  }
  // earliest training evidence across the whole dataset (fallback reference)
  let earliest: string = todayKey;
  for (const d of trainedDates) {
    if (d < earliest) earliest = d;
  }

  let best: { muscleId: string; daysSince: number; ratio: number } | null = null;
  for (const r of results) {
    const weeklyTarget = targetOf(r);
    const expected = (weeklyTarget * periodDays) / 7;
    if (!(expected > 0)) continue; // no target → no expectation → never "neglected"

    const weightedSets = typeof r.weightedSets === "number" && Number.isFinite(r.weightedSets) ? r.weightedSets : 0;
    const ratio = weightedSets / expected;
    if (ratio >= 0.5) continue; // only flag muscles below 50% of expected

    const daysSince =
      typeof r.lastTrainedAt === "string" && r.lastTrainedAt
        ? Math.max(0, diffDaysBetween(todayKey, r.lastTrainedAt))
        : Math.max(0, diffDaysBetween(todayKey, earliest));

    if (
      !best ||
      ratio < best.ratio - 1e-9 ||
      (Math.abs(ratio - best.ratio) <= 1e-9 && daysSince > best.daysSince)
    ) {
      best = { muscleId: r.muscleId, daysSince, ratio };
    }
  }

  return best ? { muscleId: best.muscleId, daysSince: best.daysSince } : null;
}
