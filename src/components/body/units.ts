/**
 * Unit conversion helpers .
 * STORAGE is ALWAYS kg / cm. DISPLAY converts per the store's units
 * (kg↔lb ×2.20462, cm↔in ÷2.54). Formatting goes through useFormat().number().
 */
import type { LengthUnit, WeightUnit } from "@/lib/store/app-store";

export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;

/** kg → display unit value */
export function weightToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

/** display unit value → kg */
export function displayToWeight(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value / LB_PER_KG : value;
}

/** cm → display unit value */
export function lengthToDisplay(cm: number, unit: LengthUnit): number {
  return unit === "in" ? cm / CM_PER_IN : cm;
}

/** display unit value → cm */
export function displayToLength(value: number, unit: LengthUnit): number {
  return unit === "in" ? value * CM_PER_IN : value;
}

/** Storage-unit range → display-unit range (for inline validation messages). */
export function weightRangeToDisplay(
  range: { min: number; max: number },
  unit: WeightUnit
): { min: number; max: number } {
  return { min: weightToDisplay(range.min, unit), max: weightToDisplay(range.max, unit) };
}

export function lengthRangeToDisplay(
  range: { min: number; max: number },
  unit: LengthUnit
): { min: number; max: number } {
  return { min: lengthToDisplay(range.min, unit), max: lengthToDisplay(range.max, unit) };
}

/** Round to N decimals, dropping trailing zeros visually via Intl downstream. */
export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
