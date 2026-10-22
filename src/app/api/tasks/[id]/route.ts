/**
 * /api/tasks/[id] — update + delete.
 *
 * PATCH { title?, dueAt?, priority?, done?, repeatRule? }
 *  - toggling done: done=true → doneAt=now; done=false → doneAt=null.
 *  - REPEATING "done" = done-for-today (store doneAt=now, keep done=true).
 *    Recurrence is derived — we auto-advance nothing; the today view reads
 *    doneAt-on-date, so tomorrow the task shows undone again (see _lib.ts).
 *  - Soft-deleted tasks are patched too (idempotent with derived views).
 *
 * DELETE → soft delete (deletedAt=now). Deleting an already-deleted task
 *          hard-purges it (same "delete again = forever" invariant as notes).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import { fail, nowISO, ok, toTaskDTO, validateRepeatInput } from "../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const task = await db.tasks.findUnique({ where: { id } });
    if (!task) return fail("NOT_FOUND", "task not found", 404);

    const body = (await req.json().catch(() => null)) as
      | { title?: unknown; dueAt?: unknown; priority?: unknown; done?: unknown; repeatRule?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return fail("VALIDATION", "json object body required", 400);
    }

    const data: Record<string, unknown> = { updatedAt: nowISO() };
    let touched = false;

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return fail("VALIDATION", "title must be a non-empty string", 400);
      }
      data.title = body.title.trim().slice(0, 500);
      touched = true;
    }
    if (body.dueAt !== undefined) {
      if (body.dueAt === null) {
        data.dueAt = null;
      } else {
        if (typeof body.dueAt !== "string") return fail("VALIDATION", "dueAt must be an ISO string or null", 400);
        const ms = new Date(body.dueAt).getTime();
        if (Number.isNaN(ms)) return fail("VALIDATION", "dueAt is not a valid ISO date", 400);
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
        return fail("VALIDATION", "priority must be an integer 0..3", 400);
      }
      data.priority = body.priority;
      touched = true;
    }
    if (body.done !== undefined) {
      if (typeof body.done !== "boolean") return fail("VALIDATION", "done must be boolean", 400);
      data.done = body.done;
      // done-for-today mechanic: doneAt stamps the completion; repeating tasks
      // reappear undone the next occurrence without any scheduled write
      data.doneAt = body.done ? nowISO() : null;
      touched = true;
    }
    if (body.repeatRule !== undefined) {
      const rule = validateRepeatInput(body.repeatRule);
      if (rule === null) {
        return fail("VALIDATION", "repeatRule is invalid", 400);
      }
      data.repeatRule = JSON.stringify(rule);
      touched = true;
    }
    if (!touched) {
      return fail("VALIDATION", "no updatable fields provided", 400);
    }

    const updated = await db.tasks.update({ where: { id }, data });
    return ok(toTaskDTO(updated, toLocalDateKey()));
  } catch (e) {
    console.error("task PATCH error", e);
    return fail("SERVER_ERROR", "failed to update task", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const task = await db.tasks.findUnique({ where: { id } });
    if (!task) return fail("NOT_FOUND", "task not found", 404);

    if (task.deletedAt) {
      await db.tasks.delete({ where: { id } });
      return ok({ action: "purged" as const });
    }

    await db.tasks.update({ where: { id }, data: { deletedAt: nowISO(), updatedAt: nowISO() } });
    return ok({ action: "trashed" as const });
  } catch (e) {
    console.error("task DELETE error", e);
    return fail("SERVER_ERROR", "failed to delete task", 500);
  }
}
