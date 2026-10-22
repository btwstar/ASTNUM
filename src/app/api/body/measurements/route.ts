import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import {
  ok,
  validationError,
  notFound,
  serverError,
  isValidDateKey,
  parseNumber,
  validateRange,
  RANGES,
  CIRC_PARTS,
  type CircPart,
} from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/body/measurements
 * → { measurements: [...] } (date desc), each with `circumferences` map {part: valueCm}.
 */
export async function GET() {
  try {
    const [measurements, circs] = await Promise.all([
      db.bodyMeasurements.findMany({ orderBy: { date: "desc" }, take: 500 }),
      db.bodyCircumferences.findMany({ orderBy: { date: "desc" }, take: 3000 }),
    ]);

    const circByDate = new Map<string, Record<string, number>>();
    for (const c of circs) {
      const entry = circByDate.get(c.date) ?? {};
      entry[c.part] = c.valueCm;
      circByDate.set(c.date, entry);
    }

    return ok({
      measurements: measurements.map((m) => ({
        ...m,
        circumferences: circByDate.get(m.date) ?? {},
      })),
    });
  } catch (e) {
    console.error("measurements GET error", e);
    return serverError("failed to load measurements");
  }
}

type MetricKey = "weight" | "bodyFatPct" | "muscleMass" | "water" | "visceralFat";

const METRIC_RULES: Array<{
  key: MetricKey;
  range: { min: number; max: number };
  message: string;
}> = [
  { key: "weight", range: RANGES.weight, message: "weight must be between 20 and 400 kg" },
  { key: "bodyFatPct", range: RANGES.bodyFat, message: "body fat must be between 2 and 70 %" },
  { key: "muscleMass", range: RANGES.muscleMass, message: "muscle mass must be between 5 and 200 kg" },
  { key: "water", range: RANGES.water, message: "water must be between 20 and 80 %" },
  { key: "visceralFat", range: RANGES.visceralFat, message: "visceral fat must be between 1 and 59" },
];

/**
 * POST /api/body/measurements
 * { date, weight?, bodyFatPct?, muscleMass?, water?, visceralFat?, notes?,
 *   circumferences?: { chest?, waist?, arm?, thigh?, hip? } }
 * Upsert measurement by unique[date] + upsert each circumference (unique[date,part]).
 * Semantics: field ABSENT → keep existing (null on create);
 *            field PRESENT as null/empty → clear the stored value.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const date = body.date;
    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");

    const now = new Date().toISOString();
    const existing = await db.bodyMeasurements.findUnique({ where: { date } });

    const data: Record<MetricKey, number | null> = {
      weight: existing?.weight ?? null,
      bodyFatPct: existing?.bodyFatPct ?? null,
      muscleMass: existing?.muscleMass ?? null,
      water: existing?.water ?? null,
      visceralFat: existing?.visceralFat ?? null,
    };
    let hasValue = false;

    for (const rule of METRIC_RULES) {
      if (!(rule.key in body)) continue;
      const parsed = parseNumber(body[rule.key]);
      if (parsed === null) {
        data[rule.key] = null; // explicit clear
        continue;
      }
      if (!validateRange(parsed, rule.range.min, rule.range.max)) {
        return validationError(rule.message);
      }
      data[rule.key] = parsed;
      hasValue = true;
    }

    let notes: string | null = existing?.notes ?? null;
    if ("notes" in body) {
      const raw = body.notes;
      if (raw === null || raw === undefined || raw === "") {
        notes = null;
      } else if (typeof raw === "string") {
        if (raw.length > 500) return validationError("notes must be at most 500 characters");
        notes = raw;
      } else {
        return validationError("notes must be a string");
      }
    }

    const circUpserts: Array<{ part: CircPart; value: number }> = [];
    const circDeletes: CircPart[] = [];
    const circ = body.circumferences;
    if (circ !== undefined && circ !== null) {
      if (typeof circ !== "object" || Array.isArray(circ)) {
        return validationError("circumferences must be an object");
      }
      const circRecord = circ as Record<string, unknown>;
      for (const part of CIRC_PARTS) {
        if (!(part in circRecord)) continue;
        const parsed = parseNumber(circRecord[part]);
        if (parsed === null) {
          circDeletes.push(part); // explicit clear
          continue;
        }
        if (!validateRange(parsed, RANGES.circumference.min, RANGES.circumference.max)) {
          return validationError(`${part} circumference must be between 20 and 250 cm`);
        }
        circUpserts.push({ part, value: parsed });
        hasValue = true;
      }
    }

    if (!hasValue) return validationError("at least one measurement value is required");

    const measurement = await db.bodyMeasurements.upsert({
      where: { date },
      create: {
        id: crypto.randomUUID(),
        date,
        ...data,
        notes,
        createdAt: now,
        updatedAt: now,
      },
      update: { ...data, notes, updatedAt: now },
    });

    for (const op of circUpserts) {
      await db.bodyCircumferences.upsert({
        where: { date_part: { date, part: op.part } },
        create: { id: crypto.randomUUID(), date, part: op.part, valueCm: op.value, updatedAt: now },
        update: { valueCm: op.value, updatedAt: now },
      });
    }
    for (const part of circDeletes) {
      await db.bodyCircumferences.deleteMany({ where: { date, part } });
    }

    const rows = await db.bodyCircumferences.findMany({ where: { date } });
    const circumferences: Record<string, number> = {};
    for (const r of rows) circumferences[r.part] = r.valueCm;

    return ok({ measurement: { ...measurement, circumferences } });
  } catch (e) {
    console.error("measurements POST error", e);
    return serverError("failed to save measurement");
  }
}

/**
 * DELETE /api/body/measurements?id=…
 * → deletes the measurement AND its circumferences for that date.
 */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return validationError("id query param required");

    const existing = await db.bodyMeasurements.findUnique({ where: { id } });
    if (!existing) return notFound("measurement not found");

    await db.bodyCircumferences.deleteMany({ where: { date: existing.date } });
    await db.bodyMeasurements.delete({ where: { id } });

    return ok({ deleted: true, date: existing.date });
  } catch (e) {
    console.error("measurements DELETE error", e);
    return serverError("failed to delete measurement");
  }
}
