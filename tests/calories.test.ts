import { describe, expect, test } from "bun:test";

import {
  mifflinStJeor,
  MIN_SAFE_KCAL,
  type NutritionInput,
} from "../src/lib/logic/calories";

/**
 * Mifflin-St Jeor contract:
 *   BMR = 10*kg + 6.25*cm - 5*age + (male ? 5 : -161)
 *   TDEE = BMR * activity
 *   cut ×0.8 | maintain ×1 | bulk ×1.1, floored by MIN_SAFE_KCAL.
 *
 * NOTE: the task brief quoted "80kg/175cm/28y → 1803.75" but the formula's
 * arithmetic is 800 + 1093.75 − 140 + 5 = 1758.75. The formula is the frozen
 * contract, so these tests assert the mathematically correct value.
 */

const MALE: NutritionInput = {
  sex: "male",
  weightKg: 80,
  heightCm: 175,
  age: 28,
  activity: 1.55,
  goal: "maintain",
};

describe("mifflinStJeor — BMR", () => {
  test("male 80kg/175cm/28y → BMR 1758.75 (+5 offset)", () => {
    const t = mifflinStJeor({ ...MALE });
    expect(t.bmr).toBeCloseTo(1758.75, 6);
    expect(t.tdee).toBeCloseTo(1758.75 * 1.55, 6); // 2726.0625
    expect(t.kcal).toBeCloseTo(t.tdee, 6); // maintain
    expect(t.capped).toBe(false);
  });

  test("female 60kg/165cm/30y → BMR 1320.25 (−161 offset)", () => {
    const t = mifflinStJeor({
      sex: "female",
      weightKg: 60,
      heightCm: 165,
      age: 30,
      activity: 1.55,
      goal: "maintain",
    });
    // 600 + 1031.25 - 150 - 161 = 1320.25
    expect(t.bmr).toBeCloseTo(1320.25, 6);
    expect(t.tdee).toBeCloseTo(1320.25 * 1.55, 6);
  });
});

describe("mifflinStJeor — goal factors", () => {
  test("cut = TDEE × 0.8 with 2.2 g/kg protein", () => {
    const t = mifflinStJeor({ ...MALE, goal: "cut" });
    expect(t.kcal).toBeCloseTo(t.tdee * 0.8, 6);
    expect(t.proteinG).toBeCloseTo(2.2 * 80, 6); // 176
    expect(t.capped).toBe(false);
  });

  test("maintain = TDEE with 1.8 g/kg protein", () => {
    const t = mifflinStJeor({ ...MALE, goal: "maintain" });
    expect(t.kcal).toBeCloseTo(t.tdee, 6);
    expect(t.proteinG).toBeCloseTo(1.8 * 80, 6); // 144
  });

  test("bulk = TDEE × 1.1 with 1.8 g/kg protein", () => {
    const t = mifflinStJeor({ ...MALE, goal: "bulk" });
    expect(t.kcal).toBeCloseTo(t.tdee * 1.1, 6); // 2998.668…
    expect(t.proteinG).toBeCloseTo(144, 6);
  });
});

describe("mifflinStJeor — safety cap", () => {
  test("female extreme cut is capped at 1200 kcal", () => {
    const t = mifflinStJeor({
      sex: "female",
      weightKg: 45,
      heightCm: 150,
      age: 18,
      activity: 1.2,
      goal: "cut",
    });
    // uncapped would be 1091.04 → clamped to MIN_SAFE_KCAL.female
    expect(t.tdee * 0.8).toBeLessThan(MIN_SAFE_KCAL.female);
    expect(t.capped).toBe(true);
    expect(t.kcal).toBe(MIN_SAFE_KCAL.female); // exactly 1200
    // macros still consistent after the cap
    const sum = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(sum - t.kcal) / t.kcal).toBeLessThan(0.01);
    expect(t.carbsG).toBeGreaterThanOrEqual(50);
  });

  test("male floor is 1500 kcal", () => {
    const t = mifflinStJeor({
      sex: "male",
      weightKg: 50,
      heightCm: 150,
      age: 18,
      activity: 1.2,
      goal: "cut",
    });
    expect(t.capped).toBe(true);
    expect(t.kcal).toBe(MIN_SAFE_KCAL.male);
  });
});

describe("mifflinStJeor — macro consistency", () => {
  const goals = ["cut", "maintain", "bulk"] as const;

  for (const goal of goals) {
    test(`kcal ≈ protein*4 + carbs*4 + fat*9 within 1% (${goal})`, () => {
      const t = mifflinStJeor({ ...MALE, goal });
      const fromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
      expect(Math.abs(fromMacros - t.kcal) / t.kcal).toBeLessThan(0.01);
      // fat is exactly 25 % of kcal / 9 when the carb floor didn't hit
      expect(t.fatG).toBeCloseTo((t.kcal * 0.25) / 9, 6);
      expect(t.carbsG).toBeGreaterThan(50); // floor not hit for this input
    });
  }
});

describe("mifflinStJeor — carbs floor", () => {
  test("carbs floor at 50 g triggers kcal recalculation", () => {
    // Heavy male, tiny height, high age → capped at 1500 kcal with protein
    // 242 g; carbs would go negative without the floor.
    const t = mifflinStJeor({
      sex: "male",
      weightKg: 110,
      heightCm: 150,
      age: 100,
      activity: 1.2,
      goal: "cut",
    });

    expect(t.capped).toBe(true); // pre-floor kcal was below 1500
    expect(t.carbsG).toBe(50); // floor hit exactly
    // kcal RECALCULATED from macros: 242*4 + 50*4 + 41.66…*9 = 1543.00…
    expect(t.proteinG).toBeCloseTo(242, 6);
    expect(t.fatG).toBeCloseTo((1500 * 0.25) / 9, 6);
    const recomputed = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(t.kcal).toBeCloseTo(recomputed, 6);
    expect(t.kcal).toBeGreaterThan(1500); // 1543 — floor raised it
    // exact energy identity after recalc
    expect(Math.abs(recomputed - t.kcal)).toBeLessThan(0.001);
  });
});
