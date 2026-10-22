import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import {
  ok,
  validationError,
  serverError,
  isMealType,
  isValidDateKey,
  parseNumber,
  sumTotals,
  round2,
} from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/nutrition/logs?date=YYYY-MM-DD
 * → { logs: [...], totals: { kcal, protein, carbs, fat } }
 * (grouping by meal is done client-side)
 */
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return validationError("date query param required");
    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");

    const logs = await db.foodLogs.findMany({ where: { date }, orderBy: { updatedAt: "asc" } });
    return ok({ logs, totals: sumTotals(logs) });
  } catch (e) {
    console.error("nutrition logs GET error", e);
    return serverError("failed to load food logs");
  }
}

const MAX_KCAL = 5000;
const MAX_MACRO = 2000;

/**
 * POST /api/nutrition/logs
 * { date, mealType, name, quantity, kcal, protein, carbs, fat, foodId?, grams? }
 * The CLIENT computes totals (per-portion × quantity); the server validates
 * (all values ≥ 0, kcal sanity < 5000) and stores what's sent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const date = body.date;
    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");

    if (!isMealType(body.mealType)) {
      return validationError("mealType must be breakfast|lunch|dinner|snack");
    }

    const rawName = body.name;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 100) : "";
    if (!name) return validationError("name is required");

    const quantity = parseNumber(body.quantity);
    if (quantity === null || quantity < 0.1 || quantity > 100) {
      return validationError("quantity must be between 0.1 and 100");
    }

    const kcal = parseNumber(body.kcal);
    if (kcal === null || kcal <= 0 || kcal >= MAX_KCAL) {
      return validationError(`kcal must be greater than 0 and below ${MAX_KCAL}`);
    }

    const protein = parseNumber(body.protein) ?? 0;
    const carbs = parseNumber(body.carbs) ?? 0;
    const fat = parseNumber(body.fat) ?? 0;
    for (const [label, value] of [
      ["protein", protein],
      ["carbs", carbs],
      ["fat", fat],
    ] as const) {
      if (value < 0) return validationError(`${label} can't be negative`);
      if (value > MAX_MACRO) return validationError(`${label} above sanity limit (${MAX_MACRO} g)`);
    }

    let grams: number | null = null;
    if (body.grams !== undefined && body.grams !== null && body.grams !== "") {
      const parsed = parseNumber(body.grams);
      if (parsed === null || parsed < 0 || parsed > 5000) {
        return validationError("grams must be between 0 and 5000");
      }
      grams = parsed;
    }

    let foodId: string | null = null;
    if (typeof body.foodId === "string" && body.foodId) {
      const food = await db.foods.findFirst({ where: { id: body.foodId } });
      if (!food) return validationError("foodId doesn't reference a known food");
      foodId = food.id;
    }

    const now = new Date().toISOString();
    const log = await db.foodLogs.create({
      data: {
        id: crypto.randomUUID(),
        date,
        mealType: body.mealType,
        foodId,
        name,
        quantity,
        grams,
        kcal: round2(kcal),
        protein: round2(protein),
        carbs: round2(carbs),
        fat: round2(fat),
        updatedAt: now,
      },
    });

    return ok({ log });
  } catch (e) {
    console.error("nutrition logs POST error", e);
    return serverError("failed to save food log");
  }
}
