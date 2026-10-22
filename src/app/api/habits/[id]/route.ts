/**
 * GET    /api/habits/[id]?today=YYYY-MM-DD → full habit detail over the WHOLE
 *        history: 35-day day-by-day calendar (done/scheduled/frozen) ending at
 *        today, streaks, weekly completion rate, freeze status.
 * PATCH  /api/habits/[id] → partial update (name/icon/color/schedule/
 *        reminderTime/note/sortOrder/archived).
 * DELETE /api/habits/[id] → soft delete (deletedAt set, logs kept).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  addDaysToKey,
  computeStreaks,
  isScheduledOn,
  keyToWeekday,
  monthFreezeCount,
  normalizeSchedule,
  parseSchedule,
  weeklyCompletion,
  MAX_FREEZES_PER_MONTH,
  type HabitSchedule,
} from "@/lib/logic/streak";
import {
  ok,
  bad,
  notFound,
  serverError,
  resolveTodayKey,
  readJson,
  validName,
  validColor,
  validIcon,
  validReminderTime,
  validNote,
} from "../_helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadHabit(id: string) {
  const habit = await db.habits.findFirst({ where: { id, deletedAt: null } });
  return habit;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const habit = await loadHabit(id);
    if (!habit) return notFound();

    const todayKey = resolveTodayKey(req);
    const [logRows, freezeRows] = await Promise.all([
      db.habitLogs.findMany({ where: { habitId: id, done: true }, select: { date: true } }),
      db.streakFreezes.findMany({ where: { habitId: id }, select: { date: true } }),
    ]);
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
    console.error("habit GET error", e);
    return serverError("failed_to_load_habit");
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const habit = await loadHabit(id);
    if (!habit) return notFound();

    const body = await readJson(req);
    if (!body) return bad("invalid_body");

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const err = validName(body.name);
      if (err) return bad(err);
      data.name = String(body.name).trim();
    }
    if (body.icon !== undefined) {
      const err = validIcon(body.icon);
      if (err) return bad(err);
      data.icon = String(body.icon).trim();
    }
    if (body.color !== undefined) {
      const err = validColor(body.color);
      if (err) return bad(err);
      data.color = String(body.color);
    }
    if (body.schedule !== undefined) {
      const normalized: HabitSchedule | null = normalizeSchedule(body.schedule);
      // "gymPlan" is internal-only — created by /api/habits/from-template,
      // never editable from the public habit editor.
      if (!normalized || normalized.type === "gymPlan") return bad("invalid_schedule");
      data.scheduleJson = JSON.stringify(normalized);
    }
    if (body.reminderTime !== undefined) {
      const err = validReminderTime(body.reminderTime);
      if (err) return bad(err);
      data.reminderTime = body.reminderTime === null ? null : String(body.reminderTime);
    }
    if (body.note !== undefined) {
      const err = validNote(body.note);
      if (err) return bad(err);
      data.note = body.note === null ? null : String(body.note);
    }
    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder) || body.sortOrder < 0) {
        return bad("invalid_sort_order");
      }
      data.sortOrder = body.sortOrder;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") return bad("invalid_archived");
      data.archived = body.archived;
    }

    if (Object.keys(data).length === 0) return bad("empty_update");

    data.updatedAt = new Date().toISOString();
    const updated = await db.habits.update({ where: { id }, data });

    return ok({ habit: { ...updated, schedule: parseSchedule(updated.scheduleJson) } });
  } catch (e) {
    console.error("habit PATCH error", e);
    return serverError("failed_to_update_habit");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const habit = await loadHabit(id);
    if (!habit) return notFound();

    // Soft delete: the habit disappears from lists, its logs are kept.
    await db.habits.update({
      where: { id },
      data: { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });

    return ok({ deleted: true });
  } catch (e) {
    console.error("habit DELETE error", e);
    return serverError("failed_to_delete_habit");
  }
}
