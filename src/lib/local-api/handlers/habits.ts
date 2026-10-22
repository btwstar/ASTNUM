/**
 * /api/habits/** — port of the habits API routes (verbatim logic):
 *   src/app/api/habits/route.ts            (GET list + POST create)
 *   src/app/api/habits/[id]/route.ts       (GET detail + PATCH + DELETE)
 *   src/app/api/habits/[id]/log/route.ts   (POST upsert day log)
 *   src/app/api/habits/[id]/freeze/route.ts(POST streak freeze)
 *   src/app/api/habits/stats/route.ts      (GET per-date totals)
 * plus the field validators from src/app/api/habits/_helpers.ts.
 * Streak/schedule logic is REUSED from @/lib/logic/streak (never duplicated).
 */

import { toLocalDateKey } from "@/lib/i18n/format";
import {
  MAX_FREEZES_PER_MONTH,
  STREAK_MILESTONES,
  addDaysToKey,
  computeStreaks,
  gymPlanDue,
  isScheduledOn,
  isValidDateKey,
  keyToWeekday,
  monthFreezeCount,
  normalizeSchedule,
  parseSchedule,
  weeklyCompletion,
  type HabitSchedule,
} from "@/lib/logic/streak";
import { templateDisplayName } from "@/components/gym/shared";
import { getDb, uuid } from "../db";
import {
  bad,
  fail,
  ok,
  propagate,
  readJsonObject,
  sortRows,
  type LocalRequest,
} from "../shared";
import type { HabitRow } from "../db";

/* ── _helpers.ts port ─────────────────────────────────────────────── */

function resolveTodayKey(req: LocalRequest): string {
  const q = req.query.get("today");
  if (q && isValidDateKey(q)) return q;
  return toLocalDateKey();
}

function validName(value: unknown): string | null {
  if (typeof value !== "string") return "invalid_name";
  const name = value.trim();
  if (name.length < 1 || name.length > 120) return "invalid_name";
  return null;
}

function validColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return "invalid_color";
  return null;
}

function validIcon(value: unknown): string | null {
  if (typeof value !== "string") return "invalid_icon";
  const icon = value.trim();
  if (icon.length < 1 || icon.length > 40) return "invalid_icon";
  return null;
}

function validReminderTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return "invalid_reminder_time";
  }
  return null;
}

function validNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 2000) return "invalid_note";
  return null;
}

function notFound(): never {
  return fail("NOT_FOUND", "habit_not_found", 404);
}

function loadHabit(id: string): HabitRow | undefined {
  return getDb().habits.find((h) => h.id === id && h.deletedAt === null);
}

/* ── GET /api/habits ─────────────────────────────────────────────── */

export function habitsList(req: LocalRequest) {
  try {
    const db = getDb();
    const todayKey = resolveTodayKey(req);
    const startKey = addDaysToKey(todayKey, -400); // module contract: 400-day window
    const month = todayKey.slice(0, 7);

    const habits = sortRows(
      db.habits.filter((h) => h.deletedAt === null),
      [
        ["archived", "asc"],
        ["sortOrder", "asc"],
        ["createdAt", "asc"],
      ]
    );
    const logRows = db.habitLogs.filter((l) => l.date >= startKey && l.done);
    const freezeRows = db.streakFreezes.filter((f) => f.date >= startKey);

    const doneBy = new Map<string, Set<string>>();
    for (const row of logRows) {
      let set = doneBy.get(row.habitId);
      if (!set) {
        set = new Set<string>();
        doneBy.set(row.habitId, set);
      }
      set.add(row.date);
    }
    const frozenBy = new Map<string, Set<string>>();
    for (const row of freezeRows) {
      let set = frozenBy.get(row.habitId);
      if (!set) {
        set = new Set<string>();
        frozenBy.set(row.habitId, set);
      }
      set.add(row.date);
    }

    // Rotation considers ONLY active gym-plan habits (regular habits never
    // participate — their logs must not influence the workout queue order).
    const scheduleByHabit = new Map<string, HabitSchedule>();
    for (const h of habits) scheduleByHabit.set(h.id, parseSchedule(h.scheduleJson));
    const rotation = gymPlanDue(
      habits
        .filter((h) => !h.archived && scheduleByHabit.get(h.id)?.type === "gymPlan")
        .map((h) => ({
          id: h.id,
          sortOrder: h.sortOrder,
          createdAt: h.createdAt,
          doneDates: doneBy.get(h.id) ?? new Set<string>(),
          todayDone: (doneBy.get(h.id) ?? new Set<string>()).has(todayKey),
        })),
      todayKey
    );

    const list = habits.map((h) => {
      const schedule = scheduleByHabit.get(h.id) ?? { type: "daily" };
      const done = doneBy.get(h.id) ?? new Set<string>();
      const frozen = frozenBy.get(h.id) ?? new Set<string>();
      const streaks = computeStreaks(schedule, done, frozen, todayKey);
      const used = monthFreezeCount([...frozen], month);
      const last7: Array<{ date: string; done: boolean; scheduled: boolean }> = [];
      for (let i = 6; i >= 0; i--) {
        const key = addDaysToKey(todayKey, -i);
        last7.push({ date: key, done: done.has(key), scheduled: isScheduledOn(schedule, key) });
      }
      const isGymPlan = schedule.type === "gymPlan" && !h.archived;
      return {
        id: h.id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        schedule,
        reminderTime: h.reminderTime,
        note: h.note,
        sortOrder: h.sortOrder,
        archived: h.archived,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
        todayDone: done.has(todayKey),
        todayFrozen: frozen.has(todayKey),
        streaks,
        freezesUsedThisMonth: used,
        freezesRemainingThisMonth: Math.max(0, MAX_FREEZES_PER_MONTH - used),
        last7,
        gymTemplateId: h.gymTemplateId,
        gymTurn: isGymPlan ? (rotation.turn.get(h.id) ?? null) : null,
        gymPendingDays: isGymPlan ? (rotation.pendingDays.get(h.id) ?? 0) : 0,
      };
    });

    return ok({ today: todayKey, habits: list });
  } catch (e) {
    propagate(e, "failed_to_load_habits");
  }
}

/* ── POST /api/habits ────────────────────────────────────────────── */

export function habitsCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = readJsonObject(req);
    if (!body) bad("invalid_body");

    const nameError = validName(body.name);
    if (nameError) bad(nameError);
    const name = String(body.name).trim();

    const iconError = body.icon !== undefined ? validIcon(body.icon) : null;
    if (iconError) bad(iconError);
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "lucide:Repeat2";

    const colorError = body.color !== undefined ? validColor(body.color) : null;
    if (colorError) bad(colorError);
    const color = typeof body.color === "string" ? body.color : "#34d399";

    let schedule: HabitSchedule = { type: "daily" };
    if (body.schedule !== undefined) {
      const normalized = normalizeSchedule(body.schedule);
      // "gymPlan" is internal-only — created by habits/from-template.
      if (!normalized || normalized.type === "gymPlan") bad("invalid_schedule");
      schedule = normalized;
    }

    const reminderError = body.reminderTime !== undefined ? validReminderTime(body.reminderTime) : null;
    if (reminderError) bad(reminderError);
    const reminderTime =
      typeof body.reminderTime === "string" && body.reminderTime ? body.reminderTime : null;

    const noteError = body.note !== undefined ? validNote(body.note) : null;
    if (noteError) bad(noteError);
    const note = typeof body.note === "string" ? body.note : null;

    const lastSort = db.habits.reduce((max, h) => Math.max(max, h.sortOrder), -1);
    const now = new Date().toISOString();
    const created: HabitRow = {
      id: uuid(),
      name,
      icon,
      color,
      scheduleJson: JSON.stringify(schedule),
      gymTemplateId: null,
      reminderTime,
      note,
      sortOrder: lastSort + 1,
      archived: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.habits.push(created);

    return ok({ habit: { ...created, schedule: parseSchedule(created.scheduleJson) } });
  } catch (e) {
    propagate(e, "failed_to_create_habit");
  }
}

/* ── POST /api/habits/from-template ────────────────────────────── */

/** Habit color for linked workouts — mirrors the web route constant. */
const GYM_HABIT_COLOR = "#22d3ee";
const GYM_HABIT_ICON = "lucide:dumbbell";

/**
 * Customize a gym workout template onto the habits list (web route twin):
 * creates (or returns, idempotently) the gym-plan habit mirroring the
 * template — rotating workouts with automatic postponement until done.
 */
export function habitFromTemplate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = readJsonObject(req);
    if (!body) bad("json_object_body_required");
    if (typeof body.templateId !== "string" || !body.templateId.trim()) {
      bad("template_id_required");
    }
    const templateId = body.templateId.trim();
    const lang = body.lang === "en" ? "en" : "ar";

    const template = db.workoutTemplates.find(
      (t) => t.id === templateId && t.deletedAt === null
    );
    if (!template) fail("NOT_FOUND", "template_not_found", 404);

    // Idempotency: one active habit per template.
    const existing = db.habits.find(
      (h) => h.gymTemplateId === templateId && h.deletedAt === null
    );
    if (existing) {
      return ok({
        habit: { ...existing, schedule: parseSchedule(existing.scheduleJson) },
        created: false,
      });
    }

    const lastSort = db.habits.reduce((max, h) => Math.max(max, h.sortOrder), -1);
    const now = new Date().toISOString();
    const created: HabitRow = {
      id: uuid(),
      name: templateDisplayName(template.name, lang) || template.name,
      icon: GYM_HABIT_ICON,
      color: GYM_HABIT_COLOR,
      scheduleJson: JSON.stringify({ type: "gymPlan" }),
      gymTemplateId: templateId,
      reminderTime: null,
      note: null,
      sortOrder: lastSort + 1,
      archived: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.habits.push(created);

    return ok({
      habit: { ...created, schedule: parseSchedule(created.scheduleJson) },
      created: true,
    });
  } catch (e) {
    propagate(e, "failed_to_create_habit");
  }
}

/* ── GET /api/habits/[id] ────────────────────────────────────────── */

export function habitDetail(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const habit = loadHabit(id);
    if (!habit) notFound();

    const todayKey = resolveTodayKey(req);
    const logRows = db.habitLogs.filter((l) => l.habitId === id && l.done);
    const freezeRows = db.streakFreezes.filter((f) => f.habitId === id);
    const done = new Set(logRows.map((r) => r.date));
    const frozen = new Set(freezeRows.map((r) => r.date));
    const schedule = parseSchedule(habit.scheduleJson);
    const streaks = computeStreaks(schedule, done, frozen, todayKey);
    const month = todayKey.slice(0, 7);
    const used = monthFreezeCount([...frozen], month);

    // 5-week grid (35 cells) ending within the current week, weekday columns aligned.
    const gridStartOffset = 4 * 7 + keyToWeekday(todayKey);
    const days: Array<{ date: string; done: boolean; scheduled: boolean; frozen: boolean }> = [];
    for (let i = 0; i < 35; i++) {
      const key = addDaysToKey(todayKey, i - gridStartOffset);
      days.push({
        date: key,
        done: done.has(key),
        scheduled: isScheduledOn(schedule, key),
        frozen: frozen.has(key),
      });
    }

    return ok({
      today: todayKey,
      habit: {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        schedule,
        reminderTime: habit.reminderTime,
        note: habit.note,
        sortOrder: habit.sortOrder,
        archived: habit.archived,
        createdAt: habit.createdAt,
        updatedAt: habit.updatedAt,
        gymTemplateId: habit.gymTemplateId,
      },
      days,
      streaks,
      weeklyRate: weeklyCompletion(schedule, done, addDaysToKey(todayKey, -6)),
      freezesUsedThisMonth: used,
      freezesRemainingThisMonth: Math.max(0, MAX_FREEZES_PER_MONTH - used),
      todayDone: done.has(todayKey),
      todayFrozen: frozen.has(todayKey),
    });
  } catch (e) {
    propagate(e, "failed_to_load_habit");
  }
}

/* ── PATCH /api/habits/[id] ──────────────────────────────────────── */

export function habitUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const habit = loadHabit(id);
    if (!habit) notFound();

    const body = readJsonObject(req);
    if (!body) bad("invalid_body");

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const err = validName(body.name);
      if (err) bad(err);
      data.name = String(body.name).trim();
    }
    if (body.icon !== undefined) {
      const err = validIcon(body.icon);
      if (err) bad(err);
      data.icon = String(body.icon).trim();
    }
    if (body.color !== undefined) {
      const err = validColor(body.color);
      if (err) bad(err);
      data.color = String(body.color);
    }
    if (body.schedule !== undefined) {
      const normalized: HabitSchedule | null = normalizeSchedule(body.schedule);
      // "gymPlan" is internal-only — never editable from the habit editor.
      if (!normalized || normalized.type === "gymPlan") bad("invalid_schedule");
      data.scheduleJson = JSON.stringify(normalized);
    }
    if (body.reminderTime !== undefined) {
      const err = validReminderTime(body.reminderTime);
      if (err) bad(err);
      data.reminderTime = body.reminderTime === null ? null : String(body.reminderTime);
    }
    if (body.note !== undefined) {
      const err = validNote(body.note);
      if (err) bad(err);
      data.note = body.note === null ? null : String(body.note);
    }
    if (body.sortOrder !== undefined) {
      if (
        typeof body.sortOrder !== "number" ||
        !Number.isInteger(body.sortOrder) ||
        body.sortOrder < 0
      ) {
        bad("invalid_sort_order");
      }
      data.sortOrder = body.sortOrder;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") bad("invalid_archived");
      data.archived = body.archived;
    }

    if (Object.keys(data).length === 0) bad("empty_update");

    data.updatedAt = new Date().toISOString();
    Object.assign(habit, data);

    return ok({ habit: { ...habit, schedule: parseSchedule(habit.scheduleJson) } });
  } catch (e) {
    propagate(e, "failed_to_update_habit");
  }
}

/* ── DELETE /api/habits/[id] (soft delete; logs kept) ─────────────── */

export function habitDelete(req: LocalRequest) {
  try {
    const { id } = req.params;
    const habit = loadHabit(id);
    if (!habit) notFound();

    const now = new Date().toISOString();
    habit.deletedAt = now;
    habit.updatedAt = now;

    return ok({ deleted: true });
  } catch (e) {
    propagate(e, "failed_to_delete_habit");
  }
}

/* ── POST /api/habits/[id]/log ────────────────────────────────────── */

export function habitLog(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const habit = loadHabit(id);
    if (!habit) notFound();

    const body = readJsonObject(req);
    if (!body) bad("invalid_body");
    if (typeof body.date !== "string" || !isValidDateKey(body.date)) bad("invalid_date");
    if (typeof body.done !== "boolean") bad("invalid_done");

    const todayKey = resolveTodayKey(req);
    if (body.date > todayKey) bad("future_date"); // can't log the future

    const now = new Date().toISOString();
    const existing = db.habitLogs.find((l) => l.habitId === id && l.date === body.date);
    if (existing) {
      existing.done = body.done;
      existing.updatedAt = now;
    } else {
      db.habitLogs.push({
        id: uuid(),
        habitId: id,
        date: body.date,
        done: body.done,
        updatedAt: now,
      });
    }

    // Recompute from the FULL history so retroactive edits stay exact.
    const doneSet = new Set(
      db.habitLogs.filter((l) => l.habitId === id && l.done).map((r) => r.date)
    );
    const freezeSet = new Set(db.streakFreezes.filter((f) => f.habitId === id).map((r) => r.date));
    const streaks = computeStreaks(parseSchedule(habit.scheduleJson), doneSet, freezeSet, todayKey);

    const milestone =
      body.done && (STREAK_MILESTONES as readonly number[]).includes(streaks.current)
        ? streaks.current
        : null;

    return ok({
      done: body.done,
      date: body.date,
      streaks,
      milestone,
      todayDone: doneSet.has(todayKey),
    });
  } catch (e) {
    propagate(e, "failed_to_log_habit");
  }
}

/* ── POST /api/habits/[id]/freeze ─────────────────────────────────── */

export function habitFreeze(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const habit = loadHabit(id);
    if (!habit) notFound();

    const body = readJsonObject(req);
    if (!body) bad("invalid_body");
    if (typeof body.date !== "string" || !isValidDateKey(body.date)) bad("invalid_date");

    const todayKey = resolveTodayKey(req);
    const date = body.date;
    if (date > todayKey) bad("future_date"); // can't freeze the future

    // A completed day doesn't need protection.
    if (db.habitLogs.some((l) => l.habitId === id && l.date === date && l.done)) {
      bad("date_already_done");
    }

    // Idempotency: freezing an already-frozen day is a no-op success.
    const existing = db.streakFreezes.find((f) => f.habitId === id && f.date === date);

    if (!existing) {
      // Monthly quota: at most MAX_FREEZES_PER_MONTH per habit per calendar month.
      const yearMonth = date.slice(0, 7);
      const freezesInMonth = db.streakFreezes.filter(
        (f) => f.habitId === id && f.date.startsWith(yearMonth)
      );
      if (freezesInMonth.length >= MAX_FREEZES_PER_MONTH) {
        fail("FREEZE_LIMIT", "freeze_month_limit", 400);
      }
      db.streakFreezes.push({
        id: uuid(),
        habitId: id,
        date,
        updatedAt: new Date().toISOString(),
      });
    }

    // Recompute so the client gets fresh streaks + quota in one round trip.
    const doneSet = new Set(
      db.habitLogs.filter((l) => l.habitId === id && l.done).map((r) => r.date)
    );
    const freezeRows = db.streakFreezes.filter((f) => f.habitId === id);
    const freezeDates = freezeRows.map((r) => r.date);
    const freezeSet = new Set(freezeDates);
    const streaks = computeStreaks(parseSchedule(habit.scheduleJson), doneSet, freezeSet, todayKey);
    const used = monthFreezeCount(freezeDates, date.slice(0, 7));

    return ok({
      date,
      freezesUsedThisMonth: used,
      remaining: Math.max(0, MAX_FREEZES_PER_MONTH - used),
      streaks,
    });
  } catch (e) {
    propagate(e, "failed_to_freeze");
  }
}

/* ── GET /api/habits/stats ───────────────────────────────────────── */

const MAX_RANGE_DAYS = 400;

function dailyScheduledWeight(scheduleJson: string, dateKey: string): number {
  const schedule = parseSchedule(scheduleJson);
  if (schedule.type === "daily") return 1;
  if (schedule.type === "weekdays") {
    const days =
      schedule.days && schedule.days.length > 0 ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
    return days.includes(keyToWeekday(dateKey)) ? 1 : 0;
  }
  // timesPerWeek: distribute the weekly target across 7 days.
  const times = Math.min(7, Math.max(1, Math.round(schedule.times ?? 3)));
  return times / 7;
}

export function habitsStats(req: LocalRequest) {
  try {
    const db = getDb();
    const from = req.query.get("from");
    const to = req.query.get("to");

    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) bad("invalid_from");
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) bad("invalid_to");
    if (from > to) bad("invalid_range");

    const habits = db.habits.filter((h) => h.deletedAt === null);
    const logRows = db.habitLogs.filter((l) => l.date >= from && l.date <= to && l.done);

    const doneByDate = new Map<string, number>();
    for (const row of logRows) {
      doneByDate.set(row.date, (doneByDate.get(row.date) ?? 0) + 1);
    }

    const days: Array<{ date: string; scheduled: number; done: number }> = [];
    let cursor = from;
    let count = 0;
    while (cursor <= to) {
      if (++count > MAX_RANGE_DAYS) bad("range_too_long");
      let scheduled = 0;
      for (const h of habits) scheduled += dailyScheduledWeight(h.scheduleJson, cursor);
      days.push({
        date: cursor,
        scheduled: Math.round(scheduled * 1000) / 1000,
        done: doneByDate.get(cursor) ?? 0,
      });
      cursor = addDaysToKey(cursor, 1);
    }

    return ok({ from, to, habitCount: habits.length, days });
  } catch (e) {
    propagate(e, "failed_to_load_stats");
  }
}
