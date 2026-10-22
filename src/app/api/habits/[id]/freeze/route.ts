/**
 * POST /api/habits/[id]/freeze { date: "YYYY-MM-DD" }?today=YYYY-MM-DD
 *   Protect a missed day with a streak freeze.
 *   Policy:
 *    - max 2 freezes per habit per CALENDAR month → FREEZE_LIMIT (400)
 *    - future dates can't be frozen → VALIDATION
 *    - a date that was already completed needs no freeze → VALIDATION
 *    - freezing an already-frozen day is idempotent (returns current state)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  computeStreaks,
  isValidDateKey,
  monthFreezeCount,
  parseSchedule,
  MAX_FREEZES_PER_MONTH,
} from "@/lib/logic/streak";
import { ok, bad, notFound, serverError, resolveTodayKey, readJson, fail } from "../../_helpers";

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

    const todayKey = resolveTodayKey(req);
    const date = body.date;
    if (date > todayKey) return bad("future_date"); // can't freeze the future

    // A completed day doesn't need protection.
    const doneLog = await db.habitLogs.findFirst({
      where: { habitId: id, date, done: true },
      select: { id: true },
    });
    if (doneLog) return bad("date_already_done");

    // Idempotency: freezing an already-frozen day is a no-op success.
    const existing = await db.streakFreezes.findFirst({ where: { habitId: id, date }, select: { id: true } });

    if (!existing) {
      // Monthly quota: at most MAX_FREEZES_PER_MONTH per habit per calendar month.
      const yearMonth = date.slice(0, 7);
      const freezesInMonth = await db.streakFreezes.findMany({
        where: { habitId: id, date: { startsWith: yearMonth } },
        select: { date: true },
      });
      if (freezesInMonth.length >= MAX_FREEZES_PER_MONTH) {
        return fail("FREEZE_LIMIT", "freeze_month_limit", 400);
      }
      await db.streakFreezes.create({
        data: { id: crypto.randomUUID(), habitId: id, date, updatedAt: new Date().toISOString() },
      });
    }

    // Recompute so the client gets fresh streaks + quota in one round trip.
    const [logRows, freezeRows] = await Promise.all([
      db.habitLogs.findMany({ where: { habitId: id, done: true }, select: { date: true } }),
      db.streakFreezes.findMany({ where: { habitId: id }, select: { date: true } }),
    ]);
    const doneSet = new Set(logRows.map((r) => r.date));
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
    console.error("habit freeze POST error", e);
    return serverError("failed_to_freeze");
  }
}
