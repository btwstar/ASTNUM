/**
 * Shared helpers for /api/body routes.
 * (Colocated private module: files without `route.ts` are not routes.)
 */
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

/** YYYY-MM-DD (local day key) with real-calendar validation. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Parse a number-ish payload value. Returns null when absent/empty/invalid. */
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

export function validateRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

// ── Body measurement ranges (STORAGE units: kg / cm) ──────────────
export const RANGES = {
  weight: { min: 20, max: 400 }, // kg
  bodyFat: { min: 2, max: 70 }, // %
  muscleMass: { min: 5, max: 200 }, // kg
  water: { min: 20, max: 80 }, // %
  visceralFat: { min: 1, max: 59 },
  circumference: { min: 20, max: 250 }, // cm
} as const;

export const CIRC_PARTS = ["chest", "waist", "arm", "thigh", "hip"] as const;
export type CircPart = (typeof CIRC_PARTS)[number];

export function isCircPart(value: string): value is CircPart {
  return (CIRC_PARTS as readonly string[]).includes(value);
}
