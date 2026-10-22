/**
 * GET /api/habits/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Per-date totals across all non-deleted habits (archived included — their
 *   history is real work) for the heatmap + weekly/monthly achievement chips.
 *
 *   For each date in [from..to]:
 *    - done      = number of habits with a completed log that date (integer)
 *    - scheduled = expected count as a FRACTIONAL weight:
 *        daily        → 1 per day
 *        weekdays     → 1 on the chosen weekdays, 0 otherwise
 *        timesPerWeek → times/7 per day (a flexible habit "distributes" its
 *                       weekly target across the week)
 *      Weekly/monthly achievement = Σdone / Σscheduled (clamped 0..1 by the
 *      client). Fractions keep timesPerWeek habits honest without inflating
 *      daily totals.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { addDaysToKey, keyToWeekday, parseSchedule } from "@/lib/logic/streak";
import { ok, bad, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 400;

function dailyScheduledWeight(scheduleJson: string, dateKey: string): number {
  const schedule = parseSchedule(scheduleJson);
  if (schedule.type === "daily") return 1;
  if (schedule.type === "weekdays") {
    const days = schedule.days && schedule.days.length > 0 ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
    return days.includes(keyToWeekday(dateKey)) ? 1 : 0;
  }
  // timesPerWeek: distribute the weekly target across 7 days.
  const times = Math.min(7, Math.max(1, Math.round(schedule.times ?? 3)));
  return times / 7;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const from = params.get("from");
    const to = params.get("to");

    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return bad("invalid_from");
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return bad("invalid_to");
    if (from > to) return bad("invalid_range");

    const habits = await db.habits.findMany({
      where: { deletedAt: null },
      select: { scheduleJson: true },
    });
    const logRows = await db.habitLogs.findMany({
      where: { date: { gte: from, lte: to }, done: true },
      select: { habitId: true, date: true },
    });

    // done count per date (a habit counts once per date thanks to the unique key)
    const doneByDate = new Map<string, number>();
    for (const row of logRows) {
      doneByDate.set(row.date, (doneByDate.get(row.date) ?? 0) + 1);
    }

    const days: Array<{ date: string; scheduled: number; done: number }> = [];
    let cursor = from;
    let count = 0;
    while (cursor <= to) {
      if (++count > MAX_RANGE_DAYS) return bad("range_too_long");
      let scheduled = 0;
      for (const h of habits) scheduled += dailyScheduledWeight(h.scheduleJson, cursor);
      days.push({
        date: cursor,
        scheduled: Math.round(scheduled * 1000) / 1000, // 3 decimals is plenty for display rates
        done: doneByDate.get(cursor) ?? 0,
      });
      cursor = addDaysToKey(cursor, 1);
    }

    return ok({ from, to, habitCount: habits.length, days });
  } catch (e) {
    console.error("habits stats GET error", e);
    return serverError("failed_to_load_stats");
  }
}
