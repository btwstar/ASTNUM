/**
 * /api/tasks/[id]/restore — un-delete a trashed task (v1.15, review finding 1).
 *
 * POST → clears deletedAt (updatedAt bumped) and returns the live TaskDTO.
 * Restoring a task whose parent NOTE is itself trashed is allowed: the task
 * becomes live again and reappears once the note is restored as well (the
 * checklist rows are filtered by the note's own deletedAt on read).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import { fail, nowISO, ok, toTaskDTO } from "../../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const task = await db.tasks.findUnique({ where: { id } });
    if (!task) return fail("NOT_FOUND", "task not found", 404);
    if (!task.deletedAt) return fail("VALIDATION", "task is not in the trash", 400);

    const restored = await db.tasks.update({
      where: { id },
      data: { deletedAt: null, updatedAt: nowISO() },
    });
    return ok(toTaskDTO(restored, toLocalDateKey()));
  } catch (e) {
    console.error("task restore error", e);
    return fail("SERVER_ERROR", "failed to restore task", 500);
  }
}
