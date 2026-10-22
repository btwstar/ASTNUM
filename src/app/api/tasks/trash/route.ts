/**
 * /api/tasks/trash — trashed-tasks listing + purge-all (v1.15, review finding 1).
 *
 * Mirrors /api/notes/trash: tasks soft-deleted from مهامي (or from a note's
 * checklist) land here for 30 days with restore + delete-forever, instead of
 * disappearing silently. The opportunistic purge runs first so the
 * days-left badge never lies.
 *
 * GET    → trashed tasks with `daysLeft` (30 - age, ceil, min 0), deletedAt desc.
 * DELETE → hard-purge ALL trashed tasks and return the count.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import {
  TASK_PURGE_DAYS,
  fail,
  ok,
  purgeExpiredTaskTrash,
  toTaskDTO,
} from "../_lib";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  try {
    await purgeExpiredTaskTrash();
    const rows = await db.tasks.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    });
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
    console.error("tasks trash GET error", e);
    return fail("SERVER_ERROR", "failed to list trashed tasks", 500);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const purged = await db.tasks.deleteMany({ where: { deletedAt: { not: null } } });
    return ok({ purged: purged.count });
  } catch (e) {
    console.error("tasks trash DELETE error", e);
    return fail("SERVER_ERROR", "failed to purge trashed tasks", 500);
  }
}
