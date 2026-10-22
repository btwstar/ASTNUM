/**
 * POST /api/notes/[id]/restore — restore a trashed note.
 * Clears deletedAt. Idempotent: restoring a non-trashed note is a no-op 200.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, nowISO, ok, tagsByNoteId } from "../../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = await db.notes.findUnique({ where: { id } });
    if (!note) return fail("NOT_FOUND", "note not found", 404);

    let restored = note;
    if (note.deletedAt) {
      restored = await db.notes.update({
        where: { id },
        data: { deletedAt: null, updatedAt: nowISO() },
      });
    }
    const tagMap = await tagsByNoteId([id]);
    return ok({ ...restored, tags: tagMap.get(id) ?? [] });
  } catch (e) {
    console.error("note restore error", e);
    return fail("SERVER_ERROR", "failed to restore note", 500);
  }
}
