/**
 * Shared helpers for /api/nutrition routes.
 */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function bad(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function validationError(message: string) {
  return bad("VALIDATION", message, 400);
}

export function notFound(message = "not found") {
  return bad("NOT_FOUND", message, 404);
}

export function serverError(message = "internal error") {
  return bad("SERVER_ERROR", message, 500);
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}

/** YYYY-MM-DD (local day key) with real-calendar validation. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const EMPTY_TOTALS = { kcal: 0, protein: 0, carbs: 0, fat: 0 } as const;

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function sumTotals(
  logs: Array<{ kcal: number; protein: number; carbs: number; fat: number }>
): Totals {
  return logs.reduce<Totals>(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { ...EMPTY_TOTALS }
  );
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Single-active-row convention for NutritionGoals:
 * find the first row, or lazily create sensible defaults (2200/165/220/73).
 */
export async function getOrCreateGoals() {
  const existing = await db.nutritionGoals.findFirst({ orderBy: { updatedAt: "desc" } });
  if (existing) return existing;

  const now = new Date().toISOString();
  return db.nutritionGoals.create({
    data: {
      id: "goals",
      date: "1970-01-01",
      kcal: 2200,
      protein: 165,
      carbs: 220,
      fat: 73,
      formulaMeta: null,
      updatedAt: now,
    },
  });
}

/** Safe day key arithmetic (pure calendar math). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
