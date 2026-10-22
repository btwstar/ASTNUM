/**
 * Pure calorie / macro math (Mifflin-St Jeor) .
 *
 * Conventions:
 *  - weight in kg, height in cm (STORAGE units; callers convert display units).
 *  - BMR = 10*kg + 6.25*cm - 5*age + (male ? +5 : -161)
 *  - TDEE = BMR * activity
 *  - goal factor: cut ×0.8 | maintain ×1 | bulk ×1.1
 *  - SAFETY: never below MIN_SAFE_KCAL (male 1500 / female 1200) → capped = true.
 *  - protein: cut 2.2 g/kg | maintain & bulk 1.8 g/kg
 *  - fat: 25 % of kcal / 9
 *  - carbs: remainder / 4 with a 50 g floor; if the floor hits, kcal is
 *    recomputed from the macros so kcal == protein*4 + carbs*4 + fat*9.
 */

export type Sex = "male" | "female";
export type ActivityLevel = 1.2 | 1.375 | 1.55 | 1.725 | 1.9; // sedentary..athlete
export type FitnessGoal = "cut" | "maintain" | "bulk";

export interface NutritionInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: FitnessGoal;
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  capped: boolean;
}

export const MIN_SAFE_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

/** Minimum carbs (grams) — a hard floor for brain/glycogen sanity. */
export const MIN_SAFE_CARBS_G = 50;

export const GOAL_FACTOR: Record<FitnessGoal, number> = {
  cut: 0.8,
  maintain: 1,
  bulk: 1.1,
};

export const PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  cut: 2.2,
  maintain: 1.8,
  bulk: 1.8,
};

/** Fat share of total calories (25 %) divided by 9 kcal/g. */
export const FAT_KCAL_SHARE = 0.25;

export function mifflinStJeor(input: NutritionInput): NutritionTargets {
  const { sex, weightKg, heightCm, age, activity, goal } = input;

  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const tdee = bmr * activity;

  let kcal = tdee * GOAL_FACTOR[goal];
  let capped = false;
  const minSafe = MIN_SAFE_KCAL[sex];
  if (kcal < minSafe) {
    kcal = minSafe;
    capped = true;
  }

  const proteinG = PROTEIN_PER_KG[goal] * weightKg;
  const fatG = (kcal * FAT_KCAL_SHARE) / 9;

  let carbsG = (kcal - proteinG * 4 - fatG * 9) / 4;
  if (carbsG < MIN_SAFE_CARBS_G) {
    // Floor hit → recompute kcal from the actual macros so everything adds up.
    carbsG = MIN_SAFE_CARBS_G;
    kcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  }

  return { bmr, tdee, kcal, proteinG, carbsG, fatG, capped };
}

/** Rounding used by the UI (full precision stays in the returned targets). */
export function roundTargets(t: NutritionTargets): NutritionTargets {
  return {
    bmr: Math.round(t.bmr),
    tdee: Math.round(t.tdee),
    kcal: Math.round(t.kcal),
    proteinG: Math.round(t.proteinG),
    carbsG: Math.round(t.carbsG),
    fatG: Math.round(t.fatG),
    capped: t.capped,
  };
}
