/**
 * ASTNUM gym — pure personal-record logic (src/lib/logic/pr.ts).
 *
 * Conventions (frozen module contract):
 *  - All weights are KILOGRAMS (display converts via store weightUnit).
 *  - "History" = every previous set of the exercise EXCLUDING warmup sets
 *    (work + failure count). The caller decides which rows count as history;
 *    detectPrs additionally filters setType === "warmup" defensively.
 *  - A PR is STRICTLY greater than the best in history. Equal-to-best is NOT
 *    a PR (re-lifting your best is repetition, not progress).
 *  - Baseline rule: an exercise with NO history at all has nothing to beat,
 *    so the first work set ever establishes the baseline without celebration
 *    (records exist — see /api/gym/stats — but no "new record" burst on day 1).
 *  - max_reps window: reps records are compared only against sets lifted at
 *    (±2.5%) the same weight ("most reps ever at ~this weight"); if no previous
 *    set exists inside that window there is nothing to beat → no max_reps PR.
 *
 * All functions are pure — no DB, no clock, no i18n. Safe on client + server.
 */

export type PrType = "max_weight" | "max_reps" | "max_e1rm" | "max_volume";

/** Relative half-width of the weight window used for max-reps comparisons. */
export const MAX_REPS_WEIGHT_WINDOW = 0.025; // ±2.5% of the candidate weight

export interface PastSet {
  reps: number;
  weightKg: number;
  /** "warmup" | "work" | "failure" (free string — anything ≠ "warmup" counts) */
  setType: string;
  /** ISO-8601 timestamp */
  createdAt: string;
}

export interface PrCandidate {
  reps: number;
  weightKg: number;
  /** every previous set of this exercise (the function filters warmups out) */
  pastSets: PastSet[];
}

/** Epley estimated 1RM: weight × (1 + reps / 30). */
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Which personal records does the candidate set break?
 * Returns the broken-record types (possibly several at once), [] when none.
 */
export function detectPrs(candidate: PrCandidate): PrType[] {
  const history = candidate.pastSets.filter((s) => s.setType !== "warmup");
  if (history.length === 0) return []; // baseline rule — nothing to beat yet

  const prs: PrType[] = [];

  // max_weight — strictly heavier than every previous work/failure set.
  const bestWeight = Math.max(...history.map((s) => s.weightKg));
  if (candidate.weightKg > bestWeight) prs.push("max_weight");

  // max_reps — strictly more reps than any previous set at ±2.5% the same weight.
  const window = candidate.weightKg * MAX_REPS_WEIGHT_WINDOW;
  const atWeight = history.filter((s) => Math.abs(s.weightKg - candidate.weightKg) <= window);
  if (atWeight.length > 0) {
    const bestReps = Math.max(...atWeight.map((s) => s.reps));
    if (candidate.reps > bestReps) prs.push("max_reps");
  }

  // max_e1rm — strictly better estimated 1RM than any previous set.
  const bestE1rm = Math.max(...history.map((s) => epley1RM(s.weightKg, s.reps)));
  if (epley1RM(candidate.weightKg, candidate.reps) > bestE1rm) prs.push("max_e1rm");

  // max_volume — strictly higher single-set volume (reps × kg) than any previous set.
  const bestVolume = Math.max(...history.map((s) => s.reps * s.weightKg));
  if (candidate.reps * candidate.weightKg > bestVolume) prs.push("max_volume");

  return prs;
}

/**
 * Autofill suggestion for the FAST logger: the last WORK set of the previous
 * session (or of the current one, when the caller passes today's sets).
 * Warmups never seed the next set. Ties on createdAt resolve to the later
 * array entry (insertion order = chronological append).
 */
export function suggestNext(
  lastWorkSets: Array<Pick<PastSet, "reps" | "weightKg" | "setType" | "createdAt">>
): { reps: number; weightKg: number } | null {
  const work = lastWorkSets.filter((s) => s.setType !== "warmup");
  if (work.length === 0) return null;
  let last = work[0];
  for (const s of work) {
    if (s.createdAt >= last.createdAt) last = s;
  }
  return { reps: last.reps, weightKg: last.weightKg };
}
