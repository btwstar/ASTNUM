import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, notFound, serverError, parseNumber, round2 } from "../_lib";
import { resolveFoodImagePair } from "@/lib/image-compress";

export const dynamic = "force-dynamic";

/**
 * GET /api/nutrition/foods?q=&favorite=
 * Search the local food DB (nameAr/nameEn contains, favorites filter, limit 30).
 * ensureSeed() runs first (the seeded 160+ Egyptian items).
 *
 * LEAN PROJECTION (v1.13): list rows strip the full `image` data URL and only
 * carry the small `imageThumb` (mirrors the notes list contract) — 30 full
 * photos would otherwise bloat the payload to multiple MB.
 */
export async function GET(req: NextRequest) {
  try {
    // Populate the local food DB once (idempotent, concurrency-safe).
    try {
      const { ensureSeed } = await import("@/lib/seed");
      await ensureSeed();
    } catch {
      /* seed module unavailable — foods list may be empty; handled gracefully */
    }

    const params = req.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 60);
    const favorite = params.get("favorite");
    const limit = Math.min(Math.max(Number(params.get("limit")) || 30, 1), 50);

    const where: Record<string, unknown> = { deletedAt: null };
    if (q) {
      where.OR = [
        { nameAr: { contains: q } },
        { nameEn: { contains: q } },
        { brand: { contains: q } },
      ];
    }
    if (favorite === "1" || favorite === "true") {
      where.favorite = true;
    }

    const foods = await db.foods.findMany({
      where,
      orderBy: [{ favorite: "desc" }, { custom: "desc" }, { nameAr: "asc" }],
      take: limit,
    });

    // lists never carry the full-size photo — only the small thumbnail
    return ok({ foods: foods.map((f) => ({ ...f, image: null })) });
  } catch (e) {
    console.error("nutrition foods GET error", e);
    return serverError("failed to search foods");
  }
}

const MAX_FOOD_KCAL = 2000;
const MAX_FOOD_MACRO = 200;

/** Shared numeric guards for POST create + PATCH edit (same sanity caps). */
function guardMacro(label: string, value: number): ReturnType<typeof validationError> | null {
  if (value < 0) return validationError(`${label} can't be negative`);
  if (value > MAX_FOOD_MACRO) {
    return validationError(`${label} above sanity limit (${MAX_FOOD_MACRO} g)`);
  }
  return null;
}

/**
 * POST /api/nutrition/foods — create a custom food.
 * { nameAr, nameEn?, brand?, kcal, protein, carbs, fat, servingG?,
 *   image?+imageThumb? (paired data URLs, both-or-neither), custom: true }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim().slice(0, 80) : "";
    if (!nameAr) return validationError("nameAr is required");

    const kcal = parseNumber(body.kcal);
    if (kcal === null || kcal < 0 || kcal > MAX_FOOD_KCAL) {
      return validationError(`kcal must be between 0 and ${MAX_FOOD_KCAL}`);
    }

    const protein = parseNumber(body.protein) ?? 0;
    const carbs = parseNumber(body.carbs) ?? 0;
    const fat = parseNumber(body.fat) ?? 0;
    for (const [label, value] of [
      ["protein", protein],
      ["carbs", carbs],
      ["fat", fat],
    ] as const) {
      const err = guardMacro(label, value);
      if (err) return err;
    }

    let servingG: number | null = null;
    if (body.servingG !== undefined && body.servingG !== null && body.servingG !== "") {
      const parsed = parseNumber(body.servingG);
      if (parsed === null || parsed < 1 || parsed > 2000) {
        return validationError("servingG must be between 1 and 2000");
      }
      servingG = parsed;
    }

    const imagePair = resolveFoodImagePair(body.image, body.imageThumb);
    if (imagePair.kind === "invalid") {
      return validationError("image/imageThumb must be a valid data-URL pair (or both null)");
    }

    const nameEn =
      typeof body.nameEn === "string" && body.nameEn.trim() ? body.nameEn.trim().slice(0, 80) : nameAr;

    const now = new Date().toISOString();
    const food = await db.foods.create({
      data: {
        id: crypto.randomUUID(),
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
      },
    });

    return ok({ food });
  } catch (e) {
    console.error("nutrition foods POST error", e);
    return serverError("failed to create custom food");
  }
}

/**
 * PATCH /api/nutrition/foods — edit any food (seeded or custom).
 * { id, favorite?, nameAr?, nameEn?, brand?, kcal?, protein?, carbs?, fat?,
 *   servingG? (number|null to clear), image?+imageThumb? (pair: set/remove) }
 *
 * Only the fields PRESENT in the body are touched. Logs are snapshots, so
 * editing never rewrites past entries. nameEn auto-syncs when it mirrored
 * nameAr before the edit (custom foods created without an English name).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.id !== "string" || !body.id) return validationError("id is required");

    const existing = await db.foods.findFirst({ where: { id: body.id, deletedAt: null } });
    if (!existing) return notFound("food not found");

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (typeof body.favorite === "boolean") {
      data.favorite = body.favorite;
    }

    if (body.nameAr !== undefined) {
      const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim().slice(0, 80) : "";
      if (!nameAr) return validationError("nameAr can't be empty");
      data.nameAr = nameAr;
      // keep the auto-set English name in sync (custom foods: nameEn === old nameAr)
      if (existing.nameEn === existing.nameAr) data.nameEn = nameAr;
    }
    if (body.nameEn !== undefined) {
      const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim().slice(0, 80) : "";
      if (!nameEn) return validationError("nameEn can't be empty when provided");
      data.nameEn = nameEn;
    }
    if (body.brand !== undefined) {
      if (body.brand === null) {
        data.brand = null;
      } else if (typeof body.brand === "string") {
        data.brand = body.brand.trim().slice(0, 60) || null;
      } else {
        return validationError("brand must be a string or null");
      }
    }

    for (const key of ["kcal", "protein", "carbs", "fat"] as const) {
      if (body[key] === undefined) continue;
      const parsed = parseNumber(body[key]);
      if (parsed === null) return validationError(`${key} must be a number`);
      if (key === "kcal") {
        if (parsed < 0 || parsed > MAX_FOOD_KCAL) {
          return validationError(`kcal must be between 0 and ${MAX_FOOD_KCAL}`);
        }
      } else {
        const err = guardMacro(key, parsed);
        if (err) return err;
      }
      data[key] = round2(parsed);
    }

    if (body.servingG !== undefined) {
      if (body.servingG === null || body.servingG === "") {
        data.servingG = null;
      } else {
        const parsed = parseNumber(body.servingG);
        if (parsed === null || parsed < 1 || parsed > 2000) {
          return validationError("servingG must be between 1 and 2000");
        }
        data.servingG = parsed;
      }
    }

    if (body.image !== undefined || body.imageThumb !== undefined) {
      const imagePair = resolveFoodImagePair(body.image, body.imageThumb);
      if (imagePair.kind === "invalid") {
        return validationError("image/imageThumb must be a valid data-URL pair (or both null)");
      }
      if (imagePair.kind === "set") {
        data.image = imagePair.image;
        data.imageThumb = imagePair.imageThumb;
      } else if (imagePair.kind === "remove") {
        data.image = null;
        data.imageThumb = null;
      }
    }

    const food = await db.foods.update({ where: { id: existing.id }, data });

    return ok({ food });
  } catch (e) {
    console.error("nutrition foods PATCH error", e);
    return serverError("failed to update food");
  }
}
