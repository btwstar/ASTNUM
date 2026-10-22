import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import {
  ok,
  validationError,
  serverError,
  isValidDateKey,
  sumTotals,
  getOrCreateGoals,
  addDaysToKey,
} from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/nutrition/summary?date=YYYY-MM-DD[&week=1]
 * → {
 *     consumed: { kcal, protein, carbs, fat },
 *     goals: { kcal, protein, carbs, fat, waterMl, formulaMeta },
 *     meals: { breakfast: {...}, lunch: {...}, dinner: {...}, snack: {...} },
 *     water: { consumedMl, goalMl },          // v2.4 hydration totals
 *     week?: [{ date, kcal }]  // last 7 days ending at `date`, when week=1
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const date = params.get("date");
    if (!date) return validationError("date query param required");
    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");
    const withWeek = params.get("week") === "1";

    const [logs, goals, waterLogs] = await Promise.all([
      db.foodLogs.findMany({ where: { date } }),
      getOrCreateGoals(),
      db.waterLogs.findMany({ where: { date } }),
    ]);

    const meals = {
      breakfast: sumTotals(logs.filter((l) => l.mealType === "breakfast")),
      lunch: sumTotals(logs.filter((l) => l.mealType === "lunch")),
      dinner: sumTotals(logs.filter((l) => l.mealType === "dinner")),
      snack: sumTotals(logs.filter((l) => l.mealType === "snack")),
    };

    const data: Record<string, unknown> = {
      consumed: sumTotals(logs),
      goals: {
        kcal: goals.kcal,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        waterMl: goals.waterMl,
        formulaMeta: goals.formulaMeta,
      },
      meals,
      water: {
        consumedMl: waterLogs.reduce((sum, l) => sum + l.amountMl, 0),
        goalMl: goals.waterMl,
      },
    };

    if (withWeek) {
      const dates = Array.from({ length: 7 }, (_, i) => addDaysToKey(date, i - 6));
      const weekLogs = await db.foodLogs.findMany({
        where: { date: { in: dates } },
        select: { date: true, kcal: true },
      });
      const kcalByDate = new Map<string, number>();
      for (const l of weekLogs) {
        kcalByDate.set(l.date, (kcalByDate.get(l.date) ?? 0) + l.kcal);
      }
      // Lean entries: { date, kcal } for each of the last 7 days.
      data.week = dates.map((d) => ({ date: d, kcal: kcalByDate.get(d) ?? 0 }));
    }

    return ok(data);
  } catch (e) {
    console.error("nutrition summary GET error", e);
    return serverError("failed to load nutrition summary");
  }
}
