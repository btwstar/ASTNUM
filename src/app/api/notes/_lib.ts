/**
 * Shared helpers for /api/notes routes.
 * Server-only. Envelope contract: { ok: true, data } | { ok: false, error: { code, message } }
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export const PURGE_DAYS = 30; // trash auto-purge window (days)
const DAY_MS = 86_400_000;

export function nowISO(): string {
  return new Date().toISOString();
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: "VALIDATION" | "NOT_FOUND" | "SERVER_ERROR",
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/** Strip LIKE wildcard chars so user input can't inject %/_ patterns. */
export function sanitizeLike(q: string): string {
  return q.replace(/[%_]/g, " ").trim();
}

export interface TagRef {
  id: string;
  name: string;
}

/**
 * Attach tag refs to a set of note ids (explicit join — schema has no FK relations).
 * Returns a Map<noteId, TagRef[]>.
 */
export async function tagsByNoteId(noteIds: string[]): Promise<Map<string, TagRef[]>> {
  const map = new Map<string, TagRef[]>();
  if (noteIds.length === 0) return map;
  const links = await db.noteTags.findMany({ where: { noteId: { in: noteIds } } });
  if (links.length === 0) return map;
  const tagIds = [...new Set(links.map((l) => l.tagId))];
  const tags = await db.tags.findMany({ where: { id: { in: tagIds } } });
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

/**
 * Create (or reuse) tags by name and return the tag rows.
 * Names are trimmed, deduped and length-capped.
 */
export async function upsertTagsByName(names: string[]): Promise<TagRef[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].slice(0, 20);
  if (unique.length === 0) return [];
  const now = nowISO();
  const rows = await Promise.all(
    unique.map((name) =>
      db.tags.upsert({
        where: { name: name.slice(0, 50) },
        create: { id: randomUUID(), name: name.slice(0, 50), updatedAt: now },
        update: { updatedAt: now },
      })
    )
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Opportunistic invariant: hard-delete trash rows older than PURGE_DAYS.
 * Called from GET /api/notes (cheap — indexed on deletedAt) and GET /api/notes/trash.
 *
 * Purged notes also hard-delete their NoteTags AND their checklist Tasks
 * (a checklist item is part of its container note — without the note it's orphaned).
 */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_DAYS * DAY_MS).toISOString();
  const expired = await db.notes.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((n) => n.id);
  await db.$transaction([
    db.noteTags.deleteMany({ where: { noteId: { in: ids } } }),
    db.tasks.deleteMany({ where: { noteId: { in: ids } } }),
    db.notes.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}
