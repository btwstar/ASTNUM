/// <reference types="bun-types" />
/**
 * Pure PR-logic tests.
 *
 *   bun test tests/pr.test.ts
 */
import { describe, expect, test } from "bun:test";
import { detectPrs, epley1RM, suggestNext, type PastSet } from "../src/lib/logic/pr";

/** tiny factory — createdAt ascending per call for realism */
let seq = 0;
function mkSet(reps: number, weightKg: number, setType: string = "work"): PastSet {
  seq += 1;
  const minutes = String(seq).padStart(2, "0");
  return { reps, weightKg, setType, createdAt: `2024-01-01T10:${minutes}:00.000Z` };
}

const has = (prs: string[], type: string) => prs.includes(type);

describe("epley1RM", () => {
  test("100kg × 5 ≈ 116.67", () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 2);
  });

  test("single rep = the weight itself; zero weight = 0", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 6);
    expect(epley1RM(0, 10)).toBe(0);
  });

  test("more reps at lighter weight can estimate higher (60×30 vs 100×5)", () => {
    expect(epley1RM(60, 30)).toBeGreaterThan(epley1RM(100, 5));
  });
});

describe("detectPrs", () => {
  test("no history at all → baseline, no PRs", () => {
    expect(detectPrs({ reps: 10, weightKg: 80, pastSets: [] })).toEqual([]);
  });

  test("max_weight: heavier than everything before", () => {
    const prs = detectPrs({ reps: 5, weightKg: 102.5, pastSets: [mkSet(5, 100)] });
    expect(has(prs, "max_weight")).toBe(true);
  });

  test("equal-to-best is NOT a PR (weight, e1rm, volume, reps all tied)", () => {
    const prs = detectPrs({ reps: 5, weightKg: 100, pastSets: [mkSet(5, 100)] });
    expect(prs).toEqual([]);
  });

  test("equal weight, equal volume, worse e1rm, better reps at that weight → exactly max_reps", () => {
    const history = [mkSet(5, 100), mkSet(8, 95)];
    // candidate 100×6: weight ties best, e1rm 120 < max(116.67, 120.33)… wait 95×8
    // e1rm = 95×(1+8/30) = 120.33 > 120 → no e1rm PR; volume 600 < max(500, 760)
    // → no volume PR; reps 6 > 5 at ~100kg window (95 is outside ±2.5% of 100)
    // → max_reps only.
    const prs = detectPrs({ reps: 6, weightKg: 100, pastSets: history });
    expect(prs).toEqual(["max_reps"]);
  });

  test("max_e1rm: lighter + lower volume but better estimated 1RM", () => {
    const prs = detectPrs({ reps: 1, weightKg: 119, pastSets: [mkSet(5, 100)] });
    expect(has(prs, "max_e1rm")).toBe(true);
    expect(has(prs, "max_weight")).toBe(true); // 119 > 100 as well
    expect(has(prs, "max_volume")).toBe(false); // 119 < 500
    expect(has(prs, "max_reps")).toBe(false); // no history inside the 119kg ±2.975 window
  });

  test("max_volume: same weight fewer reps beats volume record only via more reps — 60×10 case", () => {
    // 60×10: volume 600 > 500 (volume PR), e1rm 80 < 116.67, weight 60 < 100,
    // no history at ~60kg → no max_reps.
    const prs = detectPrs({ reps: 10, weightKg: 60, pastSets: [mkSet(5, 100)] });
    expect(prs).toEqual(["max_volume"]);
  });

  test("volume record needs STRICTLY more volume (100×5 then 50×10 = 500 = 500 → nothing)", () => {
    const prs = detectPrs({ reps: 10, weightKg: 50, pastSets: [mkSet(5, 100)] });
    expect(prs).toEqual([]);
  });

  test("warmup sets are excluded from history", () => {
    // warmup 200×3 must NOT block a 150×3 candidate from being a max_weight PR.
    const prs = detectPrs({
      reps: 3,
      weightKg: 150,
      pastSets: [mkSet(3, 200, "warmup"), mkSet(5, 100)],
    });
    expect(has(prs, "max_weight")).toBe(true);
    expect(has(prs, "max_e1rm")).toBe(true); // 165 > 116.67
    expect(has(prs, "max_volume")).toBe(false); // 450 < 500 (the work set's volume)
  });

  test("max_reps ±2.5% weight window logic", () => {
    const history = [mkSet(10, 100), mkSet(9, 102.4)];
    // candidate 100×11 → window ±2.5 → both history sets inside → 11 > 10 ✓
    expect(has(detectPrs({ reps: 11, weightKg: 100, pastSets: history }), "max_reps")).toBe(true);
    // candidate 102.6×9 → window ±2.565 → 102.4 inside (best 9) but 100 outside
    // (diff 2.6 > 2.565) → 9 is not strictly more than 9 → no max_reps.
    const prs = detectPrs({ reps: 9, weightKg: 102.6, pastSets: history });
    expect(has(prs, "max_reps")).toBe(false);
    // …but it is a max_weight PR (102.6 > 102.4)
    expect(has(prs, "max_weight")).toBe(true);
  });

  test("max_reps needs history INSIDE the weight window", () => {
    // nothing ever lifted near 60kg → these 15 reps are a baseline, not a record.
    const prs = detectPrs({ reps: 15, weightKg: 60, pastSets: [mkSet(5, 100)] });
    expect(has(prs, "max_reps")).toBe(false);
    // volume 900 > 500 still fires.
    expect(has(prs, "max_volume")).toBe(true);
  });

  test("several PR types can fire at once", () => {
    const prs = detectPrs({ reps: 8, weightKg: 105, pastSets: [mkSet(5, 100)] });
    expect(prs).toEqual(["max_weight", "max_e1rm", "max_volume"]);
  });

  test("failure sets count as history, warmup candidate-type strings are filtered", () => {
    const prs = detectPrs({
      reps: 6,
      weightKg: 95,
      pastSets: [mkSet(5, 100, "failure"), mkSet(3, 140, "warmup")],
    });
    // 95 < 100 (incl. the failure set) → no weight PR; e1rm 114 < 116.67 → none;
    // volume 570 > 500 → volume PR.
    expect(prs).toEqual(["max_volume"]);
  });
});

describe("suggestNext", () => {
  test("empty → null; warmups only → null", () => {
    expect(suggestNext([])).toBeNull();
    expect(suggestNext([mkSet(10, 40, "warmup")])).toBeNull();
  });

  test("returns the last work set by createdAt (warmups ignored)", () => {
    const sets = [
      mkSet(10, 60, "warmup"),
      mkSet(8, 100),
      mkSet(10, 95, "failure"),
    ];
    expect(suggestNext(sets)).toEqual({ reps: 10, weightKg: 95 });
  });

  test("ties on createdAt resolve to the later array entry", () => {
    const a = { reps: 8, weightKg: 100, setType: "work", createdAt: "2024-01-01T10:00:00.000Z" };
    const b = { reps: 12, weightKg: 60, setType: "work", createdAt: a.createdAt };
    expect(suggestNext([a, b])).toEqual({ reps: 12, weightKg: 60 });
    expect(suggestNext([b, a])).toEqual({ reps: 8, weightKg: 100 });
  });
});
