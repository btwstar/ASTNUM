/**
 * /api/tasks — list + create.
 *
 * GET ?date=YYYY-MM-DD&scope=(today|all|note&noteId=)
 *  - today (default): tasks the user should see on that date:
 *      • standalone (noteId=null), not done: dueAt null OR dueAt ≤ end of date
 *      • note-checklist items: only when explicitly scheduled (dueAt ≤ end of date, not done)
 *        — unscheduled checklist items stay inside their note (documented decision)
 *      • repeating tasks whose occurrence lands on that date (recurrence derived;
 *        "done" for them = doneAt on that date — see _lib.ts)
 *      • upcoming (v1.15): explicitly scheduled for AFTER that date (dueAt > end
 *        of day, not done, non-repeating) — previously these tasks were invisible
 *        anywhere in مهامي (review finding), now they surface under "قادمة".
 *    Response: { today: [...], overdue: [...], upcoming: [...], completedToday: [...] }
 *  - all: every non-deleted task (done first), ordered priority→dueAt.
 *  - note: checklist of a note ordered by sortOrder.
 *
 * POST { title, noteId?, dueAt?, priority?, repeatRule? }
 *  - CROSS-MODULE CONTRACT (widget quick-capture): POST with { title, dueAt?, priority? }
 *    works standalone → noteId=null, repeatRule {"type":"none"}. This is how
 *    quick-captured tasks get saved.
 */
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import {
  cmpToday,
  endOfDay,
  fail,
  isValidDateKey,
  nowISO,
  occursOnDate,
  ok,
  startOfDay,
  toTaskDTO,
  validateRepeatInput,
  type TaskDTO,
} from "./_lib";

export const dynamic = "force-dynamic";

const SCOPES = new Set(["today", "all", "note"]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const scope = sp.get("scope") ?? "today";
    if (!SCOPES.has(scope)) {
      return fail("VALIDATION", "scope must be one of today|all|note", 400);
    }

    if (scope === "note") {
      const noteId = sp.get("noteId");
      if (!noteId) return fail("VALIDATION", "noteId is required for scope=note", 400);
      const rows = await db.tasks.findMany({
        where: { noteId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      const dateKey = sp.get("date");
      const key = dateKey && isValidDateKey(dateKey) ? dateKey : toLocalDateKey();
      return ok(rows.map((r) => toTaskDTO(r, key)));
    }

    const dateParam = sp.get("date");
    if (dateParam && !isValidDateKey(dateParam)) {
      return fail("VALIDATION", "date must be YYYY-MM-DD", 400);
    }
    const dateKey = dateParam ?? toLocalDateKey();

    if (scope === "all") {
      const rows = await db.tasks.findMany({
        where: { deletedAt: null },
        orderBy: [{ done: "asc" }, { priority: "asc" }, { dueAt: "asc" }],
      });
      return ok(rows.map((r) => toTaskDTO(r, dateKey)));
    }

    // scope === "today"
    const rows = await db.tasks.findMany({ where: { deletedAt: null } });
    const date = startOfDay(dateKey);
    const end = endOfDay(dateKey);

    const today: TaskDTO[] = [];
    const overdue: TaskDTO[] = [];
    const upcoming: TaskDTO[] = [];
    const completedToday: TaskDTO[] = [];

    for (const raw of rows) {
      const dto = toTaskDTO(raw, dateKey);
      const dueMs = dto.dueAt ? new Date(dto.dueAt).getTime() : null;

      if (dto.repeating) {
        // repeating tasks surface when their occurrence lands on the date,
        // regardless of (possibly stale) dueAt
        if (!occursOnDate(dto.repeatRule, date, dto.createdAt)) continue;
        if (dto.done && dto.doneToday) completedToday.push(dto);
        else today.push(dto);
        continue;
      }

      if (dto.done) {
        // non-repeating, completed today → completed section; otherwise hidden
        if (dto.doneToday) completedToday.push(dto);
        continue;
      }

      // future-dated → upcoming section ("قادمة") — same explicit-schedule rule
      // for note checklist items; never done, never repeating here
      if (dueMs !== null && dueMs > end.getTime()) {
        upcoming.push(dto);
        continue;
      }

      // not done: standalone shows when undated or due by end of day;
      // note checklist items only when explicitly scheduled
      const include = dto.noteId
        ? dueMs !== null && dueMs <= end.getTime()
        : dueMs === null || dueMs <= end.getTime();
      if (!include) continue;

      if (dto.overdue) overdue.push(dto);
      else today.push(dto);
    }

    today.sort(cmpToday);
    overdue.sort(cmpToday);
    upcoming.sort(cmpToday);
    completedToday.sort((a, b) => (a.doneAt ?? "").localeCompare(b.doneAt ?? ""));
    return ok({ today, overdue, upcoming, completedToday, date: dateKey });
  } catch (e) {
    console.error("tasks GET error", e);
    return fail("SERVER_ERROR", "failed to list tasks", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { title?: unknown; noteId?: unknown; dueAt?: unknown; priority?: unknown; repeatRule?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return fail("VALIDATION", "json object body required", 400);
    }

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return fail("VALIDATION", "title (non-empty string) is required", 400);
    }
    const title = body.title.trim().slice(0, 500);

    let noteId: string | null = null;
    if (body.noteId !== undefined && body.noteId !== null) {
      if (typeof body.noteId !== "string") return fail("VALIDATION", "noteId must be a string", 400);
      const note = await db.notes.findUnique({ where: { id: body.noteId } });
      if (!note) return fail("NOT_FOUND", "note not found", 404);
      noteId = note.id;
    }

    let dueAt: string | null = null;
    if (body.dueAt !== undefined && body.dueAt !== null) {
      if (typeof body.dueAt !== "string") return fail("VALIDATION", "dueAt must be an ISO string", 400);
      const ms = new Date(body.dueAt).getTime();
      if (Number.isNaN(ms)) return fail("VALIDATION", "dueAt is not a valid ISO date", 400);
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
        return fail("VALIDATION", "priority must be an integer 0..3 (0=high 1=medium 2=low 3=none)", 400);
      }
      priority = body.priority;
    }

    const rule = validateRepeatInput(body.repeatRule);
    if (rule === null) {
      return fail(
        "VALIDATION",
        'repeatRule must be {"type":"none"|"daily"|"weekly"|"weekdays","days"?:number[],"interval"?:number}',
        400
      );
    }

    // checklist items append after existing ones in their note
    let sortOrder = 0;
    if (noteId) {
      const last = await db.tasks.findFirst({
        where: { noteId, deletedAt: null },
        orderBy: { sortOrder: "desc" },
      });
      sortOrder = (last?.sortOrder ?? -1) + 1;
    }

    const now = nowISO();
    const task = await db.tasks.create({
      data: {
        id: randomUUID(),
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
      },
    });

    return ok(toTaskDTO(task, toLocalDateKey()), 201);
  } catch (e) {
    console.error("tasks POST error", e);
    return fail("SERVER_ERROR", "failed to create task", 500);
  }
}
