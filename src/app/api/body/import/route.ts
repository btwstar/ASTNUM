import { db } from "@/lib/db";

import {
  ok,
  validationError,
  serverError,
  isValidDateKey,
  parseNumber,
  validateRange,
  RANGES,
  CIRC_PARTS,
} from "../_lib";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

interface ImportRow {
  date?: unknown;
  weight?: unknown;
  bodyFatPct?: unknown;
  muscleMass?: unknown;
  water?: unknown;
  visceralFat?: unknown;
  notes?: unknown;
  chest?: unknown;
  waist?: unknown;
  arm?: unknown;
  thigh?: unknown;
  hip?: unknown;
}

/**
 * POST /api/body/import
 * { rows: [{ date, weight?, bodyFatPct?, muscleMass?, water?, visceralFat?,
 *            notes?, chest?, waist?, arm?, thigh?, hip? }] }
 * Bulk upsert used by the CSV import flow (client parses CSV, then posts here).
 * Tolerant: invalid rows are skipped and reported; hard cap of 500 rows.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rows?: unknown };
    const rows = body.rows;

    if (!Array.isArray(rows)) return validationError("rows array required");
    if (rows.length === 0) return validationError("rows array is empty");
    if (rows.length > MAX_ROWS) return validationError(`too many rows — max ${MAX_ROWS}`);

    type MetricKey = "weight" | "bodyFatPct" | "muscleMass" | "water" | "visceralFat";
    const rules: Record<MetricKey, { min: number; max: number }> = {
      weight: RANGES.weight,
      bodyFatPct: RANGES.bodyFat,
      muscleMass: RANGES.muscleMass,
      water: RANGES.water,
      visceralFat: RANGES.visceralFat,
    };

    // Group by date so duplicate CSV dates merge (later rows win), then upsert.
    const byDate = new Map<
      string,
      {
        metrics: Partial<Record<MetricKey, number | null>>;
        notes: string | null;
        circ: Partial<Record<(typeof CIRC_PARTS)[number], number | null>>;
        hasValue: boolean;
      }
    >();

    let skipped = 0;

    for (const raw of rows as ImportRow[]) {
      if (raw === null || typeof raw !== "object") {
        skipped++;
        continue;
      }
      if (!isValidDateKey(raw.date)) {
        skipped++;
        continue;
      }

      const entry =
        byDate.get(raw.date) ?? { metrics: {}, notes: null, circ: {}, hasValue: false };

      let rowValid = true;
      for (const key of Object.keys(rules) as MetricKey[]) {
        if (!(key in raw)) continue;
        const parsed = parseNumber(raw[key]);
        if (parsed === null) {
          entry.metrics[key] = null;
          continue;
        }
        if (!validateRange(parsed, rules[key].min, rules[key].max)) {
          rowValid = false;
          break;
        }
        entry.metrics[key] = parsed;
        entry.hasValue = true;
      }
      if (!rowValid) {
        skipped++;
        continue;
      }

      if ("notes" in raw) {
        const rawNotes = raw.notes;
        if (rawNotes === null || rawNotes === undefined || rawNotes === "") entry.notes = null;
        else if (typeof rawNotes === "string" && rawNotes.length <= 500) entry.notes = rawNotes;
        else {
          skipped++;
          continue;
        }
      }

      for (const part of CIRC_PARTS) {
        if (!(part in raw)) continue;
        const parsed = parseNumber(raw[part]);
        if (parsed === null) {
          entry.circ[part] = null;
          continue;
        }
        if (!validateRange(parsed, RANGES.circumference.min, RANGES.circumference.max)) {
          rowValid = false;
          break;
        }
        entry.circ[part] = parsed;
        entry.hasValue = true;
      }
      if (!rowValid) {
        skipped++;
        continue;
      }

      byDate.set(raw.date, entry);
    }

    const now = new Date().toISOString();
    let imported = 0;

    for (const [date, entry] of byDate) {
      if (!entry.hasValue) continue; // all values empty → nothing to store
      const existing = await db.bodyMeasurements.findUnique({ where: { date } });

      const create = {
        id: crypto.randomUUID(),
        date,
        weight: entry.metrics.weight ?? existing?.weight ?? null,
        bodyFatPct: entry.metrics.bodyFatPct ?? existing?.bodyFatPct ?? null,
        muscleMass: entry.metrics.muscleMass ?? existing?.muscleMass ?? null,
        water: entry.metrics.water ?? existing?.water ?? null,
        visceralFat: entry.metrics.visceralFat ?? existing?.visceralFat ?? null,
        notes: entry.notes !== null ? entry.notes : existing?.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const { createdAt: _createdAt, ...updatable } = create;
      await db.bodyMeasurements.upsert({
        where: { date },
        create,
        update: { ...updatable, updatedAt: now },
      });

      for (const part of CIRC_PARTS) {
        const value = entry.circ[part];
        if (value === undefined) continue;
        if (value === null) {
          await db.bodyCircumferences.deleteMany({ where: { date, part } });
          continue;
        }
        await db.bodyCircumferences.upsert({
          where: { date_part: { date, part } },
          create: { id: crypto.randomUUID(), date, part, valueCm: value, updatedAt: now },
          update: { valueCm: value, updatedAt: now },
        });
      }
      imported++;
    }

    return ok({ imported, skipped });
  } catch (e) {
    console.error("import POST error", e);
    return serverError("failed to import measurements");
  }
}
