/**
 * Shared helpers for the habits API routes (server-only).
 * Private module (underscore prefix keeps it out of routing conventions).
 */
import { NextRequest, NextResponse } from "next/server";
import { toLocalDateKey } from "@/lib/i18n/format";
import { isValidDateKey } from "@/lib/logic/streak";

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
export function notFound(): NextResponse {
  return fail("NOT_FOUND", "habit_not_found", 404);
}

/** 500 SERVER_ERROR */
export function serverError(message: string): NextResponse {
  return fail("SERVER_ERROR", message, 500);
}

/**
 * The "today" the streak engine should judge against. The client may pass its
 * own local date via ?today=YYYY-MM-DD (single-user local-first app; defaults
 * to the server's local date — identical in the on-device Capacitor build).
 */
export function resolveTodayKey(req: NextRequest): string {
  const q = req.nextUrl.searchParams.get("today");
  if (q && isValidDateKey(q)) return q;
  return toLocalDateKey();
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

/* ── field validators (all return an error message or null) ────────── */

export function validName(value: unknown): string | null {
  if (typeof value !== "string") return "invalid_name";
  const name = value.trim();
  if (name.length < 1 || name.length > 120) return "invalid_name";
  return null;
}

export function validColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return "invalid_color";
  return null;
}

export function validIcon(value: unknown): string | null {
  if (typeof value !== "string") return "invalid_icon";
  const icon = value.trim();
  if (icon.length < 1 || icon.length > 40) return "invalid_icon";
  return null;
}

export function validReminderTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "invalid_reminder_time";
  return null;
}

export function validNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 2000) return "invalid_note";
  return null;
}
