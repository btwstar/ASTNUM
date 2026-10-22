import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import {
  ok,
  validationError,
  serverError,
  isValidDateKey,
  parseNumber,
  getOrCreateGoals,
  addDaysToKey,
} from "../_lib";

export const dynamic = "force-dynamic";

/** The three drink categories tracked by the hydration card + widgets. */
export const DRINK_TYPES = ["water", "juice", "other"] as const;
export type DrinkType = (typeof DRINK_TYPES)[number];

export function isDrinkType(value: unknown): value is DrinkType {
  return typeof value === "string" && (DRINK_TYPES as readonly string[]).includes(value);
}

/**
 * GET /api/nutrition/water?date=YYYY-MM-DD[&week=1]
 * → {
 *     logs: [{ id, date, drink, name, amountMl, updatedAt }],
 *     consumedMl,                          // Σ amountMl (all drinks)
 *     waterMl,                             // Σ amountMl (drink = water only)
 *     goal: { waterMl },                   // active hydration target
 *     week?: [{ date, ml }]                // last 7 days totals when week=1
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const date = params.get("date");
    if (!date) return validationError("date query param required");
    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");
    const withWeek = params.get("week") === "1";

    const [logs, goals] = await Promise.all([
      db.waterLogs.findMany({ where: { date } }),
      getOrCreateGoals(),
    ]);

    const consumedMl = logs.reduce((sum, l) => sum + l.amountMl, 0);
    const waterOnlyMl = logs
      .filter((l) => l.drink === "water")
      .reduce((sum, l) => sum + l.amountMl, 0);

    const data: Record<string, unknown> = {
      logs: logs.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)),
      consumedMl,
      waterMl: waterOnlyMl,
      goal: { waterMl: goals.waterMl },
    };

    if (withWeek) {
      const dates = Array.from({ length: 7 }, (_, i) => addDaysToKey(date, i - 6));
      const weekLogs = await db.waterLogs.findMany({
        where: { date: { in: dates } },
        select: { date: true, amountMl: true },
      });
      const mlByDate = new Map<string, number>();
      for (const l of weekLogs) {
        mlByDate.set(l.date, (mlByDate.get(l.date) ?? 0) + l.amountMl);
      }
      data.week = dates.map((d) => ({ date: d, ml: mlByDate.get(d) ?? 0 }));
    }

    return ok(data);
  } catch (e) {
    console.error("water GET error", e);
    return serverError("failed to load water logs");
  }
}

/**
 * POST /api/nutrition/water
 * { date, drink?: "water"|"juice"|"other", name?, ml }
 * — one-tap hydration logging from the card, the quick-add sheet and the
 * home-screen drinks widget (via the capture pipeline).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const date = body.date;
    if (typeof date !== "string" || !isValidDateKey(date)) {
      return validationError("date must be a valid YYYY-MM-DD day key");
    }
    const ml = parseNumber(body.ml);
    if (ml === null || ml < 50 || ml > 3000) {
      return validationError("ml must be between 50 and 3000");
    }
    const drink = isDrinkType(body.drink) ? body.drink : "water";
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : drink;

    const now = new Date().toISOString();
    const row = await db.waterLogs.create({
      data: {
        id: crypto.randomUUID(),
        date,
        drink,
        name,
        amountMl: ml,
        updatedAt: now,
      },
    });

    return ok({ log: row }, 201);
  } catch (e) {
    console.error("water POST error", e);
    return serverError("failed to save the drink");
  }
}
