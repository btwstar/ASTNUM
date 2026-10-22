/**
 * POST /api/habits/[id]/log { date: "YYYY-MM-DD", done: boolean }?today=YYYY-MM-DD
 *   → upsert the day's log (unique [habitId, date]) and return the recomputed
 *     streaks plus the milestone the completion just hit (7/30/100) if any.
 *   Retroactive edits are fully supported: streaks are recomputed from the
 *     habit's ENTIRE history on every call.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  computeStreaks,
  isValidDateKey,
  parseSchedule,
  STREAK_MILESTONES,
} from "@/lib/logic/streak";
import { ok, bad, notFound, serverError, resolveTodayKey, readJson } from "../../_helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const habit = await db.habits.findFirst({ where: { id, deletedAt: null } });
    if (!habit) return notFound();

    const body = await readJson(req);
    if (!body) return bad("invalid_body");
    if (typeof body.date !== "string" || !isValidDateKey(body.date)) return bad("invalid_date");
    if (typeof body.done !== "boolean") return bad("invalid_done");

    const todayKey = resolveTodayKey(req);
    if (body.date > todayKey) return bad("future_date"); // can't log the future

    const now = new Date().toISOString();
    await db.habitLogs.upsert({
      where: { habitId_date: { habitId: id, date: body.date } },
      create: { id: crypto.randomUUID(), habitId: id, date: body.date, done: body.done, updatedAt: now },
      update: { done: body.done, updatedAt: now },
    });

    // Recompute from the FULL history (not just a window) so retroactive
    // edits always produce exact streaks.
    const [logRows, freezeRows] = await Promise.all([
      db.habitLogs.findMany({ where: { habitId: id, done: true }, select: { date: true } }),
      db.streakFreezes.findMany({ where: { habitId: id }, select: { date: true } }),
    ]);
    const doneSet = new Set(logRows.map((r) => r.date));
    const freezeSet = new Set(freezeRows.map((r) => r.date));
    const streaks = computeStreaks(parseSchedule(habit.scheduleJson), doneSet, freezeSet, todayKey);

    // Milestone: the completion just made the CURRENT streak land exactly on
    // one of the celebration values.
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
    console.error("habit log POST error", e);
    return serverError("failed_to_log_habit");
  }
}
