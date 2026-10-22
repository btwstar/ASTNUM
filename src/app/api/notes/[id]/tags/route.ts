/**
 * PUT /api/notes/[id]/tags — replace a note's tag set.
 * Body: { tagNames: string[] }
 *  - creates missing tags (by name, unique)
 *  - links new tags, unlinks tags no longer in the set
 *  - orphaned tags themselves are NEVER deleted (they may be reused / other notes)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok, upsertTagsByName } from "../../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = await db.notes.findUnique({ where: { id } });
    if (!note) return fail("NOT_FOUND", "note not found", 404);

    const body = (await req.json().catch(() => null)) as { tagNames?: unknown } | null;
    if (!body || !Array.isArray(body.tagNames) || body.tagNames.some((t) => typeof t !== "string")) {
      return fail("VALIDATION", "tagNames (string[]) is required", 400);
    }

    const tags = await upsertTagsByName(body.tagNames as string[]);
    const wantedIds = new Set(tags.map((t) => t.id));

    const existing = await db.noteTags.findMany({ where: { noteId: id } });
    const existingIds = new Set(existing.map((l) => l.tagId));

    const toDelete: string[] = [];
    for (const tagId of existingIds) if (!wantedIds.has(tagId)) toDelete.push(tagId);

    const toCreate = tags.filter((t) => !existingIds.has(t.id));

    if (toDelete.length > 0 || toCreate.length > 0) {
      await db.$transaction([
        ...(toDelete.length > 0
          ? [db.noteTags.deleteMany({ where: { noteId: id, tagId: { in: toDelete } } })]
          : []),
        ...(toCreate.length > 0
          ? [
              db.noteTags.createMany({
                data: toCreate.map((t) => ({ noteId: id, tagId: t.id })),
              }),
            ]
          : []),
      ]);
    }

    return ok({ id, tags });
  } catch (e) {
    console.error("note tags PUT error", e);
    return fail("SERVER_ERROR", "failed to set tags", 500);
  }
}
