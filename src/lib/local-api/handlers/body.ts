/**
 * /api/body/** — port of the body API routes (verbatim logic):
 *   src/app/api/body/measurements/route.ts  (GET list + POST upsert + DELETE)
 *   src/app/api/body/circumferences/route.ts (GET + POST single-part upsert)
 *   src/app/api/body/photos/route.ts         (GET + POST + DELETE)
 *   src/app/api/body/import/route.ts         (POST CSV bulk import)
 * plus the body/_lib.ts port (ranges, day-key validation, parseNumber).
 *
 * OFFLINE ADDITION (documented contract): photos keep the per-photo 400 KB
 * VALIDATION cap and add a ~4 MB TOTAL budget → 400 QUOTA_EXCEEDED with a
 * friendly message (localStorage is the storage engine in the APK build).
 */

import { getDb, uuid } from "../db";
import {
  fail,
  ok,
  propagate,
  rawJsonObject,
  sortRows,
  type LocalRequest,
} from "../shared";
import type { BodyCircumferenceRow, BodyMeasurementRow } from "../db";

/* ── body/_lib.ts port ────────────────────────────────────────────── */

function validationError(message: string): never {
  return fail("VALIDATION", message, 400);
}

function notFoundMsg(message: string): never {
  return fail("NOT_FOUND", message, 404);
}

/** YYYY-MM-DD (local day key) with real-calendar validation. */
function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Parse a number-ish payload value. Returns null when absent/empty/invalid. */
function parseNumber(value: unknown): number | null {
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

function validateRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

// ── Body measurement ranges (STORAGE units: kg / cm) ──────────────
export const RANGES = {
  weight: { min: 20, max: 400 }, // kg
  bodyFat: { min: 2, max: 70 }, // %
  muscleMass: { min: 5, max: 200 }, // kg
  water: { min: 20, max: 80 }, // %
  visceralFat: { min: 1, max: 59 },
  circumference: { min: 20, max: 250 }, // cm
} as const;

export const CIRC_PARTS = ["chest", "waist", "arm", "thigh", "hip"] as const;
export type CircPart = (typeof CIRC_PARTS)[number];

function isCircPart(value: string): value is CircPart {
  return (CIRC_PARTS as readonly string[]).includes(value);
}

/* ── GET /api/body/measurements ───────────────────────────────────── */

export function measurementsList() {
  try {
    const db = getDb();
    const measurements = sortRows([...db.bodyMeasurements], [["date", "desc"]]).slice(0, 500);
    const circs = sortRows([...db.bodyCircumferences], [["date", "desc"]]).slice(0, 3000);

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
    propagate(e, "failed to load measurements");
  }
}

/* ── POST /api/body/measurements (upsert by date) ─────────────────── */

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

export function measurementsUpsert(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);
    const date = body.date;
    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");

    const now = new Date().toISOString();
    const existing = db.bodyMeasurements.find((m) => m.date === date);

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
        validationError(rule.message);
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
        if (raw.length > 500) validationError("notes must be at most 500 characters");
        notes = raw;
      } else {
        validationError("notes must be a string");
      }
    }

    const circUpserts: Array<{ part: CircPart; value: number }> = [];
    const circDeletes: CircPart[] = [];
    const circ = body.circumferences;
    if (circ !== undefined && circ !== null) {
      if (typeof circ !== "object" || Array.isArray(circ)) {
        validationError("circumferences must be an object");
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
          validationError(`${part} circumference must be between 20 and 250 cm`);
        }
        circUpserts.push({ part, value: parsed });
        hasValue = true;
      }
    }

    if (!hasValue) validationError("at least one measurement value is required");

    let measurement: BodyMeasurementRow;
    if (existing) {
      existing.weight = data.weight;
      existing.bodyFatPct = data.bodyFatPct;
      existing.muscleMass = data.muscleMass;
      existing.water = data.water;
      existing.visceralFat = data.visceralFat;
      existing.notes = notes;
      existing.updatedAt = now;
      measurement = existing;
    } else {
      measurement = {
        id: uuid(),
        date,
        ...data,
        notes,
        createdAt: now,
        updatedAt: now,
      };
      db.bodyMeasurements.push(measurement);
    }

    for (const op of circUpserts) {
      const row = db.bodyCircumferences.find((c) => c.date === date && c.part === op.part);
      if (row) {
        row.valueCm = op.value;
        row.updatedAt = now;
      } else {
        db.bodyCircumferences.push({
          id: uuid(),
          date,
          part: op.part,
          valueCm: op.value,
          updatedAt: now,
        });
      }
    }
    for (const part of circDeletes) {
      db.bodyCircumferences = db.bodyCircumferences.filter(
        (c) => !(c.date === date && c.part === part)
      );
    }

    const rows = db.bodyCircumferences.filter((c) => c.date === date);
    const circumferences: Record<string, number> = {};
    for (const r of rows) circumferences[r.part] = r.valueCm;

    return ok({ measurement: { ...measurement, circumferences } });
  } catch (e) {
    propagate(e, "failed to save measurement");
  }
}

/* ── DELETE /api/body/measurements?id= ─────────────────────────────── */

export function measurementsDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const id = req.query.get("id");
    if (!id) validationError("id query param required");

    const existing = db.bodyMeasurements.find((m) => m.id === id);
    if (!existing) notFoundMsg("measurement not found");

    db.bodyCircumferences = db.bodyCircumferences.filter((c) => c.date !== existing.date);
    db.bodyMeasurements.splice(db.bodyMeasurements.indexOf(existing), 1);

    return ok({ deleted: true, date: existing.date });
  } catch (e) {
    propagate(e, "failed to delete measurement");
  }
}

/* ── GET /api/body/circumferences ─────────────────────────────────── */

export function circumferencesList(req: LocalRequest) {
  try {
    const db = getDb();
    const date = req.query.get("date");
    if (date && !isValidDateKey(date)) {
      validationError("date must be a valid YYYY-MM-DD day key");
    }

    const rows = sortRows(
      date ? db.bodyCircumferences.filter((c) => c.date === date) : [...db.bodyCircumferences],
      [
        ["date", "desc"],
        ["part", "asc"],
      ]
    ).slice(0, 3000);

    return ok({
      circumferences: rows.map((r) => ({ date: r.date, part: r.part, valueCm: r.valueCm })),
    });
  } catch (e) {
    propagate(e, "failed to load circumferences");
  }
}

/* ── POST /api/body/circumferences (single-part upsert) ───────────── */

export function circumferencesUpsert(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);
    const date = body.date;
    const part = typeof body.part === "string" ? body.part : "";
    const value = parseNumber(body.valueCm);

    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");
    if (!["chest", "waist", "arm", "thigh", "hip"].includes(part)) {
      validationError("part must be one of chest|waist|arm|thigh|hip");
    }
    if (value === null) validationError("valueCm is required");
    if (!validateRange(value, RANGES.circumference.min, RANGES.circumference.max)) {
      validationError("valueCm must be between 20 and 250 cm");
    }

    const now = new Date().toISOString();
    let row: BodyCircumferenceRow;
    const existing = db.bodyCircumferences.find((c) => c.date === date && c.part === part);
    if (existing) {
      existing.valueCm = value;
      existing.updatedAt = now;
      row = existing;
    } else {
      row = { id: uuid(), date, part, valueCm: value, updatedAt: now };
      db.bodyCircumferences.push(row);
    }

    return ok({ circumference: { date: row.date, part: row.part, valueCm: row.valueCm } });
  } catch (e) {
    propagate(e, "failed to save circumference");
  }
}

/* ── GET/POST/DELETE /api/body/photos ─────────────────────────────── */

/** Max stored data-URL size: 400 KB (client compresses before sending). */
const MAX_DATA_URL_CHARS = 400 * 1024;
/** Offline total budget: ~4 MB of data URLs across all photos. */
const MAX_TOTAL_PHOTO_CHARS = 4 * 1024 * 1024;

export function photosList() {
  try {
    const db = getDb();
    const photos = sortRows([...db.progressPhotos], [["date", "desc"]]).slice(0, 200);
    return ok({
      photos: photos.map((p) => ({ id: p.id, date: p.date, filePath: p.filePath })),
    });
  } catch (e) {
    propagate(e, "failed to load photos");
  }
}

export function photosCreate(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req);
    const date = body.date;
    const dataUrl = body.dataUrl;

    if (!isValidDateKey(date)) validationError("date must be a valid YYYY-MM-DD day key");
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      validationError("dataUrl must be an image data URL (data:image/…)");
    }
    if (dataUrl.length >= MAX_DATA_URL_CHARS) {
      validationError("image too large — must be under 400 KB after client compression");
    }

    // OFFLINE ADDITION: total budget so a few photos can't exhaust localStorage.
    const total = db.progressPhotos.reduce((sum, p) => sum + p.filePath.length, 0);
    if (total + dataUrl.length > MAX_TOTAL_PHOTO_CHARS) {
      fail(
        "QUOTA_EXCEEDED",
        "photos storage is full — delete old photos to free space",
        400
      );
    }

    const now = new Date().toISOString();
    const photo = { id: uuid(), date, filePath: dataUrl, updatedAt: now };
    db.progressPhotos.push(photo);

    return ok({ photo: { id: photo.id, date: photo.date, filePath: photo.filePath } });
  } catch (e) {
    propagate(e, "failed to save photo");
  }
}

export function photosDelete(req: LocalRequest) {
  try {
    const db = getDb();
    const id = req.query.get("id");
    if (!id) validationError("id query param required");

    const existing = db.progressPhotos.find((p) => p.id === id);
    if (!existing) notFoundMsg("photo not found");

    db.progressPhotos.splice(db.progressPhotos.indexOf(existing), 1);
    return ok({ deleted: true });
  } catch (e) {
    propagate(e, "failed to delete photo");
  }
}

/* ── POST /api/body/import (CSV bulk rows) ────────────────────────── */

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

export function bodyImport(req: LocalRequest) {
  try {
    const db = getDb();
    const body = rawJsonObject(req) as { rows?: unknown };
    const rows = body.rows;

    if (!Array.isArray(rows)) validationError("rows array required");
    if (rows.length === 0) validationError("rows array is empty");
    if (rows.length > MAX_ROWS) validationError(`too many rows — max ${MAX_ROWS}`);

    type MetricKey2 = "weight" | "bodyFatPct" | "muscleMass" | "water" | "visceralFat";
    const rules: Record<MetricKey2, { min: number; max: number }> = {
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
        metrics: Partial<Record<MetricKey2, number | null>>;
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
      for (const key of Object.keys(rules) as MetricKey2[]) {
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
      const existing = db.bodyMeasurements.find((m) => m.date === date);

      if (existing) {
        existing.weight = entry.metrics.weight ?? existing.weight ?? null;
        existing.bodyFatPct = entry.metrics.bodyFatPct ?? existing.bodyFatPct ?? null;
        existing.muscleMass = entry.metrics.muscleMass ?? existing.muscleMass ?? null;
        existing.water = entry.metrics.water ?? existing.water ?? null;
        existing.visceralFat = entry.metrics.visceralFat ?? existing.visceralFat ?? null;
        existing.notes = entry.notes !== null ? entry.notes : existing.notes ?? null;
        existing.updatedAt = now;
      } else {
        db.bodyMeasurements.push({
          id: uuid(),
          date,
          weight: entry.metrics.weight ?? null,
          bodyFatPct: entry.metrics.bodyFatPct ?? null,
          muscleMass: entry.metrics.muscleMass ?? null,
          water: entry.metrics.water ?? null,
          visceralFat: entry.metrics.visceralFat ?? null,
          notes: entry.notes !== null ? entry.notes : null,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const part of CIRC_PARTS) {
        const value = entry.circ[part];
        if (value === undefined) continue;
        if (value === null) {
          db.bodyCircumferences = db.bodyCircumferences.filter(
            (c) => !(c.date === date && c.part === part)
          );
          continue;
        }
        const row = db.bodyCircumferences.find((c) => c.date === date && c.part === part);
        if (row) {
          row.valueCm = value;
          row.updatedAt = now;
        } else {
          db.bodyCircumferences.push({
            id: uuid(),
            date,
            part,
            valueCm: value,
            updatedAt: now,
          });
        }
      }
      imported++;
    }

    return ok({ imported, skipped });
  } catch (e) {
    propagate(e, "failed to import measurements");
  }
}
