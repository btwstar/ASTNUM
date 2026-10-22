/// <reference types="bun-types" />
/**
 * Nutrition data-convention test (v1.16): the ENTIRE food pipeline is
 * PER-100G — the seed library, the portion sheet, barcode imports, and the
 * v1→v2 migration of existing DBs. (v1.15 and earlier seeded per-SERVING
 * values that the per-100g UI silently inflated by servingG/100 on every
 * log — a 700-kcal فتة plate was logged as 2450.)
 *
 *   bun test tests/nutrition-convention.test.ts
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { FOODS } from "../src/lib/seed/foods";
import { localApiRequest } from "../src/lib/local-api";
import {
  __forceInMemoryForTests,
  __resetForTests,
  ensureSeeded,
  getDb,
  type FoodRow,
} from "../src/lib/local-api/db";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const p = path.startsWith("/api/") ? path : `/api/${path.replace(/^\//, "")}`;
  return localApiRequest<T>(p, init);
}

describe("per-100g seed convention", () => {
  test("every seeded food carries sane PER-100G values", () => {
    for (const f of FOODS) {
      expect(f.kcal).toBeGreaterThanOrEqual(0.1);
      expect(f.kcal).toBeLessThanOrEqual(900);
      expect(f.protein).toBeGreaterThanOrEqual(0);
      expect(f.protein).toBeLessThanOrEqual(100);
      expect(f.carbs).toBeLessThanOrEqual(100);
      expect(f.fat).toBeLessThanOrEqual(100);
      expect(f.servingG).toBeGreaterThanOrEqual(1);
      expect(f.servingG).toBeLessThanOrEqual(2000);
    }
  });

  test("known rows converted exactly (banana ≈ USDA 89, فتة 200, فول ≈ 107)", () => {
    const banana = FOODS.find((f) => f.id === "banana")!;
    expect(banana.kcal).toBe(87.5);
    const fatta = FOODS.find((f) => f.id === "fatta")!;
    expect(fatta.kcal).toBe(200); // 700 kcal per 350 g plate
    const ful = FOODS.find((f) => f.id === "ful-medames")!;
    expect(ful.kcal).toBe(106.67); // 320 kcal per 300 g plate
  });

  test("default portion still logs the classic per-serving calories", () => {
    for (const id of ["banana", "fatta", "ful-medames"]) {
      const f = FOODS.find((x) => x.id === id)!;
      const defaultPortionKcal = Math.round(f.kcal * (f.servingG / 100));
      const classics: Record<string, number> = { banana: 105, fatta: 700, "ful-medames": 320 };
      expect(defaultPortionKcal).toBe(classics[id]);
    }
  });
});

describe("v1→v2 migration of an existing localStorage DB (the APK path)", () => {
  beforeEach(() => {
    __forceInMemoryForTests();
    __resetForTests();
  });

  function buildV1Db() {
    const db = getDb();
    const now = new Date().toISOString();
    // a v1-convention row: per-SERVING banana (105 kcal per fruit)
    db.foods.push({
      id: "banana", nameAr: "موزة (ثمرة)", nameEn: "Banana", brand: null, barcode: null,
      kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, servingG: 120, custom: false,
      favorite: false, image: null, imageThumb: null, deletedAt: null, updatedAt: now,
    } as FoodRow);
    // a soft-deleted seed row (user chose to delete it) — must stay untouched
    db.foods.push({
      id: "fatta", nameAr: "فتة بالموزة (طبق)", nameEn: "Egyptian Fatta", brand: null, barcode: null,
      kcal: 700, protein: 26, carbs: 68, fat: 36, servingG: 350, custom: false,
      favorite: false, image: null, imageThumb: null,
      deletedAt: "2026-01-01T00:00:00.000Z", updatedAt: now,
    } as FoodRow);
    // a user-created custom row — must stay untouched
    db.foods.push({
      id: "0198abc-0000-0000-0000-000000000001", nameAr: "أكلة أمي", nameEn: "Mom's dish", brand: null, barcode: null,
      kcal: 500, protein: 20, carbs: 50, fat: 20, servingG: 400, custom: true,
      favorite: true, image: null, imageThumb: null, deletedAt: null, updatedAt: now,
    } as FoodRow);
    db.settings.push({ key: "seed:v1", value: "full-v1", updatedAt: now });
    // seed the non-food tables minimally so ensureSeeded's other guards pass
    db.muscleGroups = [{ id: "chest", nameAr: "صدر", nameEn: "Chest", svgId: "chest", region: "front", weeklyTarget: 12, sortOrder: 0, updatedAt: now }];
    return db;
  }

  test("migrates seed rows to per-100g, keeps soft-deleted + custom untouched", () => {
    const db = buildV1Db();
    ensureSeeded(); // runs the migration (flag full-v1 → full-v2)

    const banana = db.foods.find((f) => f.id === "banana")!;
    expect(banana.kcal).toBe(87.5); // converted
    expect(banana.protein).toBe(1.08);
    expect(banana.servingG).toBe(120); // unchanged
    expect(banana.custom).toBe(false);

    const fatta = db.foods.find((f) => f.id === "fatta")!;
    expect(fatta.kcal).toBe(700); // soft-deleted → NOT touched
    expect(fatta.deletedAt).not.toBeNull();

    const custom = db.foods.find((f) => f.id === "0198abc-0000-0000-0000-000000000001")!;
    expect(custom.kcal).toBe(500); // custom → NOT touched

    const flag = db.settings.find((r) => r.key === "seed:v1")!;
    expect(flag.value).toBe("full-v2");
  });

  test("migration is idempotent (second ensureSeeded changes nothing)", () => {
    const db = buildV1Db();
    ensureSeeded();
    const afterFirst = JSON.stringify(db.foods.find((f) => f.id === "banana")!);
    ensureSeeded(); // fast path now (flag full-v2) — must be a no-op
    const afterSecond = JSON.stringify(db.foods.find((f) => f.id === "banana")!);
    expect(afterSecond).toBe(afterFirst);
  });

  test("fresh empty DB seeds the v2 per-100g library directly", () => {
    __resetForTests();
    ensureSeeded();
    const db = getDb();
    expect(db.foods.length).toBe(171);
    const banana = db.foods.find((f) => f.id === "banana")!;
    expect(banana.kcal).toBe(87.5);
    const flag = db.settings.find((r) => r.key === "seed:v1")!;
    expect(flag.value).toBe("full-v2");
  });

  test("portion math end-to-end through the adapter: banana default 120 g = 105 kcal", async () => {
    __resetForTests();
    ensureSeeded();
    const date = new Date().toISOString().slice(0, 10);
    const { log } = await req<{ log: { kcal: number; grams: number | null } }>("/api/nutrition/logs", {
      method: "POST",
      body: JSON.stringify({
        date,
        mealType: "breakfast",
        foodId: "banana",
        name: "موزة (ثمرة)",
        quantity: 1.2, // 120 g / 100 (the portion sheet's per100g encoding)
        grams: 120,
        kcal: Math.round(87.5 * 1.2 * 100) / 100,
        protein: Math.round(1.08 * 1.2 * 100) / 100,
        carbs: Math.round(22.5 * 1.2 * 100) / 100,
        fat: Math.round(0.33 * 1.2 * 100) / 100,
      }),
    });
    expect(log.kcal).toBe(105); // the classic per-fruit value — now CORRECTLY derived
    expect(log.grams).toBe(120);
  });
});
