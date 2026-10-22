/**
 * /api/nutrition/** — port of the nutrition API routes (verbatim logic):
 *   src/app/api/nutrition/logs/route.ts       (GET day logs + POST log)
 *   src/app/api/nutrition/logs/[id]/route.ts  (PATCH rescale + DELETE)
 *   src/app/api/nutrition/foods/route.ts      (GET search + POST custom + PATCH full edit)
 *   src/app/api/nutrition/foods/[id]/route.ts (DELETE — soft delete)
 *   src/app/api/nutrition/summary/route.ts    (GET day/week summary)
 *   src/app/api/nutrition/goals/route.ts      (GET + PUT single-row goals)
 *   src/app/api/nutrition/barcode/route.ts    (GET local cache → Open Food Facts)
 *   src/app/api/nutrition/water/route.ts      (GET day drinks + POST one-tap log — v2.4)
 *   src/app/api/nutrition/water/[id]/route.ts (PATCH amount + DELETE)
 * plus the nutrition/_lib.ts port.
 *
 * OFFLINE ADDITION (documented contract): the barcode route keeps the
 * local-cache-first flow and does the Open Food Facts fetch DIRECTLY from
 * the webview (OFF allows CORS; 8s AbortController), caching the product
 * into foods — failures map to the same OFFLINE 503 / PRODUCT_NOT_FOUND
 * 404 codes the UI already maps.
 */

import { ApiError } from "@/lib/api";
import { resolveFoodImagePair } from "@/lib/image-compress";
import { ensureSeeded, getDb, uuid } from "../db";
import {
  ciContains,
  fail,
  ok,
  propagate,
  rawJsonObject,
  sortRows,
  type LocalRequest,
} from "../shared";
import type { FoodLogRow, FoodRow, NutritionGoalRow, WaterLogRow } from "../db";

/* ── nutrition/_lib.ts port ───────────────────────────────────────── */

function validationError(message: string): never {
  return fail("VALIDATION", message, 400);
}

function notFoundMsg(message: string): never {
  return fail("NOT_FOUND", message, 404);
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}

/** YYYY-MM-DD (local day key) with real-calendar validation. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const EMPTY_TOTALS = { kcal: 0, protein: 0, carbs: 0, fat: 0 } as const;

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function sumTotals(
  logs: Array<{ kcal: number; protein: number; carbs: number; fat: number }>
): Totals {
  return logs.reduce<Totals>(
    (acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { ...EMPTY_TOTALS }
  );
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Single-active-row convention: first row, or lazily created defaults. */
export function getOrCreateGoals(): NutritionGoalRow {
  const db = getDb();
  const existing = sortRows([...db.nutritionGoals], [["updatedAt", "desc"]])[0];
  if (existing) {
    // pre-v2.4 rows lack waterMl (loadFromStorage guards, this is belt+braces)
    if (typeof existing.waterMl !== "number" || !Number.isFinite(existing.waterMl)) {
      existing.waterMl = 0;
    }
    return existing;
  }

  const now = new Date().toISOString();
  const row: NutritionGoalRow = {
    id: "goals",
    date: "1970-01-01",
    kcal: 2200,
    protein: 165,
    carbs: 220,
    fat: 73,
    waterMl: 0,
    formulaMeta: null,
    updatedAt: now,
  };
  db.nutritionGoals.push(row);
  return row;
}

/** Safe day key arithmetic (pure calendar math). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* ── GET /api/nutrition/logs?date= ─────────────────────────────────── */

export function nutritionLogsList(req: LocalRequest) {
  try {
    const db = getDb();
    const date = req.query.get("date");
    if (!date) validationError("date query param required");
    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");

    const logs = sortRows(
      db.foodLogs.filter((l) => l.date === date),
      [["updatedAt", "asc"]]
    );
    return ok({ logs, totals: sumTotals(logs) });
  } catch (e) {
    propagate(e, "failed to load food logs");
  }
}

/* ── POST /api/nutrition/logs ─────────────────────────────────────── */

const MAX_KCAL = 5000;
const MAX_MACRO = 2000;

export function nutritionLogsCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);

    const date = body.date;
    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");

    if (!isMealType(body.mealType)) {
      validationError("mealType must be breakfast|lunch|dinner|snack");
    }

    const rawName = body.name;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 100) : "";
    if (!name) validationError("name is required");

    const quantity = parseNumber(body.quantity);
    if (quantity === null || quantity < 0.1 || quantity > 100) {
      validationError("quantity must be between 0.1 and 100");
    }

    const kcal = parseNumber(body.kcal);
    if (kcal === null || kcal <= 0 || kcal >= MAX_KCAL) {
      validationError(`kcal must be greater than 0 and below ${MAX_KCAL}`);
    }

    const protein = parseNumber(body.protein) ?? 0;
    const carbs = parseNumber(body.carbs) ?? 0;
    const fat = parseNumber(body.fat) ?? 0;
    for (const [label, value] of [
      ["protein", protein],
      ["carbs", carbs],
      ["fat", fat],
    ] as const) {
      if (value < 0) validationError(`${label} can't be negative`);
      if (value > MAX_MACRO) validationError(`${label} above sanity limit (${MAX_MACRO} g)`);
    }

    let grams: number | null = null;
    if (body.grams !== undefined && body.grams !== null && body.grams !== "") {
      const parsed = parseNumber(body.grams);
      if (parsed === null || parsed < 0 || parsed > 5000) {
        validationError("grams must be between 0 and 5000");
      }
      grams = parsed;
    }

    let foodId: string | null = null;
    if (typeof body.foodId === "string" && body.foodId) {
      const food = db.foods.find((f) => f.id === body.foodId);
      if (!food) validationError("foodId doesn't reference a known food");
      foodId = food.id;
    }

    const now = new Date().toISOString();
    const log: FoodLogRow = {
      id: uuid(),
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
    };
    db.foodLogs.push(log);

    return ok({ log });
  } catch (e) {
    propagate(e, "failed to save food log");
  }
}

/* ── PATCH/DELETE /api/nutrition/logs/[id] ────────────────────────── */

export function nutritionLogUpdate(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const body = rawJsonObject(req) as { quantity?: unknown };

    const existing = db.foodLogs.find((l) => l.id === id);
    if (!existing) notFoundMsg("food log not found");

    const newQuantity = parseNumber(body.quantity);
    if (newQuantity === null || newQuantity < 0.1 || newQuantity > 100) {
      validationError("quantity must be between 0.1 and 100");
    }

    // Original per-portion = stored ÷ old quantity, then × new quantity.
    const oldQuantity = existing.quantity > 0 ? existing.quantity : 1;
    const scale = newQuantity / oldQuantity;

    existing.quantity = newQuantity;
    existing.grams = existing.grams !== null ? round2(existing.grams * scale) : null;
    existing.kcal = round2(existing.kcal * scale);
    existing.protein = round2(existing.protein * scale);
    existing.carbs = round2(existing.carbs * scale);
    existing.fat = round2(existing.fat * scale);
    existing.updatedAt = new Date().toISOString();

    return ok({ log: existing });
  } catch (e) {
    propagate(e, "failed to update food log");
  }
}

export function nutritionLogDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    const existing = db.foodLogs.find((l) => l.id === id);
    if (!existing) notFoundMsg("food log not found");

    db.foodLogs.splice(db.foodLogs.indexOf(existing), 1);
    return ok({ deleted: true });
  } catch (e) {
    propagate(e, "failed to delete food log");
  }
}

/* ── GET /api/nutrition/foods ────────────────────────────────────── */

export function nutritionFoodsList(req: LocalRequest) {
  try {
    ensureSeeded(); // parity: server foods route lazy-seeds (the seeded 160+ items)
    const db = getDb();

    const q = (req.query.get("q") ?? "").trim().slice(0, 60);
    const favorite = req.query.get("favorite");
    const limit = Math.min(Math.max(Number(req.query.get("limit")) || 30, 1), 50);

    const rows = db.foods.filter((f) => {
      if (f.deletedAt !== null) return false;
      if (q && !ciContains(f.nameAr, q) && !ciContains(f.nameEn, q) && !ciContains(f.brand, q)) {
        return false;
      }
      if (favorite === "1" || favorite === "true") {
        if (!f.favorite) return false;
      }
      return true;
    });

    const foods = sortRows(
      rows,
      [
        ["favorite", "desc"],
        ["custom", "desc"],
        ["nameAr", "asc"],
      ]
      // LEAN PROJECTION (v1.13 parity with the server + the notes list
      // contract): list rows null out the full `image` data URL — only the
      // small `imageThumb` travels, keeping the search payload tiny.
    )
      .slice(0, limit)
      .map((f) => ({ ...f, image: null }));

    return ok({ foods });
  } catch (e) {
    propagate(e, "failed to search foods");
  }
}

/* ── POST /api/nutrition/foods (custom food) ──────────────────────── */

const MAX_FOOD_KCAL = 2000;
const MAX_FOOD_MACRO = 200;

export function nutritionFoodsCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim().slice(0, 80) : "";
    if (!nameAr) validationError("nameAr is required");

    const kcal = parseNumber(body.kcal);
    if (kcal === null || kcal < 0 || kcal > MAX_FOOD_KCAL) {
      validationError(`kcal must be between 0 and ${MAX_FOOD_KCAL}`);
    }

    const protein = parseNumber(body.protein) ?? 0;
    const carbs = parseNumber(body.carbs) ?? 0;
    const fat = parseNumber(body.fat) ?? 0;
    for (const [label, value] of [
      ["protein", protein],
      ["carbs", carbs],
      ["fat", fat],
    ] as const) {
      if (value < 0) validationError(`${label} can't be negative`);
      if (value > MAX_FOOD_MACRO) {
        validationError(`${label} above sanity limit (${MAX_FOOD_MACRO} g)`);
      }
    }

    let servingG: number | null = null;
    if (body.servingG !== undefined && body.servingG !== null && body.servingG !== "") {
      const parsed = parseNumber(body.servingG);
      if (parsed === null || parsed < 1 || parsed > 2000) {
        validationError("servingG must be between 1 and 2000");
      }
      servingG = parsed;
    }

    const imagePair = resolveFoodImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      validationError("image/imageThumb must be a valid data-URL pair (or both null)");
    }

    const nameEn =
      typeof body.nameEn === "string" && body.nameEn.trim()
        ? body.nameEn.trim().slice(0, 80)
        : nameAr;

    const now = new Date().toISOString();
    const food: FoodRow = {
      id: uuid(),
      nameAr,
      nameEn,
      brand: typeof body.brand === "string" ? body.brand.trim().slice(0, 60) || null : null,
      barcode: null,
      kcal: round2(kcal),
      protein: round2(protein),
      carbs: round2(carbs),
      fat: round2(fat),
      servingG,
      custom: true,
      favorite: false,
      image: imagePair.kind === "set" ? imagePair.image : null,
      imageThumb: imagePair.kind === "set" ? imagePair.imageThumb : null,
      deletedAt: null,
      updatedAt: now,
    };
    db.foods.push(food);

    return ok({ food });
  } catch (e) {
    propagate(e, "failed to create custom food");
  }
}

/* ── PATCH /api/nutrition/foods (full edit) ───────────────────────── */

/**
 * Edit any food (seeded or custom) — only the fields PRESENT in the body
 * are touched. Logs are snapshots, so editing never rewrites past entries.
 * nameEn auto-syncs when it mirrored nameAr before the edit (custom foods
 * created without an English name). Mirrors the server PATCH 1:1.
 */
export function nutritionFoodsPatch(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);
    if (typeof body.id !== "string" || !body.id) validationError("id is required");

    const existing = db.foods.find((f) => f.id === body.id && f.deletedAt === null);
    if (!existing) notFoundMsg("food not found");

    if (typeof body.favorite === "boolean") {
      existing.favorite = body.favorite;
    }

    if (body.nameAr !== undefined) {
      const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim().slice(0, 80) : "";
      if (!nameAr) validationError("nameAr can't be empty");
      // capture BEFORE mutating (the server compares against the untouched row)
      const wasMirrored = existing.nameEn === existing.nameAr;
      existing.nameAr = nameAr;
      if (wasMirrored) existing.nameEn = nameAr; // keep auto-set English name in sync
    }
    if (body.nameEn !== undefined) {
      const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim().slice(0, 80) : "";
      if (!nameEn) validationError("nameEn can't be empty when provided");
      existing.nameEn = nameEn;
    }
    if (body.brand !== undefined) {
      if (body.brand === null) {
        existing.brand = null;
      } else if (typeof body.brand === "string") {
        existing.brand = body.brand.trim().slice(0, 60) || null;
      } else {
        validationError("brand must be a string or null");
      }
    }

    for (const key of ["kcal", "protein", "carbs", "fat"] as const) {
      if (body[key] === undefined) continue;
      const parsed = parseNumber(body[key]);
      if (parsed === null) validationError(`${key} must be a number`);
      if (key === "kcal") {
        if (parsed < 0 || parsed > MAX_FOOD_KCAL) {
          validationError(`kcal must be between 0 and ${MAX_FOOD_KCAL}`);
        }
      } else {
        if (parsed < 0) validationError(`${key} can't be negative`);
        if (parsed > MAX_FOOD_MACRO) {
          validationError(`${key} above sanity limit (${MAX_FOOD_MACRO} g)`);
        }
      }
      existing[key] = round2(parsed);
    }

    if (body.servingG !== undefined) {
      if (body.servingG === null || body.servingG === "") {
        existing.servingG = null;
      } else {
        const parsed = parseNumber(body.servingG);
        if (parsed === null || parsed < 1 || parsed > 2000) {
          validationError("servingG must be between 1 and 2000");
        }
        existing.servingG = parsed;
      }
    }

    if (body.image !== undefined || body.imageThumb !== undefined) {
      const imagePair = resolveFoodImagePair(body.image, body.imageThumb);
      if (imagePair.kind === "invalid") {
        validationError("image/imageThumb must be a valid data-URL pair (or both null)");
      }
      if (imagePair.kind === "set") {
        existing.image = imagePair.image;
        existing.imageThumb = imagePair.imageThumb;
      } else if (imagePair.kind === "remove") {
        existing.image = null;
        existing.imageThumb = null;
      }
    }

    existing.updatedAt = new Date().toISOString();

    return ok({ food: existing });
  } catch (e) {
    propagate(e, "failed to update food");
  }
}

/* ── DELETE /api/nutrition/foods/:id (soft delete) ────────────────── */

/**
 * Remove a food from the user's database — SOFT delete (deletedAt = now),
 * mirroring habits/notes/exercises and the server [id] route. Meal logs
 * snapshot their values, so past entries keep rendering untouched; the
 * soft-deleted row also keeps the foods count > 0 so the seed guard can
 * never re-import the 171 starter items over the user's choice.
 */
export function nutritionFoodsDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const { id } = req.params;
    if (!id) validationError("id is required");

    const existing = db.foods.find((f) => f.id === id && f.deletedAt === null);
    if (!existing) notFoundMsg("food not found");

    existing.deletedAt = new Date().toISOString();
    existing.updatedAt = existing.deletedAt;

    return ok({ deleted: true });
  } catch (e) {
    propagate(e, "failed to delete food");
  }
}

/* ── GET /api/nutrition/summary?date=&week=1 ──────────────────────── */

export function nutritionSummary(req: LocalRequest) {
  try {
    const db = getDb();
    const date = req.query.get("date");
    if (!date) validationError("date query param required");
    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");
    const withWeek = req.query.get("week") === "1";

    const logs = db.foodLogs.filter((l) => l.date === date);
    const goals = getOrCreateGoals();

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
        consumedMl: db.waterLogs
          .filter((l) => l.date === date)
          .reduce((sum, l) => sum + (Number.isFinite(l.amountMl) ? l.amountMl : 0), 0),
        goalMl: goals.waterMl,
      },
    };

    if (withWeek) {
      const dates = Array.from({ length: 7 }, (_, i) => addDaysToKey(date, i - 6));
      const weekLogs = db.foodLogs.filter((l) => dates.includes(l.date));
      const kcalByDate = new Map<string, number>();
      for (const l of weekLogs) {
        kcalByDate.set(l.date, (kcalByDate.get(l.date) ?? 0) + l.kcal);
      }
      // Lean entries: { date, kcal } for each of the last 7 days.
      data.week = dates.map((d) => ({ date: d, kcal: kcalByDate.get(d) ?? 0 }));
    }

    return ok(data);
  } catch (e) {
    propagate(e, "failed to load nutrition summary");
  }
}

/* ── GET/PUT /api/nutrition/goals ─────────────────────────────────── */

export function nutritionGoalsGet() {
  try {
    const goals = getOrCreateGoals();
    return ok({
      goals: {
        kcal: goals.kcal,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        waterMl: goals.waterMl,
        formulaMeta: goals.formulaMeta,
      },
    });
  } catch (e) {
    propagate(e, "failed to load goals");
  }
}

export function nutritionGoalsPut(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);

    const kcal = parseNumber(body.kcal);
    const protein = parseNumber(body.protein);
    const carbs = parseNumber(body.carbs);
    const fat = parseNumber(body.fat);

    if (kcal === null || kcal < 800 || kcal > 10000) {
      validationError("kcal must be between 800 and 10000");
    }
    if (protein === null || protein < 10 || protein > 500) {
      validationError("protein must be between 10 and 500 g");
    }
    if (carbs === null || carbs < 0 || carbs > 1500) {
      validationError("carbs must be between 0 and 1500 g");
    }
    if (fat === null || fat < 5 || fat > 400) {
      validationError("fat must be between 5 and 400 g");
    }
    // optional hydration target (0 allowed = "no water goal"); absent → keep
    const waterMlRaw = body.waterMl === undefined ? null : parseNumber(body.waterMl);
    if (waterMlRaw !== null && (waterMlRaw < 0 || waterMlRaw > 8000)) {
      validationError("waterMl must be between 0 and 8000 ml");
    }

    let formulaMeta: string | null = null;
    if (body.formulaMeta !== undefined && body.formulaMeta !== null) {
      if (typeof body.formulaMeta !== "object") {
        validationError("formulaMeta must be an object");
      }
      formulaMeta = JSON.stringify(body.formulaMeta);
    }

    const now = new Date().toISOString();
    const existing = db.nutritionGoals[0]; // single-row convention (insertion order)
    if (existing) {
      existing.kcal = round2(kcal);
      existing.protein = round2(protein);
      existing.carbs = round2(carbs);
      existing.fat = round2(fat);
      if (waterMlRaw !== null) existing.waterMl = round2(waterMlRaw);
      existing.formulaMeta = formulaMeta;
      existing.updatedAt = now;
      return ok({
        goals: {
          kcal: existing.kcal,
          protein: existing.protein,
          carbs: existing.carbs,
          fat: existing.fat,
          waterMl: existing.waterMl,
          formulaMeta: existing.formulaMeta,
        },
      });
    }

    const row: NutritionGoalRow = {
      id: "goals",
      date: "1970-01-01",
      kcal: round2(kcal),
      protein: round2(protein),
      carbs: round2(carbs),
      fat: round2(fat),
      waterMl: waterMlRaw !== null ? round2(waterMlRaw) : 0,
      formulaMeta,
      updatedAt: now,
    };
    db.nutritionGoals.push(row);
    return ok({
      goals: {
        kcal: row.kcal,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        waterMl: row.waterMl,
        formulaMeta: row.formulaMeta,
      },
    });
  } catch (e) {
    propagate(e, "failed to save goals");
  }
}

/* ── GET/POST /api/nutrition/water + PATCH/DELETE /[id] (v2.4) ───────── */

/** The three drink categories tracked by the hydration card + widgets. */
export const DRINK_TYPES = ["water", "juice", "other"] as const;
export type DrinkType = (typeof DRINK_TYPES)[number];

function isDrinkType(value: unknown): value is DrinkType {
  return typeof value === "string" && (DRINK_TYPES as readonly string[]).includes(value);
}

/**
 * GET /api/nutrition/water?date=YYYY-MM-DD[&week=1]
 * → { logs, consumedMl, waterMl (water-only), goal: {waterMl}, week? }
 */
export function nutritionWaterList(req: LocalRequest) {
  try {
    const db = getDb();
    const date = req.query.get("date");
    if (!date) validationError("date query param required");
    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");
    const withWeek = req.query.get("week") === "1";

    const logs = db.waterLogs
      .filter((l) => l.date === date)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
    const goals = getOrCreateGoals();

    const consumedMl = logs.reduce(
      (sum, l) => sum + (Number.isFinite(l.amountMl) ? l.amountMl : 0),
      0
    );
    const waterOnlyMl = logs
      .filter((l) => l.drink === "water")
      .reduce((sum, l) => sum + (Number.isFinite(l.amountMl) ? l.amountMl : 0), 0);

    const data: Record<string, unknown> = {
      logs,
      consumedMl,
      waterMl: waterOnlyMl,
      goal: { waterMl: goals.waterMl },
    };

    if (withWeek) {
      const dates = Array.from({ length: 7 }, (_, i) => addDaysToKey(date, i - 6));
      const weekLogs = db.waterLogs.filter((l) => dates.includes(l.date));
      const mlByDate = new Map<string, number>();
      for (const l of weekLogs) {
        mlByDate.set(l.date, (mlByDate.get(l.date) ?? 0) + (Number.isFinite(l.amountMl) ? l.amountMl : 0));
      }
      data.week = dates.map((d) => ({ date: d, ml: mlByDate.get(d) ?? 0 }));
    }

    return ok(data);
  } catch (e) {
    propagate(e, "failed to load water logs");
  }
}

/** POST /api/nutrition/water { date, drink?, name?, ml } — one-tap logging. */
export function nutritionWaterCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);

    const date = body.date;
    if (typeof date !== "string" || !isValidDateKey(date)) {
      validationError("date must be a valid YYYY-MM-DD day key");
    }
    const ml = parseNumber(body.ml);
    if (ml === null || ml < 50 || ml > 3000) {
      validationError("ml must be between 50 and 3000");
    }
    const drink = isDrinkType(body.drink) ? body.drink : "water";
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : drink;

    const now = new Date().toISOString();
    const row: WaterLogRow = {
      id: uuid(),
      date,
      drink,
      name,
      amountMl: ml,
      updatedAt: now,
    };
    db.waterLogs.push(row);
    return ok({ log: row });
  } catch (e) {
    propagate(e, "failed to save the drink");
  }
}

/** PATCH /api/nutrition/water/[id] { ml } — correct an entry's amount. */
export function nutritionWaterPatch(req: LocalRequest) {
  try {
    const db = getDb();
    const id = String(req.params.id ?? "");
    const existing = db.waterLogs.find((l) => l.id === id);
    if (!existing) notFoundMsg("water log not found");

    const body = rawJsonObject(req);
    const ml = parseNumber(body.ml);
    if (ml === null || ml < 50 || ml > 3000) {
      return ok({ log: existing }); // same no-op contract as the server route
    }

    existing.amountMl = ml;
    existing.updatedAt = new Date().toISOString();
    return ok({ log: existing });
  } catch (e) {
    propagate(e, "failed to update the drink");
  }
}

/** DELETE /api/nutrition/water/[id] */
export function nutritionWaterDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const id = String(req.params.id ?? "");
    const idx = db.waterLogs.findIndex((l) => l.id === id);
    if (idx === -1) notFoundMsg("water log not found");

    db.waterLogs.splice(idx, 1);
    return ok({ deleted: true, id });
  } catch (e) {
    propagate(e, "failed to delete the drink");
  }
}

/* ── GET /api/nutrition/barcode?code= ─────────────────────────────── */

const OFF_TIMEOUT_MS = 8000;

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** "30 g" | "30g" | "2 x 25 g" → 30 / null */
function parseServingGrams(serving?: string): number | null {
  if (!serving) return null;
  const match = serving.match(/(\d+(?:\.\d+)?)\s*g/i);
  if (!match) return null;
  const grams = Number(match[1]);
  if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) return null;
  return round2(grams);
}

export async function nutritionBarcode(req: LocalRequest): Promise<unknown> {
  try {
    const db = getDb();
    const code = (req.query.get("code") ?? "").trim();
    if (!/^\d{4,20}$/.test(code)) {
      validationError("code must be a numeric barcode (4-20 digits)");
    }

    // 1) Local cache / previously scanned products — works offline.
    const local = db.foods.find((f) => f.barcode === code && f.deletedAt === null);
    if (local) return ok({ food: local, source: "local" });

    // 2) Open Food Facts lookup — DIRECT fetch from the webview (CORS-allowed).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ar,brands,serving_size,nutriments`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "ASTNUM/1.0 (personal fitness tracker; local-first web app)",
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        fail("OFFLINE", `Open Food Facts unreachable (HTTP ${res.status})`, 503);
      }

      const payload = (await res.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          product_name_ar?: string;
          brands?: string;
          serving_size?: string;
          nutriments?: Record<string, number | string>;
        };
      };

      const product = payload.product;
      const nutriments = product?.nutriments ?? {};

      const nameAr =
        typeof product?.product_name_ar === "string" && product.product_name_ar.trim()
          ? product.product_name_ar.trim()
          : undefined;
      const nameEn =
        typeof product?.product_name === "string" && product.product_name.trim()
          ? product.product_name.trim()
          : undefined;
      const name = nameAr || nameEn;

      if (payload.status !== 1 || !product || !name) {
        fail("PRODUCT_NOT_FOUND", "product not found in Open Food Facts", 404);
      }

      // kcal per 100g: prefer energy-kcal_100g, fall back to kJ → kcal.
      const kcalDirect = numOrNull(nutriments["energy-kcal_100g"]);
      const kJ = numOrNull(nutriments["energy_100g"]);
      const kcal = kcalDirect ?? (kJ !== null ? round2(kJ / 4.184) : null);

      const protein = numOrNull(nutriments["proteins_100g"]);
      const carbs = numOrNull(nutriments["carbohydrates_100g"]);
      const fat = numOrNull(nutriments["fat_100g"]);

      if (kcal === null || kcal <= 0) {
        fail("PRODUCT_NOT_FOUND", "product has no usable nutrition data", 404);
      }

      // Unparseable serving → 100 g: the row is PER-100G and must stay in the
      // portion sheet's grams mode (v1.16 — null made the UI treat per-100g
      // values as per-PIECE). Mirrors the server route.
      const servingG = parseServingGrams(product?.serving_size) ?? 100;

      const now = new Date().toISOString();
      const food: FoodRow = {
        id: uuid(),
        nameAr: nameAr ?? name,
        nameEn: nameEn ?? name,
        brand:
          typeof product?.brands === "string" && product.brands.trim()
            ? product.brands.split(",")[0].trim().slice(0, 60)
            : null,
        barcode: code,
        kcal: round2(kcal),
        protein: round2(protein ?? 0),
        carbs: round2(carbs ?? 0),
        fat: round2(fat ?? 0),
        servingG,
        custom: false,
        favorite: false,
        image: null,
        imageThumb: null,
        deletedAt: null,
        updatedAt: now,
      };
      db.foods.push(food);

      return ok({ food, source: "off" });
    } catch (fetchError) {
      // The server RETURNS (never throws) its envelopes, so only GENUINE fetch
      // failures reach this branch — re-thrown ApiErrors must pass untouched
      // (PRODUCT_NOT_FOUND / the OFFLINE !res.ok envelope above), or the
      // 4-a "swallowed ApiError" bug class resurfaces here.
      if (fetchError instanceof ApiError) throw fetchError;
      const aborted = fetchError instanceof Error && fetchError.name === "AbortError";
      fail(
        "OFFLINE",
        aborted
          ? "Open Food Facts lookup timed out (8s)"
          : "can't reach Open Food Facts — check your internet connection",
        503
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    propagate(e, "failed to lookup barcode");
  }
}
