/**
 * GET  /api/habits?today=YYYY-MM-DD → all non-deleted habits with live state:
 *   today's done state, current/best streaks, freezes used this month and a
 *   7-day done/scheduled window for the card mini-calendar.
 *   Streaks are computed from logs of the trailing 400 days (per module
 *   contract) — the per-habit detail endpoint uses the FULL history.
 *   Gym-plan habits (linked workout templates) additionally get gymTurn /
 *   gymPendingDays from the shared rotation engine — an unfinished workout
 *   stays "due" every following day until it is completed (auto-postponement).
 *
 * POST /api/habits { name, icon, color, schedule, reminderTime?, note? }
 *   → create a habit (sortOrder = max + 1). Schedule "gymPlan" is NOT
 *   accepted here — it is created exclusively by POST /api/habits/from-template.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  addDaysToKey,
  computeStreaks,
  gymPlanDue,
  isScheduledOn,
  monthFreezeCount,
  normalizeSchedule,
  parseSchedule,
  MAX_FREEZES_PER_MONTH,
  type HabitSchedule,
} from "@/lib/logic/streak";
import {
  ok,
  bad,
  serverError,
  resolveTodayKey,
  readJson,
  validName,
  validColor,
  validIcon,
  validReminderTime,
  validNote,
} from "./_helpers";

export const dynamic = "force-dynamic";

interface HabitStateDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  reminderTime: string | null;
  note: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  todayDone: boolean;
  todayFrozen: boolean;
  streaks: { current: number; best: number };
  freezesUsedThisMonth: number;
  freezesRemainingThisMonth: number;
  /** 7 entries ending at today, oldest first — for the card mini-dots. */
  last7: Array<{ date: string; done: boolean; scheduled: boolean }>;
  /** set when this habit mirrors a workout template (schedule = gymPlan) */
  gymTemplateId: string | null;
  /** "due" = your turn today (postponed until done) | "next" = queued behind it */
  gymTurn: "due" | "next" | null;
  /** days since its last completion (0 when never done) — due + >1 = postponed */
  gymPendingDays: number;
}

export async function GET(req: NextRequest) {
  try {
    const todayKey = resolveTodayKey(req);
    const startKey = addDaysToKey(todayKey, -400); // module contract: 400-day window
    const month = todayKey.slice(0, 7);

    const [habits, logRows, freezeRows] = await Promise.all([
      db.habits.findMany({
        where: { deletedAt: null },
        orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.habitLogs.findMany({
        where: { date: { gte: startKey }, done: true },
        select: { habitId: true, date: true },
      }),
      db.streakFreezes.findMany({
        where: { date: { gte: startKey } },
        select: { habitId: true, date: true },
      }),
    ]);

    // Group in JS — single query per table, no N+1.
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

    const list: HabitStateDTO[] = habits.map((h) => {
      const schedule = scheduleByHabit.get(h.id) ?? { type: "daily" };
      const done = doneBy.get(h.id) ?? new Set<string>();
      const frozen = frozenBy.get(h.id) ?? new Set<string>();
      const streaks = computeStreaks(schedule, done, frozen, todayKey);
      const used = monthFreezeCount([...frozen], month);
      const last7: HabitStateDTO["last7"] = [];
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
    console.error("habits GET error", e);
    return serverError("failed_to_load_habits");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return bad("invalid_body");

    const nameError = validName(body.name);
    if (nameError) return bad(nameError);
    const name = String(body.name).trim();

    const iconError = body.icon !== undefined ? validIcon(body.icon) : null;
    if (iconError) return bad(iconError);
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "lucide:Repeat2";

    const colorError = body.color !== undefined ? validColor(body.color) : null;
    if (colorError) return bad(colorError);
    const color = typeof body.color === "string" ? body.color : "#34d399";

    let schedule: HabitSchedule = { type: "daily" };
    if (body.schedule !== undefined) {
      const normalized = normalizeSchedule(body.schedule);
      if (!normalized || normalized.type === "gymPlan") return bad("invalid_schedule");
      schedule = normalized;
    }

    const reminderError = body.reminderTime !== undefined ? validReminderTime(body.reminderTime) : null;
    if (reminderError) return bad(reminderError);
    const reminderTime =
      typeof body.reminderTime === "string" && body.reminderTime ? body.reminderTime : null;

    const noteError = body.note !== undefined ? validNote(body.note) : null;
    if (noteError) return bad(noteError);
    const note = typeof body.note === "string" ? body.note : null;

    const last = await db.habits.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const now = new Date().toISOString();
    const created = await db.habits.create({
      data: {
        id: crypto.randomUUID(),
        name,
        icon,
        color,
        scheduleJson: JSON.stringify(schedule),
        reminderTime,
        note,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        archived: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    return ok({
      habit: { ...created, schedule: parseSchedule(created.scheduleJson) },
    });
  } catch (e) {
    console.error("habits POST error", e);
    return serverError("failed_to_create_habit");
  }
}
