/**
 * Smart-session pure helpers (v1.17) — shared 1:1 by the Next.js server
 * routes and the APK's local-api adapter (same contract discipline as
 * @/lib/logic/pr: NO server-only imports here).
 *
 * Two JSON-backed features live on WorkoutTemplates + Workouts:
 *  - Day scheduling: templates may be dedicated to weekdays 0=Sunday..6=
 *    Saturday ("جدول اليوم" start card). null/[] = any day.
 *  - Exercise deferral ("تأجيل"): a planned-but-unstarted exercise moves to
 *    the next session of that template — recorded on the WORKOUT
 *    (deferredJson, the "مؤجلة" badge in THIS session) and on the TEMPLATE
 *    (carryJson, prepended to the NEXT session). The carry clears only
 *    when the exercise is actually performed (a set is logged), mirroring
 *    the app's "automatic postponement until completed" habit rotation.
 */

/* ── day scheduling ────────────────────────────────────────────────── */

/** Parse a stored daysJson column → validated weekday ints (0..6), sorted. */
export function parseDaysJson(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out = new Set<number>();
    for (const v of arr) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) out.add(v);
    }
    return [...out].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export type DaysParse =
  | { kind: "absent" } // field not sent — leave the column untouched
  | { kind: "invalid" } // present but wrong shape → 400
  | { kind: "days"; days: number[] }; // valid (dedup + sort); [] = clear (any day)

/** Validate a request body's `days` field. undefined/null → absent. */
export function validateDaysInput(raw: unknown): DaysParse {
  if (raw === undefined || raw === null) return { kind: "absent" };
  if (!Array.isArray(raw) || raw.length > 7) return { kind: "invalid" };
  const out = new Set<number>();
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 6) {
      return { kind: "invalid" };
    }
    out.add(v);
  }
  return { kind: "days", days: [...out].sort((a, b) => a - b) };
}

/** Encode a validated days array for storage (empty → null = any day). */
export function encodeDaysJson(days: number[]): string | null {
  return days.length > 0 ? JSON.stringify(days) : null;
}

/* ── id-list JSON columns (deferred / carried) ──────────────────────── */

/** Parse a stored JSON array of exercise ids (corrupt/absent → []). */
export function parseIdsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const v of arr) if (typeof v === "string" && v) out.push(v);
    return out;
  } catch {
    return [];
  }
}

/** Encode for storage; empty list → null (keeps rows lean). */
export function encodeIdsJson(ids: readonly string[]): string | null {
  return ids.length > 0 ? JSON.stringify(ids) : null;
}

/** Append-preserving-unique (defer/undefer bookkeeping). */
export function appendIdUnique(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

/** Remove every occurrence of `id`. */
export function removeId(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}
