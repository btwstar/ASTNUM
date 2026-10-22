/**
 * /api/notes/trash — trash listing + purge-all.
 *
 * GET    → trashed notes with `daysLeft` (30 - age, ceil, min 0) until auto-purge.
 *          Runs the opportunistic purge first so the badge never lies.
 * DELETE → purge ALL trashed notes (hard delete notes + their noteTags +
 *          their checklist tasks) and return the count.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok, purgeExpiredTrash, PURGE_DAYS, tagsByNoteId } from "../_lib";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  try {
    await purgeExpiredTrash();
    const notes = await db.notes.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    });
    const tagMap = await tagsByNoteId(notes.map((n) => n.id));
    const now = Date.now();
    return ok(
      notes.map(({ image: _full, ...n }) => {
        const ageDays = n.deletedAt ? (now - new Date(n.deletedAt).getTime()) / DAY_MS : 0;
        return {
          ...n,
          tags: tagMap.get(n.id) ?? [],
          daysLeft: Math.max(0, Math.ceil(PURGE_DAYS - ageDays)),
        };
      })
    );
  } catch (e) {
    console.error("trash GET error", e);
    return fail("SERVER_ERROR", "failed to list trash", 500);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const trashed = await db.notes.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true },
    });
    if (trashed.length > 0) {
      const ids = trashed.map((n) => n.id);
      await db.$transaction([
        db.noteTags.deleteMany({ where: { noteId: { in: ids } } }),
        db.tasks.deleteMany({ where: { noteId: { in: ids } } }),
        db.notes.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    return ok({ purged: trashed.length });
  } catch (e) {
    console.error("trash DELETE error", e);
    return fail("SERVER_ERROR", "failed to purge trash", 500);
  }
}
