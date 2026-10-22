/**
 * /api/notes/** — port of the notes API routes (verbatim logic):
 *   src/app/api/notes/route.ts              (GET list + POST create)
 *   src/app/api/notes/[id]/route.ts         (GET detail + PATCH + DELETE/purge)
 *   src/app/api/notes/[id]/tags/route.ts    (PUT replace tag set)
 *   src/app/api/notes/[id]/restore/route.ts (POST restore)
 *   src/app/api/notes/tags/route.ts         (GET tag chips)
 *   src/app/api/notes/trash/route.ts        (GET trash + DELETE purge-all)
 * plus the full src/app/api/notes/_lib.ts port (30-day trash purge cascade,
 * upsertTagsByName, tagsByNoteId). Search mirrors SQLite LIKE (ASCII-ci,
 * see shared.ciContains); the checklist task mapping REUSES the tasks
 * handler's toTaskDTO port (the server cross-imports tasks/_lib too).
 */

import { toLocalDateKey } from "@/lib/i18n/format";
import { resolveNoteImagePair } from "@/lib/image-compress";
import { getDb, uuid } from "../db";
import {
  ciContains,
  fail,
  jsonOrNull,
  ok,
  propagate,
  sanitizeLike,
  sortRows,
  type LocalRequest,
} from "../shared";
import type { NoteRow } from "../db";
import { toTaskDTO } from "./tasks";

/* ── notes/_lib.ts port ───────────────────────────────────────────── */

export const PURGE_DAYS = 30; // trash auto-purge window (days)
const DAY_MS = 86_400_000;

function nowISO(): string {
  return new Date().toISOString();
}

export interface TagRef {
  id: string;
  name: string;
}

/** Attach tag refs to a set of note ids (explicit join). */
export function tagsByNoteId(noteIds: string[]): Map<string, TagRef[]> {
  const map = new Map<string, TagRef[]>();
  if (noteIds.length === 0) return map;
  const db = getDb();
  const links = db.noteTags.filter((l) => noteIds.includes(l.noteId));
  if (links.length === 0) return map;
  const tagIds = [...new Set(links.map((l) => l.tagId))];
  const tags = db.tags.filter((t) => tagIds.includes(t.id));
  const tagById = new Map(tags.map((t) => [t.id, { id: t.id, name: t.name }]));
  for (const link of links) {
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const arr = map.get(link.noteId);
    if (arr) arr.push(tag);
    else map.set(link.noteId, [tag]);
  }
  return map;
}

/** Create (or reuse) tags by name and return the tag refs. */
export function upsertTagsByName(names: string[]): TagRef[] {
  const db = getDb();
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].slice(0, 20);
  if (unique.length === 0) return [];
  const now = nowISO();
  const rows = unique.map((name) => {
    const capped = name.slice(0, 50);
    const existing = db.tags.find((t) => t.name === capped);
    if (existing) {
      existing.updatedAt = now;
      return existing;
    }
    const row = { id: uuid(), name: capped, updatedAt: now };
    db.tags.push(row);
    return row;
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Opportunistic invariant: hard-delete trash rows older than PURGE_DAYS (+ cascade). */
export function purgeExpiredTrash(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - PURGE_DAYS * DAY_MS).toISOString();
  const expired = db.notes.filter((n) => n.deletedAt !== null && n.deletedAt < cutoff);
  if (expired.length === 0) return 0;
  const ids = expired.map((n) => n.id);
  db.noteTags = db.noteTags.filter((l) => !ids.includes(l.noteId));
  db.tasks = db.tasks.filter((t) => !(t.noteId !== null && ids.includes(t.noteId)));
  db.notes = db.notes.filter((n) => !ids.includes(n.id));
  return ids.length;
}

/* ── GET /api/notes ──────────────────────────────────────────────── */

const FILTERS = new Set(["active", "archived", "trash"]);

export function notesList(req: LocalRequest) {
  try {
    const db = getDb();
    purgeExpiredTrash(); // opportunistic, indexed on deletedAt

    const filter = req.query.get("filter") ?? "active";
    if (!FILTERS.has(filter)) {
      fail("VALIDATION", "filter must be one of active|archived|trash", 400);
    }
    const q = sanitizeLike(req.query.get("q") ?? "");
    const tag = (req.query.get("tag") ?? "").trim().slice(0, 50);

    // tag filter → allowed note ids (empty set = no results)
    let tagNoteIds: string[] | null = null;
    if (tag) {
      const tagRow = db.tags.find((t) => t.name === tag);
      if (!tagRow) return ok([]);
      const links = db.noteTags.filter((l) => l.tagId === tagRow.id);
      tagNoteIds = links.map((l) => l.noteId);
      if (tagNoteIds.length === 0) return ok([]);
    }

    // q also matches tag names → note ids reachable through matching tags
    let searchTagNoteIds: string[] | null = null;
    if (q) {
      const matchedTags = db.tags.filter((t) => ciContains(t.name, q));
      if (matchedTags.length > 0) {
        const ids = matchedTags.map((t) => t.id);
        const links = db.noteTags.filter((l) => ids.includes(l.tagId));
        searchTagNoteIds = links.map((l) => l.noteId);
      }
    }

    let rows = db.notes.filter((n) => {
      if (filter === "trash") {
        if (n.deletedAt === null) return false;
      } else {
        if (n.deletedAt !== null) return false;
        if (n.archived !== (filter === "archived")) return false;
      }
      if (tag && !(tagNoteIds as string[]).includes(n.id)) return false;
      if (q) {
        const matches =
          ciContains(n.title, q) ||
          ciContains(n.body, q) ||
          (searchTagNoteIds ?? []).includes(n.id);
        if (!matches) return false;
      }
      return true;
    });

    rows = sortRows(
      rows,
      filter === "trash"
        ? [["deletedAt", "desc"]]
        : [
            ["pinned", "desc"],
            ["updatedAt", "desc"],
          ]
    );

    const tagMap = tagsByNoteId(rows.map((n) => n.id));
    // lists never carry the full-size image — only the small thumbnail
    return ok(
      rows.map((n) => {
        const { image: _full, ...rest } = n;
        return { ...rest, tags: tagMap.get(n.id) ?? [] };
      })
    );
  } catch (e) {
    propagate(e, "failed to list notes");
  }
}

/* ── POST /api/notes ─────────────────────────────────────────────── */

export function notesCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = jsonOrNull(req) as
      | { title?: unknown; body?: unknown; image?: unknown; imageThumb?: unknown; tagNames?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      fail("VALIDATION", "json object body required", 400);
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const noteBody = typeof body.body === "string" ? body.body.slice(0, 100_000) : "";
    const imagePair = resolveNoteImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      fail("VALIDATION", "image/imageThumb must be a valid data-URL pair (or both null)", 400);
    }
    if (!title && !noteBody.trim() && imagePair.kind !== "set") {
      fail("VALIDATION", "title or body is required", 400);
    }
    if (
      body.tagNames !== undefined &&
      (!Array.isArray(body.tagNames) || body.tagNames.some((t) => typeof t !== "string"))
    ) {
      fail("VALIDATION", "tagNames must be an array of strings", 400);
    }

    const now = nowISO();
    const note: NoteRow = {
      id: uuid(),
      title,
      body: noteBody,
      pinned: false,
      archived: false,
      deletedAt: null,
      image: imagePair.kind === "set" ? imagePair.image : null,
      imageThumb: imagePair.kind === "set" ? imagePair.imageThumb : null,
      createdAt: now,
      updatedAt: now,
    };
    db.notes.push(note);

    const tagNames = Array.isArray(body.tagNames) ? (body.tagNames as string[]) : [];
    const tags = upsertTagsByName(tagNames);
    for (const t of tags) {
      db.noteTags.push({ noteId: note.id, tagId: t.id });
    }

    return ok({ ...note, tags });
  } catch (e) {
    propagate(e, "failed to create note");
  }
}

/* ── GET /api/notes/[id] ──────────────────────────────────────────── */

export function noteDetail(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const note = db.notes.find((n) => n.id === id);
    if (!note) fail("NOT_FOUND", "note not found", 404);
    const tagMap = tagsByNoteId([id]);
    const tasks = sortRows(
      db.tasks.filter((t) => t.noteId === id && t.deletedAt === null),
      [
        ["sortOrder", "asc"],
        ["createdAt", "asc"],
      ]
    );
    const dateKey = toLocalDateKey();
    return ok({
      ...note,
      tags: tagMap.get(id) ?? [],
      tasks: tasks.map((t) => toTaskDTO(t, dateKey)),
    });
  } catch (e) {
    propagate(e, "failed to load note");
  }
}

/* ── PATCH /api/notes/[id] ───────────────────────────────────────── */

export function noteUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const note = db.notes.find((n) => n.id === id);
    if (!note) fail("NOT_FOUND", "note not found", 404);

    const body = jsonOrNull(req) as
      | { title?: unknown; body?: unknown; image?: unknown; imageThumb?: unknown; pinned?: unknown; archived?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      fail("VALIDATION", "json object body required", 400);
    }

    const imagePair = resolveNoteImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      fail("VALIDATION", "image/imageThumb must be a valid data-URL pair (or both null)", 400);
    }

    const data: {
      title?: string;
      body?: string;
      image?: string | null;
      imageThumb?: string | null;
      pinned?: boolean;
      archived?: boolean;
    } = {};
    let touched = false;
    if (body.title !== undefined) {
      if (typeof body.title !== "string") fail("VALIDATION", "title must be a string", 400);
      data.title = body.title.trim().slice(0, 500);
      touched = true;
    }
    if (body.body !== undefined) {
      if (typeof body.body !== "string") fail("VALIDATION", "body must be a string", 400);
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
      if (typeof body.pinned !== "boolean") fail("VALIDATION", "pinned must be boolean", 400);
      data.pinned = body.pinned;
      touched = true;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") fail("VALIDATION", "archived must be boolean", 400);
      data.archived = body.archived;
      touched = true;
    }
    if (!touched) {
      fail("VALIDATION", "no updatable fields provided", 400);
    }

    Object.assign(note, data, { updatedAt: nowISO() });
    const tagMap = tagsByNoteId([id]);
    return ok({ ...note, tags: tagMap.get(id) ?? [] });
  } catch (e) {
    propagate(e, "failed to update note");
  }
}

/* ── DELETE /api/notes/[id] (trash; in-trash again = hard purge) ──── */

export function noteDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const note = db.notes.find((n) => n.id === id);
    if (!note) fail("NOT_FOUND", "note not found", 404);

    if (note.deletedAt) {
      // already trashed → hard purge (note + links + checklist tasks)
      db.noteTags = db.noteTags.filter((l) => l.noteId !== id);
      db.tasks = db.tasks.filter((t) => t.noteId !== id);
      db.notes = db.notes.filter((n) => n.id !== id);
      return ok({ action: "purged" as const });
    }

    note.deletedAt = nowISO();
    note.updatedAt = nowISO();
    return ok({ action: "trashed" as const });
  } catch (e) {
    propagate(e, "failed to delete note");
  }
}

/* ── PUT /api/notes/[id]/tags (replace the tag set) ──────────────── */

export function noteTagsReplace(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const note = db.notes.find((n) => n.id === id);
    if (!note) fail("NOT_FOUND", "note not found", 404);

    const body = jsonOrNull(req) as { tagNames?: unknown } | null;
    if (!body || typeof body !== "object" || !Array.isArray(body.tagNames) || body.tagNames.some((t) => typeof t !== "string")) {
      fail("VALIDATION", "tagNames (string[]) is required", 400);
    }

    const tags = upsertTagsByName(body.tagNames as string[]);
    const wantedIds = new Set(tags.map((t) => t.id));

    const existing = db.noteTags.filter((l) => l.noteId === id);
    const existingIds = new Set(existing.map((l) => l.tagId));

    db.noteTags = db.noteTags.filter((l) => !(l.noteId === id && !wantedIds.has(l.tagId)));
    for (const t of tags) {
      if (!existingIds.has(t.id)) db.noteTags.push({ noteId: id, tagId: t.id });
    }

    return ok({ id, tags });
  } catch (e) {
    propagate(e, "failed to set tags");
  }
}

/* ── POST /api/notes/[id]/restore ────────────────────────────────── */

export function noteRestore(req: LocalRequest) {
  try {
    const { id } = req.params;
    const db = getDb();
    const note = db.notes.find((n) => n.id === id);
    if (!note) fail("NOT_FOUND", "note not found", 404);

    if (note.deletedAt) {
      note.deletedAt = null;
      note.updatedAt = nowISO();
    }
    const tagMap = tagsByNoteId([id]);
    return ok({ ...note, tags: tagMap.get(id) ?? [] });
  } catch (e) {
    propagate(e, "failed to restore note");
  }
}

/* ── GET /api/notes/tags (chips with counts over live notes) ─────── */

export function notesTags() {
  try {
    const db = getDb();
    const tags = sortRows([...db.tags], [["name", "asc"]]);
    const live = new Set(db.notes.filter((n) => n.deletedAt === null).map((n) => n.id));
    const countByTag = new Map<string, number>();
    for (const link of db.noteTags) {
      if (!live.has(link.noteId)) continue;
      countByTag.set(link.tagId, (countByTag.get(link.tagId) ?? 0) + 1);
    }
    return ok(tags.map((t) => ({ id: t.id, name: t.name, count: countByTag.get(t.id) ?? 0 })));
  } catch (e) {
    propagate(e, "failed to list tags");
  }
}

/* ── GET /api/notes/trash ────────────────────────────────────────── */

export function notesTrashList() {
  try {
    const db = getDb();
    purgeExpiredTrash();
    const rows = sortRows(
      db.notes.filter((n) => n.deletedAt !== null),
      [["deletedAt", "desc"]]
    );
    const tagMap = tagsByNoteId(rows.map((n) => n.id));
    const now = Date.now();
    return ok(
      rows.map((n) => {
        const { image: _full, ...rest } = n;
        const ageDays = n.deletedAt ? (now - new Date(n.deletedAt).getTime()) / DAY_MS : 0;
        return {
          ...rest,
          tags: tagMap.get(n.id) ?? [],
          daysLeft: Math.max(0, Math.ceil(PURGE_DAYS - ageDays)),
        };
      })
    );
  } catch (e) {
    propagate(e, "failed to list trash");
  }
}

/* ── DELETE /api/notes/trash (purge all) ──────────────────────────── */

export function notesTrashPurge() {
  try {
    const db = getDb();
    const trashed = db.notes.filter((n) => n.deletedAt !== null);
    if (trashed.length > 0) {
      const ids = trashed.map((n) => n.id);
      db.noteTags = db.noteTags.filter((l) => !ids.includes(l.noteId));
      db.tasks = db.tasks.filter((t) => !(t.noteId !== null && ids.includes(t.noteId)));
      db.notes = db.notes.filter((n) => !ids.includes(n.id));
    }
    return ok({ purged: trashed.length });
  } catch (e) {
    propagate(e, "failed to purge trash");
  }
}
