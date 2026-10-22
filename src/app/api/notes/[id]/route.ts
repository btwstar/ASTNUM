/**
 * /api/notes/[id] — detail, update, soft delete.
 *
 * GET    → note + its tags + its checklist tasks (noteId=id, not deleted, sortOrder asc).
 * PATCH  { title?, body?, image?, imageThumb?, pinned?, archived? } → bump updatedAt.
 *         image/imageThumb travel as a pair: both strings set it, both null
 *         remove it, absent leaves it untouched.
 * DELETE → soft delete (deletedAt=now, lands in trash, auto-purged after 30 days).
 *          Deleting a note that is ALREADY in trash hard-purges it
 *          (note + noteTags + its checklist tasks). This is the "delete forever" path.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/i18n/format";
import { resolveNoteImagePair } from "@/lib/image-compress";
import { toTaskDTO } from "../../tasks/_lib";
import { fail, nowISO, ok, tagsByNoteId } from "../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = await db.notes.findUnique({ where: { id } });
    if (!note) return fail("NOT_FOUND", "note not found", 404);
    const tagMap = await tagsByNoteId([id]);
    const tasks = await db.tasks.findMany({
      where: { noteId: id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    // normalize tasks to the shared TaskDTO shape (parsed repeatRule + derived flags)
    const dateKey = toLocalDateKey();
    return ok({
      ...note,
      tags: tagMap.get(id) ?? [],
      tasks: tasks.map((t) => toTaskDTO(t, dateKey)),
    });
  } catch (e) {
    console.error("note GET error", e);
    return fail("SERVER_ERROR", "failed to load note", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = await db.notes.findUnique({ where: { id } });
    if (!note) return fail("NOT_FOUND", "note not found", 404);

    const body = (await req.json().catch(() => null)) as
      | { title?: unknown; body?: unknown; image?: unknown; imageThumb?: unknown; pinned?: unknown; archived?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return fail("VALIDATION", "json object body required", 400);
    }

    const imagePair = resolveNoteImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      return fail("VALIDATION", "image/imageThumb must be a valid data-URL pair (or both null)", 400);
    }

    const data: {
      title?: string;
      body?: string;
      image?: string | null;
      imageThumb?: string | null;
      pinned?: boolean;
      archived?: boolean;
      updatedAt: string;
    } = { updatedAt: nowISO() };
    let touched = false;
    if (body.title !== undefined) {
      if (typeof body.title !== "string") return fail("VALIDATION", "title must be a string", 400);
      data.title = body.title.trim().slice(0, 500);
      touched = true;
    }
    if (body.body !== undefined) {
      if (typeof body.body !== "string") return fail("VALIDATION", "body must be a string", 400);
      data.body = body.body.slice(0, 100_000);
      touched = true;
    }
    if (imagePair.kind === "set") {
      data.image = imagePair.image;
      data.imageThumb = imagePair.imageThumb;
      touched = true;
    } else if (imagePair.kind === "remove") {
      data.image = null;
      data.imageThumb = null;
      touched = true;
    }
    if (body.pinned !== undefined) {
      if (typeof body.pinned !== "boolean") return fail("VALIDATION", "pinned must be boolean", 400);
      data.pinned = body.pinned;
      touched = true;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") return fail("VALIDATION", "archived must be boolean", 400);
      data.archived = body.archived;
      touched = true;
    }
    if (!touched) {
      return fail("VALIDATION", "no updatable fields provided", 400);
    }

    const updated = await db.notes.update({ where: { id }, data });
    const tagMap = await tagsByNoteId([id]);
    return ok({ ...updated, tags: tagMap.get(id) ?? [] });
  } catch (e) {
    console.error("note PATCH error", e);
    return fail("SERVER_ERROR", "failed to update note", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = await db.notes.findUnique({ where: { id } });
    if (!note) return fail("NOT_FOUND", "note not found", 404);

    if (note.deletedAt) {
      // already trashed → hard purge (note + links + checklist tasks)
      await db.$transaction([
        db.noteTags.deleteMany({ where: { noteId: id } }),
        db.tasks.deleteMany({ where: { noteId: id } }),
        db.notes.delete({ where: { id } }),
      ]);
      return ok({ action: "purged" as const });
    }

    await db.notes.update({ where: { id }, data: { deletedAt: nowISO(), updatedAt: nowISO() } });
    return ok({ action: "trashed" as const });
  } catch (e) {
    console.error("note DELETE error", e);
    return fail("SERVER_ERROR", "failed to delete note", 500);
  }
}
