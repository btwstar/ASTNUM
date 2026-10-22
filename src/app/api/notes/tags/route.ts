/**
 * GET /api/notes/tags — all tags with counts over live (non-deleted) notes.
 * Powers the horizontal tag-filter chips in the notes header.
 * (Static segment "tags" wins over the dynamic [id] route — UUID ids never collide.)
 */
import { db } from "@/lib/db";
import { fail, ok } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [tags, links, liveNotes] = await Promise.all([
      db.tags.findMany({ orderBy: { name: "asc" } }),
      db.noteTags.findMany(),
      db.notes.findMany({ where: { deletedAt: null }, select: { id: true } }),
    ]);
    const live = new Set(liveNotes.map((n) => n.id));
    const countByTag = new Map<string, number>();
    for (const link of links) {
      if (!live.has(link.noteId)) continue;
      countByTag.set(link.tagId, (countByTag.get(link.tagId) ?? 0) + 1);
    }
    return ok(
      tags.map((t) => ({ id: t.id, name: t.name, count: countByTag.get(t.id) ?? 0 }))
    );
  } catch (e) {
    console.error("tags GET error", e);
    return fail("SERVER_ERROR", "failed to list tags", 500);
  }
}
