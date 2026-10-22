import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, serverError, isValidDateKey, parseNumber, validateRange, RANGES } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/body/circumferences[?date=YYYY-MM-DD]
 * → { circumferences: [{ date, part, valueCm }] } (date desc).
 * Used for circumference-focused views/trends without re-fetching measurements.
 */
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const where = date ? { date } : undefined;
    if (date && !isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");

    const rows = await db.bodyCircumferences.findMany({
      where,
      orderBy: [{ date: "desc" }, { part: "asc" }],
      take: 3000,
    });

    return ok({
      circumferences: rows.map((r) => ({ date: r.date, part: r.part, valueCm: r.valueCm })),
    });
  } catch (e) {
    console.error("circumferences GET error", e);
    return serverError("failed to load circumferences");
  }
}

/**
 * POST /api/body/circumferences { date, part, valueCm }
 * Single-part upsert (unique[date,part]) — handy for quick inline edits.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const date = body.date;
    const part = typeof body.part === "string" ? body.part : "";
    const value = parseNumber(body.valueCm);

    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");
    if (!["chest", "waist", "arm", "thigh", "hip"].includes(part)) {
      return validationError("part must be one of chest|waist|arm|thigh|hip");
    }
    if (value === null) return validationError("valueCm is required");
    if (!validateRange(value, RANGES.circumference.min, RANGES.circumference.max)) {
      return validationError("valueCm must be between 20 and 250 cm");
    }

    const now = new Date().toISOString();
    const row = await db.bodyCircumferences.upsert({
      where: { date_part: { date, part } },
      create: { id: crypto.randomUUID(), date, part, valueCm: value, updatedAt: now },
      update: { valueCm: value, updatedAt: now },
    });

    return ok({ circumference: { date: row.date, part: row.part, valueCm: row.valueCm } });
  } catch (e) {
    console.error("circumferences POST error", e);
    return serverError("failed to save circumference");
  }
}
