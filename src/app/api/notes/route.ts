/**
 * /api/notes — list + create.
 *
 * GET  ?q=&tag=&filter=(active|archived|trash)
 *      - active:    deletedAt=null, archived=false
 *      - archived:  deletedAt=null, archived=true
 *      - trash:     deletedAt set (ordered by deletedAt desc)
 *      Ordering (non-trash): pinned first, then updatedAt desc.
 *      Search q matches title+body via SQLite LIKE %q% (ASCII case-insensitive —
 *      honest limitation: FTS5 is not reachable through the Prisma layer) and
 *      also matches tag names.
 *      Side-effect (cheap invariant): trash rows older than 30 days are purged.
 *
 * POST { title?, body?, image?, imageThumb?, tagNames? } → create note.
 *      image/imageThumb: paired canvas-compressed data URLs (both-or-neither,
 *      validated + hard-capped via the shared guard in @/lib/image-compress).
 */
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { resolveNoteImagePair } from "@/lib/image-compress";
import { fail, nowISO, ok, purgeExpiredTrash, sanitizeLike, tagsByNoteId, upsertTagsByName } from "./_lib";

export const dynamic = "force-dynamic";

const FILTERS = new Set(["active", "archived", "trash"]);

export async function GET(req: NextRequest) {
  try {
    await purgeExpiredTrash(); // opportunistic, indexed on deletedAt

    const sp = req.nextUrl.searchParams;
    const filter = sp.get("filter") ?? "active";
    if (!FILTERS.has(filter)) {
      return fail("VALIDATION", "filter must be one of active|archived|trash", 400);
    }
    const q = sanitizeLike(sp.get("q") ?? "");
    const tag = (sp.get("tag") ?? "").trim().slice(0, 50);

    // tag filter → allowed note ids (empty set = no results)
    let tagNoteIds: string[] | null = null;
    if (tag) {
      const tagRow = await db.tags.findUnique({ where: { name: tag } });
      if (!tagRow) return ok([]);
      const links = await db.noteTags.findMany({ where: { tagId: tagRow.id }, select: { noteId: true } });
      tagNoteIds = links.map((l) => l.noteId);
      if (tagNoteIds.length === 0) return ok([]);
    }

    // q also matches tag names → note ids reachable through matching tags
    let searchTagNoteIds: string[] | null = null;
    if (q) {
      const matchedTags = await db.tags.findMany({
        where: { name: { contains: q } },
        select: { id: true },
      });
      if (matchedTags.length > 0) {
        const links = await db.noteTags.findMany({
          where: { tagId: { in: matchedTags.map((t) => t.id) } },
          select: { noteId: true },
        });
        searchTagNoteIds = links.map((l) => l.noteId);
      }
    }

    const where: Prisma.NotesWhereInput = {};
    const and: Prisma.NotesWhereInput[] = [];
    if (filter === "trash") {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
      where.archived = filter === "archived";
    }
    if (tag) and.push({ id: { in: tagNoteIds as string[] } });
    if (q) {
      and.push({
        OR: [
          { title: { contains: q } },
          { body: { contains: q } },
          { id: { in: searchTagNoteIds ?? [] } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;

    const notes = await db.notes.findMany({
      where,
      orderBy:
        filter === "trash"
          ? { deletedAt: "desc" }
          : [{ pinned: "desc" }, { updatedAt: "desc" }],
    });

    const tagMap = await tagsByNoteId(notes.map((n) => n.id));
    return ok(
      // lists never carry the full-size image — only the small thumbnail
      notes.map(({ image: _full, ...n }) => ({ ...n, tags: tagMap.get(n.id) ?? [] }))
    );
  } catch (e) {
    console.error("notes GET error", e);
    return fail("SERVER_ERROR", "failed to list notes", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { title?: unknown; body?: unknown; image?: unknown; imageThumb?: unknown; tagNames?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return fail("VALIDATION", "json object body required", 400);
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const noteBody = typeof body.body === "string" ? body.body.slice(0, 100_000) : "";
    const imagePair = resolveNoteImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      return fail("VALIDATION", "image/imageThumb must be a valid data-URL pair (or both null)", 400);
    }
    if (!title && !noteBody.trim() && imagePair.kind !== "set") {
      return fail("VALIDATION", "title or body is required", 400);
    }
    if (
      body.tagNames !== undefined &&
      (!Array.isArray(body.tagNames) || body.tagNames.some((t) => typeof t !== "string"))
    ) {
      return fail("VALIDATION", "tagNames must be an array of strings", 400);
    }

    const now = nowISO();
    const note = await db.notes.create({
      data: {
        id: randomUUID(),
        title,
        body: noteBody,
        pinned: false,
        archived: false,
        image: imagePair.kind === "set" ? imagePair.image : null,
        imageThumb: imagePair.kind === "set" ? imagePair.imageThumb : null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const tagNames = Array.isArray(body.tagNames) ? (body.tagNames as string[]) : [];
    const tags = await upsertTagsByName(tagNames);
    if (tags.length > 0) {
      await db.noteTags.createMany({
        data: tags.map((t) => ({ noteId: note.id, tagId: t.id })),
      });
    }

    return ok({ ...note, tags }, 201);
  } catch (e) {
    console.error("notes POST error", e);
    return fail("SERVER_ERROR", "failed to create note", 500);
  }
}
