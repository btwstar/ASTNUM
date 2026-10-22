/**
 * Shared helpers for /api/tasks routes.
 * Server-only.
 *
 * REPEAT MECHANIC (documented honestly):
 *  repeatRule JSON: { "type": "none" | "daily" | "weekly" | "weekdays", "days"?: [0..6], "interval"?: n }
 *  Recurrence is DERIVED, never advanced: "done" on a repeating task means
 *  done-for-today — we store done=true + doneAt=now. The today view treats a
 *  repeating task as done only when doneAt falls on the requested date; the
 *  next day (or next occurrence) it shows up undone again with no write needed.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export type RepeatType = "none" | "daily" | "weekly" | "weekdays";

export interface RepeatRule {
  type: RepeatType;
  days?: number[];
  interval?: number;
}

export const NONE_RULE: RepeatRule = { type: "none" };

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: "VALIDATION" | "NOT_FOUND" | "SERVER_ERROR",
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Trash auto-purge window (days) — same policy as notes (30 days). */
export const TASK_PURGE_DAYS = 30;

/**
 * Opportunistic invariant (mirrors notes trash): hard-delete TRASHED tasks
 * older than TASK_PURGE_DAYS so the trash badge never lies. Only touches
 * rows with deletedAt set — live tasks and note-bound checklists are safe.
 */
export async function purgeExpiredTaskTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TASK_PURGE_DAYS * 86_400_000).toISOString();
  const expired = await db.tasks.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  await db.tasks.deleteMany({ where: { id: { in: expired.map((t) => t.id) } } });
  return expired.length;
}

/** Parse the stored repeatRule JSON defensively (bad rows degrade to "none"). */
export function parseRepeatRule(raw: string | null | undefined): RepeatRule {
  try {
    const obj = JSON.parse(raw ?? '{"type":"none"}') as Record<string, unknown>;
    if (obj && typeof obj.type === "string" && ["none", "daily", "weekly", "weekdays"].includes(obj.type)) {
      const rule: RepeatRule = { type: obj.type as RepeatType };
      if (Array.isArray(obj.days)) {
        const days = (obj.days as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (days.length > 0) rule.days = [...new Set(days)];
      }
      if (typeof obj.interval === "number" && Number.isInteger(obj.interval) && obj.interval >= 1) {
        rule.interval = Math.min(365, obj.interval);
      }
      return rule;
    }
  } catch {
    /* degrade */
  }
  return NONE_RULE;
}

/** Validate client-provided repeatRule; null = invalid input. */
export function validateRepeatInput(input: unknown): RepeatRule | null {
  if (input === undefined || input === null) return NONE_RULE;
  if (typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.type !== "string" || !["none", "daily", "weekly", "weekdays"].includes(obj.type)) {
    return null;
  }
  const rule: RepeatRule = { type: obj.type as RepeatType };
  if (obj.days !== undefined) {
    if (!Array.isArray(obj.days)) return null;
    const days = (obj.days as unknown[]).map(Number);
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
    rule.days = [...new Set(days)];
  }
  if (obj.interval !== undefined) {
    if (
      typeof obj.interval !== "number" ||
      !Number.isInteger(obj.interval) ||
      obj.interval < 1 ||
      obj.interval > 365
    ) {
      return null;
    }
    rule.interval = obj.interval;
  }
  return rule;
}

/* ── date helpers (server-local timezone) ──────────────────────── */

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const d = new Date(`${key}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export function startOfDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function endOfDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/**
 * Does a repeating rule's occurrence land on the given local date?
 * (Caller already knows the task is repeating.)
 *  - daily: every day
 *  - weekdays: Mon–Fri
 *  - weekly: `days` array if provided, else the creation weekday;
 *    with interval n → every n-th week since creation (approx by calendar weeks)
 */
export function occursOnDate(rule: RepeatRule, date: Date, createdAt: string): boolean {
  const dow = date.getDay(); // 0 = Sunday (local)
  switch (rule.type) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly": {
      if (rule.days && rule.days.length > 0) return rule.days.includes(dow);
      const created = startOfDate(new Date(createdAt));
      if (created.getDay() !== dow) return false;
      if (rule.interval && rule.interval > 1) {
        const weeks = Math.floor((startOfDate(date).getTime() - created.getTime()) / (7 * 86_400_000));
        return weeks % rule.interval === 0;
      }
      return true;
    }
    default:
      return false;
  }
}

function startOfDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ── DTO derivation ───────────────────────────────────────────── */

type TaskRow = {
  id: string;
  noteId: string | null;
  title: string;
  dueAt: string | null;
  priority: number;
  done: boolean;
  doneAt: string | null;
  repeatRule: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export interface TaskDTO {
  id: string;
  noteId: string | null;
  title: string;
  dueAt: string | null;
  priority: number;
  done: boolean;
  doneAt: string | null;
  repeatRule: RepeatRule;
  repeating: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** effective done state for the requested date (repeating → doneAt on that date) */
  doneToday: boolean;
  /** dueAt is before the requested date and (effectively) not done */
  overdue: boolean;
}

export function toTaskDTO(t: TaskRow, dateKey: string): TaskDTO {
  const rule = parseRepeatRule(t.repeatRule);
  const repeating = rule.type !== "none";
  const start = startOfDay(dateKey).getTime();
  const end = endOfDay(dateKey).getTime();
  const doneAtToday = t.doneAt
    ? (() => {
        const ms = new Date(t.doneAt).getTime();
        return !Number.isNaN(ms) && ms >= start && ms <= end;
      })()
    : false;
  // repeating → "done" only counts for the occurrence day; non-repeating → raw done
  const doneToday = repeating ? t.done && doneAtToday : t.done;
  const dueMs = t.dueAt ? new Date(t.dueAt).getTime() : null;
  // repeating tasks recur forever — "overdue" noise is meaningless for them
  const overdue = !repeating && !doneToday && dueMs !== null && !Number.isNaN(dueMs) && dueMs < start;
  return {
    id: t.id,
    noteId: t.noteId,
    title: t.title,
    dueAt: t.dueAt,
    priority: t.priority,
    done: t.done,
    doneAt: t.doneAt,
    repeatRule: rule,
    repeating,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    doneToday,
    overdue,
  };
}

/** Sort for the today view: priority asc → dueAt asc (nulls last) → stable. */
export function cmpToday(a: TaskDTO, b: TaskDTO): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}
