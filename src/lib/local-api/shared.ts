/**
 * Shared plumbing for the in-browser offline API adapter (local-api).
 *
 * Mirrors the per-route helper modules under src/app/api/** (habits/_helpers,
 * gym/_helpers, notes/_lib, tasks/_lib, nutrition/_lib, body/_lib, muscles/_lib):
 * the SAME envelope contract, the SAME ApiError class (imported from @/lib/api
 * so instanceof checks in client code keep working), and SQLite-accurate
 * search/sort helpers (ASCII-only case folding, NULLs-first ASC, BINARY
 * string collation) so the adapter behaves exactly like the dev server.
 */

import { ApiError } from "@/lib/api";
import { isValidDateKey } from "@/lib/logic/streak";

/* ── request shape (built once by the dispatcher) ─────────────────── */

export interface LocalRequest {
  /** UPPER-cased HTTP method ("GET" when absent). */
  method: string;
  /** Pathname only, no query string (e.g. "/api/habits/abc/log"). */
  path: string;
  /** Parsed query string. */
  query: URLSearchParams;
  /** Parsed JSON body value; undefined when no body was sent. */
  body: unknown;
  /** True when a body was sent but JSON.parse failed (mirrors req.json() throwing). */
  bodyMalformed: boolean;
  /** Lower-cased header map. */
  headers: Record<string, string>;
  /** Dynamic path segments resolved by the router (e.g. { id: "abc" }). */
  params: Record<string, string>;
}

/* ── envelope helpers (throw the REAL ApiError class) ─────────────── */

/** Success pass-through — handlers return their `data` payload directly. */
export function ok<T>(data: T): T {
  return data;
}

/** 400 VALIDATION */
export function bad(message: string): never {
  throw new ApiError(message, "VALIDATION", 400);
}

/** Error envelope with arbitrary code/status (habit FREEZE_LIMIT, OFFLINE…). */
export function fail(code: string, message: string, status: number): never {
  throw new ApiError(message, code, status);
}

/** 404 NOT_FOUND */
export function notFound(message = "not_found"): never {
  throw new ApiError(message, "NOT_FOUND", 404);
}

/** 500 SERVER_ERROR */
export function serverError(message: string): never {
  throw new ApiError(message, "SERVER_ERROR", 500);
}

/**
 * Catch-block companion: ApiErrors are re-thrown untouched (validation/404
 * must NOT be swallowed into a 500 — the bug class fixed in the 4-a build);
 * genuine exceptions become the route's own SERVER_ERROR message.
 */
export function propagate(e: unknown, message: string): never {
  if (e instanceof ApiError) throw e;
  throw new ApiError(message, "SERVER_ERROR", 500);
}

/* ── body parsing (three server patterns, mirrored 1:1) ──────────── */

/**
 * Mirrors the `readJson()` helper (habits/gym routes): object-or-null,
 * malformed payloads and non-objects degrade to null (→ the route's 400).
 */
export function readJsonObject(req: LocalRequest): Record<string, unknown> | null {
  if (req.bodyMalformed) return null;
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return null;
}

/**
 * Mirrors `(await req.json().catch(() => null))` (notes/tasks routes): any
 * parsed value, null when malformed (→ the route's own 400 handling).
 */
export function jsonOrNull(req: LocalRequest): unknown {
  if (req.bodyMalformed) return null;
  return req.body ?? null;
}

/**
 * Mirrors a bare `await req.json()` (nutrition/body/settings/backup/ai routes):
 * a malformed OR EMPTY body THROWS — the surrounding try/catch answers the
 * route's own error (500 for the raw routes, the ai route's own 400), exactly
 * like the server (req.json() rejects on missing/invalid JSON).
 */
export function rawJson(req: LocalRequest): unknown {
  if (req.bodyMalformed || req.body === undefined) {
    throw new Error("malformed or empty JSON body");
  }
  return req.body;
}

/**
 * rawJson + tolerant record shape for routes typed as `Record<string, unknown>`.
 * Field access on a NUMBER/STRING/ARRAY payload is harmless server-side
 * (→ undefined → the route's 400s), so those degrade to an empty record here;
 * a JSON `null` payload THROWS instead — property access on null crashes
 * inside the route's try/catch server-side, producing its 500.
 */
export function rawJsonObject(req: LocalRequest): Record<string, unknown> {
  const body = rawJson(req);
  if (body === null) {
    throw new Error("null JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

/* ── LIKE-style search (SQLite semantics) ────────────────────────── */

/** Strip LIKE wildcard chars so user input can't inject %/_ patterns (notes). */
export function sanitizeLike(q: string): string {
  return q.replace(/[%_]/g, " ").trim();
}

/** ASCII-only case folding — SQLite LIKE is case-insensitive for ASCII only. */
function foldAscii(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

/** Prisma `contains` on SQLite = LIKE '%q%' = ASCII-case-insensitive substring. */
export function ciContains(haystack: string | null | undefined, needle: string): boolean {
  if (haystack === null || haystack === undefined) return false; // LIKE never matches NULL
  if (needle === "") return true; // LIKE '%%' matches every non-null value
  return foldAscii(haystack).includes(foldAscii(needle));
}

/** BINARY collation compare (SQLite default for ORDER BY on text). */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ── sorting (Prisma orderBy → SQLite semantics) ──────────────────── */

export type SortDir = "asc" | "desc";

/**
 * Stable multi-key sort translating Prisma `orderBy` arrays to SQLite rules:
 *   - ASC  → NULLs first
 *   - DESC → NULLs last
 *   - strings compare BINARY (codepoint order), numbers/booleans numerically
 *   - Array.prototype.sort is stable in every supported runtime
 */
export function sortRows<T>(
  rows: T[],
  spec: Array<[key: string, dir: SortDir]>
): T[] {
  return rows.sort((ra, rb) => {
    for (const [key, dir] of spec) {
      const a = (ra as Record<string, unknown>)[key];
      const b = (rb as Record<string, unknown>)[key];
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        if (dir === "asc") return aNull ? -1 : 1; // NULLs first
        return aNull ? 1 : -1; // NULLs last on desc
      }
      let cmp = 0;
      if (typeof a === "number" && typeof b === "number") cmp = a - b;
      else if (typeof a === "boolean" && typeof b === "boolean") {
        cmp = Number(a) - Number(b);
      } else if (typeof a === "string" && typeof b === "string") {
        cmp = a < b ? -1 : a > b ? 1 : 0;
      } else {
        const as = String(a);
        const bs = String(b);
        cmp = as < bs ? -1 : as > bs ? 1 : 0;
      }
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

/* ── date-key helpers ────────────────────────────────────────────── */

/** "YYYY-MM-DD" that is a real calendar date (reuses the pure streak check). */
export function isValidDayKey(key: string): boolean {
  return isValidDateKey(key);
}

/** Mirror of `new Date().toISOString()` snapshots used across the routes. */
export function nowISO(): string {
  return new Date().toISOString();
}
