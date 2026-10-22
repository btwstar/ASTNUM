/**
 * Shared nutrition types + tiny helpers .
 * (Kept in a non-component module so sheets + screen can import freely.)
 */
import type { MealType } from "@/lib/store/app-store";

export type { MealType };

export interface FoodRow {
  id: string;
  nameAr: string;
  nameEn: string;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingG: number | null;
  custom: boolean;
  favorite: boolean;
  /**
   * User-attached photo pair (canvas-compressed data URLs). LIST responses
   * strip the full `image` (image: null there) and only carry `imageThumb`;
   * single-food responses (POST/PATCH) include both.
   */
  image: string | null;
  imageThumb: string | null;
}

export interface FoodLogRow {
  id: string;
  date: string;
  mealType: MealType;
  foodId: string | null;
  name: string;
  quantity: number;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FormulaMeta {
  formula?: string;
  sex?: "male" | "female";
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: number;
  goal?: "cut" | "maintain" | "bulk";
  manual?: boolean;
  /** v2.4 hydration: water goal follows the body-profile formula (true) or was set manually (false). */
  waterAuto?: boolean;
}

export interface Goals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Daily hydration target in ml (0 = no goal yet) — v2.4. */
  waterMl: number;
  formulaMeta: string | null;
}

export interface SummaryResponse {
  consumed: Totals;
  goals: Goals;
  meals: Record<MealType, Totals>;
  week?: Array<{ date: string; kcal: number }>;
  /** v2.4 hydration totals for the day (absent on pre-water servers). */
  water?: { consumedMl: number; goalMl: number };
}

/** The three drink categories tracked by the hydration card — v2.4. */
export type DrinkType = "water" | "juice" | "other";

export interface DrinkLogRow {
  id: string;
  date: string; // YYYY-MM-DD
  drink: DrinkType;
  name: string;
  amountMl: number;
  updatedAt: string; // ISO timestamp
}

/** GET /api/nutrition/water response (day view + optional week totals). */
export interface WaterResponse {
  logs: DrinkLogRow[];
  consumedMl: number;
  waterMl: number;
  goal: { waterMl: number };
  week?: Array<{ date: string; ml: number }>;
}

export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Time-of-day default meal: <11 breakfast, <17 lunch, <21 dinner, else snack. */
export function mealTypeByHour(hour: number): MealType {
  if (hour < 11) return "breakfast";
  if (hour < 17) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export const ZERO_TOTALS: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Parse goals.formulaMeta JSON → FormulaMeta (null when absent/corrupt). */
export function parseFormulaMeta(goals: Goals): FormulaMeta | null {
  if (!goals.formulaMeta) return null;
  try {
    const parsed = JSON.parse(goals.formulaMeta) as FormulaMeta;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
