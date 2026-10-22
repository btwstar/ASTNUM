import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, bad, serverError } from "../_lib";

export const dynamic = "force-dynamic";

const OFF_TIMEOUT_MS = 8000;

/**
 * GET /api/nutrition/barcode?code=…
 * 1) Local Foods with barcode=code → instant + offline.
 * 2) Otherwise Open Food Facts (server-side, 8s timeout):
 *    https://world.openfoodfacts.org/api/v2/product/{code}.json
 *    Map to per-100g values and cache into Foods, then return.
 * 3) Not found → PRODUCT_NOT_FOUND (404). Network failure → OFFLINE (503).
 */
export async function GET(req: NextRequest) {
  try {
    const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
    if (!/^\d{4,20}$/.test(code)) {
      return validationError("code must be a numeric barcode (4-20 digits)");
    }

    // 1) Local cache / previously scanned products — works offline.
    const local = await db.foods.findFirst({ where: { barcode: code, deletedAt: null } });
    if (local) return ok({ food: local, source: "local" });

    // 2) Open Food Facts lookup (the only internet-dependent feature + AI).
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
        return bad("OFFLINE", `Open Food Facts unreachable (HTTP ${res.status})`, 503);
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
        return bad("PRODUCT_NOT_FOUND", "product not found in Open Food Facts", 404);
      }

      // kcal per 100g: prefer energy-kcal_100g, fall back to kJ → kcal.
      const kcalDirect = numOrNull(nutriments["energy-kcal_100g"]);
      const kJ = numOrNull(nutriments["energy_100g"]);
      const kcal = kcalDirect ?? (kJ !== null ? round2(kJ / 4.184) : null);

      const protein = numOrNull(nutriments["proteins_100g"]);
      const carbs = numOrNull(nutriments["carbohydrates_100g"]);
      const fat = numOrNull(nutriments["fat_100g"]);

      if (kcal === null || kcal <= 0) {
        return bad("PRODUCT_NOT_FOUND", "product has no usable nutrition data", 404);
      }

      // serving_size like "30 g" → keep grams when parseable. Unparseable →
      // 100: the row is PER-100G and must land in the portion sheet's grams
      // mode (v1.16 — a null servingG made the UI treat per-100g values as
      // per-PIECE, logging e.g. a cola can as 42 kcal instead of ~140).
      const servingG = parseServingGrams(product?.serving_size) ?? 100;

      const now = new Date().toISOString();
      const food = await db.foods.create({
        data: {
          id: crypto.randomUUID(),
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
          deletedAt: null,
          updatedAt: now,
        },
      });

      return ok({ food, source: "off" });
    } catch (fetchError) {
      const aborted = fetchError instanceof Error && fetchError.name === "AbortError";
      return bad(
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
    console.error("nutrition barcode GET error", e);
    return serverError("failed to lookup barcode");
  }
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
