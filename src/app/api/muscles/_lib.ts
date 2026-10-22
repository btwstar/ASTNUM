/**
 * Shared helpers for /api/muscles routes.
 * (Colocated private module: files without `route.ts` are not routes.)
 * Envelope contract: { ok: true, data } | { ok: false, error: { code, message } }.
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

export function notFound(message: string) {
  return bad("NOT_FOUND", message, 404);
}

export function serverError(message = "internal error") {
  return bad("SERVER_ERROR", message, 500);
}

/**
 * Idempotent seed guard — dynamic import inside try/catch so a broken seed
 * never breaks the map (the map degrades to whatever the DB holds).
 */
export async function ensureSeeded(): Promise<void> {
  try {
    const { ensureSeed } = await import("@/lib/seed");
    await ensureSeed();
  } catch {
    /* map must render even if seeding fails */
  }
}

export interface MuscleGroupDTO {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  region: "front" | "back";
  weeklyTarget: number;
  sortOrder: number;
}
