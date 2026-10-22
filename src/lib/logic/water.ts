/**
 * Pure hydration math (v2.4) — mirrors the calories module's conventions.
 *
 * Water needs are estimated from the SAME body profile the calorie
 * calculator already collects (weight + activity), exactly like the
 * Mifflin-St Jeor macro targets:
 *
 *   baseline   = weightKg × 35 ml/day          (weight-based adequacy used
 *                                                widely by fitness apps)
 *   activity   = (activity − 1.2) × 1000 ml     (sedentary +0 … athlete +700)
 *   goal add-on: cut +250 · maintain +0 · bulk +500   (training/sweat proxy)
 *
 * SAFETY: clamped to [MIN_WATER_ML, MAX_WATER_ML], rounded to the nearest
 * ROUND_STEP_ML (50) so the goal always reads like a real glass count.
 *
 * Units: millilitres end-to-end (STORAGE unit); callers format for display
 * (ml, or fl-oz when the app's weight unit is lb).
 */

export type WaterActivityLevel = 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
export type WaterGoalProfile = "cut" | "maintain" | "bulk";

export interface WaterInput {
  weightKg: number;
  activity: WaterActivityLevel;
  goal: WaterGoalProfile;
}

export interface WaterTarget {
  /** baseline = weight × 35 ml */
  baselineMl: number;
  /** activity + goal add-ons */
  extraMl: number;
  /** the daily hydration target, ml (rounded to a 50 ml step) */
  waterMl: number;
  /** the target hit the safety floor/ceiling (shown as a hint) */
  clamped: boolean;
}

/** ml per kg of body weight per day. */
export const ML_PER_KG = 35;

/** Sedentary multiplier — the subtrahend of the activity extra. */
export const SEDENTARY_FACTOR = 1.2;

/** Safety floor — never suggest less than this (≈5 glasses). */
export const MIN_WATER_ML = 1200;

/** Safety ceiling — never suggest more than this without a doctor's say-so. */
export const MAX_WATER_ML = 5000;

/** Rounding step so goals read like real glass counts (2,700 not 2,747). */
export const ROUND_STEP_ML = 50;

/** Goal add-ons: cut +250 (ketogenesis/diuresis proxy), bulk +500 (training). */
export const WATER_GOAL_EXTRA_ML: Record<WaterGoalProfile, number> = {
  cut: 250,
  maintain: 0,
  bulk: 500,
};

export function waterTargetMl(input: WaterInput): WaterTarget {
  const { weightKg, activity, goal } = input;

  const baselineMl = weightKg * ML_PER_KG;
  const activityMl = (activity - SEDENTARY_FACTOR) * 1000;
  const extraMl = activityMl + WATER_GOAL_EXTRA_ML[goal];

  let waterMl = baselineMl + extraMl;
  let clamped = false;

  if (waterMl < MIN_WATER_ML) {
    waterMl = MIN_WATER_ML;
    clamped = true;
  } else if (waterMl > MAX_WATER_ML) {
    waterMl = MAX_WATER_ML;
    clamped = true;
  }

  // round to the nearest step (away from the floor only when safe)
  waterMl = Math.round(waterMl / ROUND_STEP_ML) * ROUND_STEP_ML;
  if (waterMl < MIN_WATER_ML) waterMl = MIN_WATER_ML;

  return { baselineMl, extraMl, waterMl, clamped };
}

/** UI rounding for manual entries (nearest 10 ml). */
export function roundWaterMl(ml: number): number {
  return Math.round(ml / 10) * 10;
}

/* ── display helpers (ml ↔ fl-oz for lb-based locales) ────────────────── */

const ML_PER_FL_OZ = 29.5735;

export function mlToFlOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

export function flOzToMl(oz: number): number {
  return oz * ML_PER_FL_OZ;
}
