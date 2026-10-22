/// <reference types="bun-types" />
/**
 * Muscle heatmap engine tests — bun:test, pure logic, no DB/IO.
 *
 * Contract under test (frozen in src/lib/logic/heatmap.ts):
 *   - weighted sets: primary 1.0 / secondary 0.5, warmups excluded everywhere
 *   - volume: primary non-warmup rows only (reps × weightKg)
 *   - lastTrainedAt: max workout date among non-warmup rows
 *   - heatLevel boundaries: target 10 / 7 days → 6.99→1, 7→2, 12→2, 12.1→3,
 *     15→3, 15.1→4; the 30-day window scales expected = target × 30 / 7
 *   - neglectedInsight: picks the worst below-50% muscle, null when balanced
 */
import { describe, expect, test } from "bun:test";
import {
  computeMuscleLoad,
  diffDaysBetween,
  heatLevel,
  neglectedInsight,
  type MuscleLoadRow,
} from "../src/lib/logic/heatmap";

function row(over: Partial<MuscleLoadRow> & { muscleId: string }): MuscleLoadRow {
  return {
    role: "primary",
    reps: 10,
    weightKg: 100,
    setType: "work",
    workoutDate: "2025-06-01",
    createdAt: "2025-06-01T10:00:00.000Z",
    ...over,
  };
}

// ───────────────────────── computeMuscleLoad ─────────────────────────

describe("computeMuscleLoad", () => {
  test("weighted counting: primary 1.0 / secondary 0.5, warmup fully excluded", () => {
    const res = computeMuscleLoad(
      [
        row({ muscleId: "chest" }), // primary work set
        row({ muscleId: "chest", role: "secondary" }), // secondary work set
        row({ muscleId: "chest", setType: "warmup" }), // warmup — counts nowhere
      ],
      ["chest", "lats"]
    );
    expect(res.chest.rawSets).toBe(2); // warmup excluded from raw
    expect(res.chest.weightedSets).toBe(1.5); // 1.0 + 0.5, warmup excluded
    expect(res.chest.volume).toBe(1000); // primary work row only
    expect(res.chest.lastTrainedAt).toBe("2025-06-01");
    // muscles without rows are zero-filled (the map always needs all 15)
    expect(res.lats).toEqual({
      muscleId: "lats",
      rawSets: 0,
      weightedSets: 0,
      volume: 0,
      lastTrainedAt: null,
    });
  });

  test("volume counts PRIMARY non-warmup rows only, with sane guards", () => {
    const res = computeMuscleLoad(
      [
        row({ muscleId: "quads", reps: 8, weightKg: 125 }), // 1000 kg counted
        row({ muscleId: "quads", role: "secondary", reps: 12, weightKg: 60 }), // 720 → NOT counted
        row({ muscleId: "quads", setType: "warmup", reps: 15, weightKg: 60 }), // warmup → NOT counted
        row({ muscleId: "quads", reps: 0, weightKg: 200 }), // zero reps → 0
        row({ muscleId: "quads", reps: 5, weightKg: -3 }), // negative weight → 0
      ],
      ["quads"]
    );
    expect(res.quads.rawSets).toBe(4);
    expect(res.quads.weightedSets).toBe(3.5); // 1 + 0.5 + 1 + 1
    expect(res.quads.volume).toBe(1000);
  });

  test("lastTrainedAt is the max NON-warmup workout date", () => {
    const res = computeMuscleLoad(
      [
        row({ muscleId: "lats", workoutDate: "2025-06-01" }),
        row({ muscleId: "lats", workoutDate: "2025-06-03" }),
        row({ muscleId: "lats", workoutDate: "2025-06-09", setType: "warmup" }), // later, but warmup
      ],
      ["lats"]
    );
    expect(res.lats.lastTrainedAt).toBe("2025-06-03");
    expect(res.lats.rawSets).toBe(2);
  });

  test("rows for unknown muscle ids are ignored", () => {
    const res = computeMuscleLoad([row({ muscleId: "unicorn" })], ["chest"]);
    expect(res.chest.rawSets).toBe(0);
    expect(Object.keys(res)).toEqual(["chest"]);
  });

  test("weighted sums and volume are rounded to clean steps", () => {
    const res = computeMuscleLoad(
      [
        row({ muscleId: "abs", role: "secondary" }),
        row({ muscleId: "abs", role: "secondary" }),
        row({ muscleId: "abs", role: "secondary" }),
        row({ muscleId: "abs", reps: 3, weightKg: 33.333 }),
      ],
      ["abs"]
    );
    expect(res.abs.weightedSets).toBe(2.5); // 3 × 0.5 + 1
    expect(res.abs.volume).toBe(Math.round(3 * 33.333 * 100) / 100); // 2 decimals
  });
});

// ───────────────────────── heatLevel ─────────────────────────

describe("heatLevel boundaries (weeklyTarget 10)", () => {
  test("7-day window: expected = 10", () => {
    expect(heatLevel(0, 10, 7)).toBe(0);
    expect(heatLevel(6.99, 10, 7)).toBe(1);
    expect(heatLevel(7, 10, 7)).toBe(2); // 70% inclusive
    expect(heatLevel(12, 10, 7)).toBe(2); // 120% inclusive
    expect(heatLevel(12.1, 10, 7)).toBe(3);
    expect(heatLevel(15, 10, 7)).toBe(3); // 150% inclusive
    expect(heatLevel(15.1, 10, 7)).toBe(4);
  });

  test("30-day window: expected = 10 × 30 / 7", () => {
    const expected = (10 * 30) / 7;
    expect(heatLevel(0, 10, 30)).toBe(0);
    expect(heatLevel(29.99, 10, 30)).toBe(1); // just under 70%
    expect(heatLevel(30, 10, 30)).toBe(2); // exactly 70% of expected
    expect(heatLevel(expected, 10, 30)).toBe(2); // 100%
    expect(heatLevel(52, 10, 30)).toBe(3); // ≈121%
    expect(heatLevel(64.28, 10, 30)).toBe(3); // ≈150%
    expect(heatLevel(64.29, 10, 30)).toBe(4); // just over 150%
  });

  test("degenerate inputs", () => {
    expect(heatLevel(5, 0, 7)).toBe(0); // no target → no expectation
    expect(heatLevel(5, 10, 0)).toBe(0); // zero-length window
    expect(heatLevel(-3, 10, 7)).toBe(0); // no work
    expect(heatLevel(Number.NaN, 10, 7)).toBe(0);
  });
});

// ───────────────────────── neglectedInsight ─────────────────────────

describe("neglectedInsight", () => {
  const today = "2025-06-10";

  test("picks the muscle with the worst completion ratio", () => {
    const results = [
      { muscleId: "chest", weightedSets: 10, lastTrainedAt: today }, // 100% → skip
      { muscleId: "calves", weightedSets: 2, lastTrainedAt: "2025-06-05" }, // 20%
      { muscleId: "biceps", weightedSets: 3, lastTrainedAt: null }, // 30%
    ];
    const insight = neglectedInsight(
      results,
      { chest: 10, calves: 10, biceps: 10 },
      today,
      7
    );
    expect(insight).not.toBeNull();
    expect(insight!.muscleId).toBe("calves");
    expect(insight!.daysSince).toBe(5);
  });

  test("never-trained muscle is measured from the earliest training evidence", () => {
    const results = [
      { muscleId: "chest", weightedSets: 10, lastTrainedAt: "2025-06-09" },
      { muscleId: "forearms", weightedSets: 0, lastTrainedAt: null },
    ];
    const insight = neglectedInsight(results, { chest: 10, forearms: 10 }, today, 7);
    expect(insight).not.toBeNull();
    expect(insight!.muscleId).toBe("forearms");
    expect(insight!.daysSince).toBe(1); // today − 2025-06-09
  });

  test("falls back to the row's own weeklyTarget when the map lacks an entry", () => {
    const results = [
      { muscleId: "glutes", weightedSets: 1, weeklyTarget: 12, lastTrainedAt: "2025-06-08" },
    ];
    const insight = neglectedInsight(results, {}, today, 7);
    expect(insight).not.toBeNull();
    expect(insight!.muscleId).toBe("glutes");
    expect(insight!.daysSince).toBe(2);
  });

  test("ratio tie is broken by the longer gap since training", () => {
    const results = [
      { muscleId: "hamstrings", weightedSets: 1, lastTrainedAt: "2025-06-09" }, // 1 day ago
      { muscleId: "lower_back", weightedSets: 1, lastTrainedAt: "2025-06-01" }, // 9 days ago
    ];
    const insight = neglectedInsight(
      results,
      { hamstrings: 10, lower_back: 10 },
      today,
      7
    );
    expect(insight).not.toBeNull();
    expect(insight!.muscleId).toBe("lower_back");
    expect(insight!.daysSince).toBe(9);
  });

  test("null when every muscle delivers ≥ 50% of expected", () => {
    const results = [
      { muscleId: "chest", weightedSets: 5, lastTrainedAt: today }, // exactly 50% → fine
      { muscleId: "lats", weightedSets: 8, lastTrainedAt: today }, // 80%
    ];
    expect(neglectedInsight(results, { chest: 10, lats: 10 }, today, 7)).toBeNull();
  });

  test("null for empty input, no targets, or a blank today key", () => {
    expect(neglectedInsight([], { chest: 10 }, today, 7)).toBeNull();
    expect(
      neglectedInsight([{ muscleId: "chest", weightedSets: 0 }], { chest: 0 }, today, 7)
    ).toBeNull();
    expect(
      neglectedInsight([{ muscleId: "chest", weightedSets: 0 }], { chest: 10 }, "", 7)
    ).toBeNull();
  });

  test("30-day window scales the expectation (same work, more lenient)", () => {
    const results = [{ muscleId: "calves", weightedSets: 4, lastTrainedAt: "2025-06-06" }];
    const targets = { calves: 10 };
    // 7-day: expected 10 → 40% → flagged
    expect(neglectedInsight(results, targets, today, 7)?.muscleId).toBe("calves");
    // 30-day: expected ≈42.86 → 9.3% → flagged too
    const insight30 = neglectedInsight(results, targets, today, 30);
    expect(insight30).not.toBeNull();
    expect(insight30!.daysSince).toBe(4);
  });
});

// ───────────────────────── diffDaysBetween ─────────────────────────

describe("diffDaysBetween", () => {
  test("pure calendar-day difference (UTC), sign matters", () => {
    expect(diffDaysBetween("2025-06-10", "2025-06-01")).toBe(9);
    expect(diffDaysBetween("2025-06-01", "2025-06-10")).toBe(-9);
    expect(diffDaysBetween("2025-06-10", "2025-06-10")).toBe(0);
    expect(diffDaysBetween("2025-03-01", "2025-02-28")).toBe(1); // month boundary
    expect(diffDaysBetween("2024-01-01", "2023-12-31")).toBe(1); // year boundary
  });

  test("invalid keys return 0", () => {
    expect(diffDaysBetween("nope", "2025-06-01")).toBe(0);
    expect(diffDaysBetween("2025-06-01", "")).toBe(0);
  });
});
