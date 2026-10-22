/**
 * Shared client-side types for the notes & tasks module.
 * Mirrors the API DTOs 1:1.
 */

export interface TagRef {
  id: string;
  name: string;
}

export interface TagWithCount extends TagRef {
  /** number of live (non-deleted) notes using this tag */
  count: number;
}

/** List/card row — carries only the small list thumbnail, never the full image. */
export interface NoteDTO {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  deletedAt: string | null;
  imageThumb: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagRef[];
}

export interface TrashNote extends NoteDTO {
  daysLeft: number;
}

export type RepeatType = "none" | "daily" | "weekly" | "weekdays";

export interface RepeatRule {
  type: RepeatType;
  days?: number[];
  interval?: number;
}

export interface TaskDTO {
  id: string;
  noteId: string | null;
  title: string;
  dueAt: string | null;
  /** 0 = high, 1 = medium, 2 = low, 3 = none */
  priority: number;
  done: boolean;
  doneAt: string | null;
  repeatRule: RepeatRule;
  repeating: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** effective done state for the viewed date (repeating → doneAt on that date) */
  doneToday: boolean;
  overdue: boolean;
}

export interface NoteDetail extends NoteDTO {
  /** full-size attachment — only the DETAIL route returns it */
  image: string | null;
  tasks: TaskDTO[];
}

export interface TasksTodayResponse {
  today: TaskDTO[];
  overdue: TaskDTO[];
  /** v1.15: explicitly scheduled for AFTER today ("قادمة" section) */
  upcoming: TaskDTO[];
  completedToday: TaskDTO[];
  date: string;
}

/** Trashed task with days-left-to-purge badge (mirrors TrashNote). */
export interface TrashTask extends TaskDTO {
  daysLeft: number;
}

export interface CreateNoteInput {
  title?: string;
  body?: string;
  /** image pair travels together (validated server-side) */
  image?: string;
  imageThumb?: string;
  tagNames?: string[];
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  /** image pair travels together: both strings set, both null remove */
  image?: string | null;
  imageThumb?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface CreateTaskInput {
  title: string;
  noteId?: string | null;
  dueAt?: string | null;
  priority?: number;
  repeatRule?: RepeatRule;
}

export interface UpdateTaskInput {
  title?: string;
  dueAt?: string | null;
  priority?: number;
  done?: boolean;
  repeatRule?: RepeatRule;
}

/** Priority → dot color class (0 red, 1 amber, 2 muted, 3 none). */
export const PRIORITY_DOT: Record<number, string> = {
  0: "bg-danger",
  1: "bg-warning",
  2: "bg-muted-foreground",
  3: "bg-transparent border border-border",
};

/** All due-date/priority math for quick menus lives here — single source of truth. */
export function dueTodayISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0); // "today" = 18:00 local (sensible evening target)
  if (d.getTime() < now.getTime()) d.setTime(now.getTime() + 60 * 60 * 1000);
  return d.toISOString();
}

export function dueTomorrowISO(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function dueNextWeekISO(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** Postpone by 24h (keeps time when present, otherwise tomorrow 09:00). */
export function postponedISO(dueAt: string | null, now = new Date()): string {
  if (!dueAt) return dueTomorrowISO(now);
  const next = new Date(new Date(dueAt).getTime() + 86_400_000);
  return next.toISOString();
}
