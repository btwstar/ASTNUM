/**
 * /api/tasks/** — port of the tasks API routes (verbatim logic):
 *   src/app/api/tasks/route.ts       (GET today/all/note + POST create)
 *   src/app/api/tasks/[id]/route.ts   (PATCH update + DELETE soft/purge)
 * plus the full src/app/api/tasks/_lib.ts port (repeat mechanic, DTO
 * derivation, cmpToday). toTaskDTO is exported for the notes detail route,
 * exactly like the server's cross-import from "../../tasks/_lib".
 */

import { toLocalDateKey } from "@/lib/i18n/format";
import { getDb, uuid } from "../db";
import { fail, jsonOrNull, ok, propagate, sortRows, type LocalRequest } from "../shared";
import type { TaskRow } from "../db";

/* ── tasks/_lib.ts port ───────────────────────────────────────────── */

export type RepeatType = "none" | "daily" | "weekly" | "weekdays";

export interface RepeatRule {
  type: RepeatType;
  days?: number[];
  interval?: number;
}

export const NONE_RULE: RepeatRule = { type: "none" };

/** Parse the stored repeatRule JSON defensively (bad rows degrade to "none"). */
export function parseRepeatRule(raw: string | null | undefined): RepeatRule {
  try {
    const obj = JSON.parse(raw ?? '{"type":"none"}') as Record<string, unknown>;
    if (
      obj &&
      typeof obj.type === "string" &&
      ["none", "daily", "weekly", "weekdays"].includes(obj.type)
    ) {
      const rule: RepeatRule = { type: obj.type as RepeatType };
      if (Array.isArray(obj.days)) {
        const days = (obj.days as unknown[])
          .map(Number)
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
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

/* ── date helpers (server-local timezone) ─────────────────────────── */

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTaskDateKey(key: string): boolean {
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

/** Does a repeating rule's occurrence land on the given local date? */
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
        const weeks = Math.floor(
          (startOfDate(date).getTime() - created.getTime()) / (7 * 86_400_000)
        );
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

/* ── DTO derivation ───────────────────────────────────────────────── */

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
  const doneToday = repeating ? t.done && doneAtToday : t.done;
  const dueMs = t.dueAt ? new Date(t.dueAt).getTime() : null;
  const overdue =
    !repeating && !doneToday && dueMs !== null && !Number.isNaN(dueMs) && dueMs < start;
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

const SCOPES = new Set(["today", "all", "note"]);

/* ── GET /api/tasks ───────────────────────────────────────────────── */

export function tasksList(req: LocalRequest) {
  try {
    const db = getDb();
    const scope = req.query.get("scope") ?? "today";
    if (!SCOPES.has(scope)) {
      fail("VALIDATION", "scope must be one of today|all|note", 400);
    }

    if (scope === "note") {
      const noteId = req.query.get("noteId");
      if (!noteId) fail("VALIDATION", "noteId is required for scope=note", 400);
      const rows = sortRows(
        db.tasks.filter((t) => t.noteId === noteId && t.deletedAt === null),
        [
          ["sortOrder", "asc"],
          ["createdAt", "asc"],
        ]
      );
      const dateKey = req.query.get("date");
      const key = dateKey && isValidTaskDateKey(dateKey) ? dateKey : toLocalDateKey();
      return ok(rows.map((r) => toTaskDTO(r, key)));
    }

    const dateParam = req.query.get("date");
    if (dateParam && !isValidTaskDateKey(dateParam)) {
      fail("VALIDATION", "date must be YYYY-MM-DD", 400);
    }
    const dateKey = dateParam ?? toLocalDateKey();

    if (scope === "all") {
      const rows = sortRows(
        db.tasks.filter((t) => t.deletedAt === null),
        [
          ["done", "asc"],
          ["priority", "asc"],
          ["dueAt", "asc"],
        ]
      );
      return ok(rows.map((r) => toTaskDTO(r, dateKey)));
    }

    // scope === "today"
    const rows = db.tasks.filter((t) => t.deletedAt === null);
    const end = endOfDay(dateKey);

    const today: TaskDTO[] = [];
    const overdue: TaskDTO[] = [];
    const completedToday: TaskDTO[] = [];

    for (const raw of rows) {
      const dto = toTaskDTO(raw, dateKey);
      const dueMs = dto.dueAt ? new Date(dto.dueAt).getTime() : null;

      if (dto.repeating) {
        if (!occursOnDate(dto.repeatRule, startOfDay(dateKey), dto.createdAt)) continue;
        if (dto.done && dto.doneToday) completedToday.push(dto);
        else today.push(dto);
        continue;
      }

      if (dto.done) {
        if (dto.doneToday) completedToday.push(dto);
        continue;
      }

      const include = dto.noteId
        ? dueMs !== null && dueMs <= end.getTime()
        : dueMs === null || dueMs <= end.getTime();
      if (!include) continue;

      if (dto.overdue) overdue.push(dto);
      else today.push(dto);
    }

    today.sort(cmpToday);
    overdue.sort(cmpToday);
    completedToday.sort((a, b) => (a.doneAt ?? "").localeCompare(b.doneAt ?? ""));
    return ok({ today, overdue, completedToday, date: dateKey });
  } catch (e) {
    propagate(e, "failed to list tasks");
  }
}

/* ── POST /api/tasks ──────────────────────────────────────────────── */

export function tasksCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = jsonOrNull(req) as
      | { title?: unknown; noteId?: unknown; dueAt?: unknown; priority?: unknown; repeatRule?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      fail("VALIDATION", "json object body required", 400);
    }

    const rawTitle = body.title;
    if (typeof rawTitle !== "string" || rawTitle.trim().length === 0) {
      fail("VALIDATION", "title (non-empty string) is required", 400);
    }
    const title = rawTitle.trim().slice(0, 500);

    let noteId: string | null = null;
    const rawNoteId = body.noteId;
    if (rawNoteId !== undefined && rawNoteId !== null) {
      if (typeof rawNoteId !== "string") fail("VALIDATION", "noteId must be a string", 400);
      const note = db.notes.find((n) => n.id === rawNoteId);
      if (!note) fail("NOT_FOUND", "note not found", 404);
      noteId = note.id;
    }

    let dueAt: string | null = null;
    if (body.dueAt !== undefined && body.dueAt !== null) {
      if (typeof body.dueAt !== "string") {
        fail("VALIDATION", "dueAt must be an ISO string", 400);
      }
      const ms = new Date(body.dueAt).getTime();
      if (Number.isNaN(ms)) fail("VALIDATION", "dueAt is not a valid ISO date", 400);
      dueAt = new Date(ms).toISOString();
    }

    let priority = 2; // default: low
    if (body.priority !== undefined) {
      if (
        typeof body.priority !== "number" ||
        !Number.isInteger(body.priority) ||
        body.priority < 0 ||
        body.priority > 3
      ) {
        fail("VALIDATION", "priority must be an integer 0..3 (0=high 1=medium 2=low 3=none)", 400);
      }
      priority = body.priority;
    }

    const rule = validateRepeatInput(body.repeatRule);
    if (rule === null) {
      fail(
        "VALIDATION",
        'repeatRule must be {"type":"none"|"daily"|"weekly"|"weekdays","days"?:number[],"interval"?:number}',
        400
      );
    }

    // checklist items append after existing ones in their note
    let sortOrder = 0;
    if (noteId) {
      const last = db.tasks
        .filter((t) => t.noteId === noteId && t.deletedAt === null)
        .reduce((max, t) => Math.max(max, t.sortOrder), -1);
      sortOrder = last + 1;
    }

    const now = new Date().toISOString();
    const task: TaskRow = {
      id: uuid(),
      noteId,
      title,
      dueAt,
      priority,
      done: false,
      doneAt: null,
      repeatRule: JSON.stringify(rule),
      sortOrder,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.tasks.push(task);

    return ok(toTaskDTO(task, toLocalDateKey()));
  } catch (e) {
    propagate(e, "failed to create task");
  }
}

/* ── PATCH /api/tasks/[id] ────────────────────────────────────────── */

export function taskUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const task = db.tasks.find((t) => t.id === id);
    if (!task) fail("NOT_FOUND", "task not found", 404);

    const body = jsonOrNull(req) as
      | { title?: unknown; dueAt?: unknown; priority?: unknown; done?: unknown; repeatRule?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      fail("VALIDATION", "json object body required", 400);
    }

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    let touched = false;

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        fail("VALIDATION", "title must be a non-empty string", 400);
      }
      data.title = body.title.trim().slice(0, 500);
      touched = true;
    }
    if (body.dueAt !== undefined) {
      if (body.dueAt === null) {
        data.dueAt = null;
      } else {
        if (typeof body.dueAt !== "string") {
          fail("VALIDATION", "dueAt must be an ISO string or null", 400);
        }
        const ms = new Date(body.dueAt).getTime();
        if (Number.isNaN(ms)) fail("VALIDATION", "dueAt is not a valid ISO date", 400);
        data.dueAt = new Date(ms).toISOString();
      }
      touched = true;
    }
    if (body.priority !== undefined) {
      if (
        typeof body.priority !== "number" ||
        !Number.isInteger(body.priority) ||
        body.priority < 0 ||
        body.priority > 3
      ) {
        fail("VALIDATION", "priority must be an integer 0..3", 400);
      }
      data.priority = body.priority;
      touched = true;
    }
    if (body.done !== undefined) {
      if (typeof body.done !== "boolean") fail("VALIDATION", "done must be boolean", 400);
      data.done = body.done;
      data.doneAt = body.done ? new Date().toISOString() : null;
      touched = true;
    }
    if (body.repeatRule !== undefined) {
      const rule = validateRepeatInput(body.repeatRule);
      if (rule === null) {
        fail("VALIDATION", "repeatRule is invalid", 400);
      }
      data.repeatRule = JSON.stringify(rule);
      touched = true;
    }
    if (!touched) {
      fail("VALIDATION", "no updatable fields provided", 400);
    }

    Object.assign(task, data);
    return ok(toTaskDTO(task, toLocalDateKey()));
  } catch (e) {
    propagate(e, "failed to update task");
  }
}

/* ── DELETE /api/tasks/[id] (soft delete; again = hard purge) ─────── */

export function taskDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const task = db.tasks.find((t) => t.id === id);
    if (!task) fail("NOT_FOUND", "task not found", 404);

    if (task.deletedAt) {
      db.tasks.splice(db.tasks.indexOf(task), 1);
      return ok({ action: "purged" as const });
    }

    const now = new Date().toISOString();
    task.deletedAt = now;
    task.updatedAt = now;
    return ok({ action: "trashed" as const });
  } catch (e) {
    propagate(e, "failed to delete task");
  }
}

/* ── POST /api/tasks/[id]/restore (v1.15 trash — was MISSING from the
   adapter, which made the APK trash view 404 into the generic
   "تعذّر إتمام العملية" screen; mirrored from
   src/app/api/tasks/[id]/restore/route.ts) ────────────────────────── */

export function taskRestore(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const task = db.tasks.find((t) => t.id === id);
    if (!task) fail("NOT_FOUND", "task not found", 404);
    if (!task.deletedAt) fail("VALIDATION", "task is not in the trash", 400);

    task.deletedAt = null;
    task.updatedAt = new Date().toISOString();
    return ok(toTaskDTO(task, toLocalDateKey()));
  } catch (e) {
    propagate(e, "failed to restore task");
  }
}

/* ── trash helpers (mirror of tasks/_lib.ts purge policy) ─────────── */

/** Trash auto-purge window (days) — same policy as notes (30 days). */
export const TASK_PURGE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Opportunistic invariant (mirrors notes trash): hard-delete TRASHED tasks
 * older than TASK_PURGE_DAYS so the days-left badge never lies. Only
 * touches rows with deletedAt set — live tasks and note checklists safe.
 */
function purgeExpiredTaskTrash(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - TASK_PURGE_DAYS * DAY_MS).toISOString();
  const expired = db.tasks.filter((t) => t.deletedAt !== null && t.deletedAt < cutoff);
  if (expired.length === 0) return 0;
  const ids = new Set(expired.map((t) => t.id));
  db.tasks = db.tasks.filter((t) => !ids.has(t.id));
  return expired.length;
}

/* ── GET /api/tasks/trash (v1.15 — was MISSING from the adapter) ──── */

export function tasksTrashList() {
  try {
    const db = getDb();
    purgeExpiredTaskTrash();
    const rows = sortRows(
      db.tasks.filter((t) => t.deletedAt !== null),
      [["deletedAt", "desc"]]
    );
    const now = Date.now();
    const dateKey = toLocalDateKey();
    return ok(
      rows.map((r) => {
        const ageDays = r.deletedAt ? (now - new Date(r.deletedAt).getTime()) / DAY_MS : 0;
        return {
          ...toTaskDTO(r, dateKey),
          daysLeft: Math.max(0, Math.ceil(TASK_PURGE_DAYS - ageDays)),
        };
      })
    );
  } catch (e) {
    propagate(e, "failed to list trashed tasks");
  }
}

/* ── DELETE /api/tasks/trash — hard-purge ALL trashed tasks ───────── */

export function tasksTrashPurge() {
  try {
    const db = getDb();
    const ids = new Set(db.tasks.filter((t) => t.deletedAt !== null).map((t) => t.id));
    if (ids.size > 0) {
      db.tasks = db.tasks.filter((t) => !ids.has(t.id));
    }
    return ok({ purged: ids.size });
  } catch (e) {
    propagate(e, "failed to purge trashed tasks");
  }
}
