/**
 * Shared helpers for the gym API routes (server-only).
 * Private module — the underscore prefix keeps it out of routing conventions.
 *
 * Envelope contract (frozen): { ok: true, data } | { ok: false, error: { code, message } }
 * HTTP codes: 200 / 400 VALIDATION / 404 NOT_FOUND / 500 SERVER_ERROR.
 */
import { NextRequest, NextResponse } from "next/server";
import { toLocalDateKey } from "@/lib/i18n/format";

export const EQUIPMENT_VALUES = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
  "none",
] as const;
export type EquipmentValue = (typeof EQUIPMENT_VALUES)[number];

export const SET_TYPES = ["warmup", "work", "failure"] as const;
export type SetTypeValue = (typeof SET_TYPES)[number];

/** success envelope */
export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data });
}

/** error envelope with HTTP status */
export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/** 400 VALIDATION */
export function bad(message: string): NextResponse {
  return fail("VALIDATION", message, 400);
}

/** 404 NOT_FOUND */
export function notFound(what = "gym_resource"): NextResponse {
  return fail("NOT_FOUND", what, 404);
}

/** 500 SERVER_ERROR */
export function serverError(message: string): NextResponse {
  return fail("SERVER_ERROR", message, 500);
}

/**
 * Seed guard for library endpoints. Dynamic import + try/catch per module
 * contract — a seeding failure must never take the API down (the library may
 * already be populated, and this is idempotent anyway).
 */
export async function ensureSeeded(): Promise<void> {
  try {
    const mod = await import("@/lib/seed");
    await mod.ensureSeed();
  } catch {
    /* best-effort — library might be seeded by any other module's call */
  }
}

/** Parse the JSON body defensively (null on malformed payloads). */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" or null. */
export function validDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

/**
 * The client may pass its own local date via ?today=YYYY-MM-DD (single-user
 * local-first app; defaults to the server's local date — identical in the
 * on-device Capacitor build).
 */
export function resolveTodayKey(req: NextRequest): string {
  const q = req.nextUrl.searchParams.get("today");
  const key = validDateKey(q);
  return key ?? toLocalDateKey();
}

/* ── field validators (return the normalized value or null when invalid) ── */

export function validReps(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1000 || !Number.isInteger(n)) return null;
  return n;
}

export function validWeight(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 2000) return null;
  return Math.round(n * 1000) / 1000;
}

export function validRpe(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return Math.round(n * 2) / 2; // half steps
}

export function validSetType(value: unknown): SetTypeValue {
  return typeof value === "string" && (SET_TYPES as readonly string[]).includes(value)
    ? (value as SetTypeValue)
    : "work";
}

export function validEquipment(value: unknown): EquipmentValue | null {
  return typeof value === "string" && (EQUIPMENT_VALUES as readonly string[]).includes(value)
    ? (value as EquipmentValue)
    : null;
}

/** Int bounded into [min, max] or null. */
export function validInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}
