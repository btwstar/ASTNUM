import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, notFound, serverError, isValidDateKey } from "../_lib";

export const dynamic = "force-dynamic";

/** Max stored data-URL size: 400 KB (client compresses before sending). */
const MAX_DATA_URL_CHARS = 400 * 1024;

/**
 * GET /api/body/photos → { photos: [{ id, date, filePath }] } (newest first).
 * filePath holds a data: URL in the web build (app-private path in native).
 */
export async function GET() {
  try {
    const photos = await db.progressPhotos.findMany({ orderBy: { date: "desc" }, take: 200 });
    return ok({
      photos: photos.map((p) => ({ id: p.id, date: p.date, filePath: p.filePath })),
    });
  } catch (e) {
    console.error("photos GET error", e);
    return serverError("failed to load photos");
  }
}

/**
 * POST /api/body/photos { date, dataUrl }
 * Validates: dataUrl starts with "data:image/" and is under 400 KB.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { date?: unknown; dataUrl?: unknown };
    const date = body.date;
    const dataUrl = body.dataUrl;

    if (!isValidDateKey(date)) return validationError("date must be a valid YYYY-MM-DD day key");
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return validationError("dataUrl must be an image data URL (data:image/…)");
    }
    if (dataUrl.length >= MAX_DATA_URL_CHARS) {
      return validationError("image too large — must be under 400 KB after client compression");
    }

    const now = new Date().toISOString();
    const photo = await db.progressPhotos.create({
      data: { id: crypto.randomUUID(), date, filePath: dataUrl, updatedAt: now },
    });

    return ok({ photo: { id: photo.id, date: photo.date, filePath: photo.filePath } });
  } catch (e) {
    console.error("photos POST error", e);
    return serverError("failed to save photo");
  }
}

/** DELETE /api/body/photos?id=… */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return validationError("id query param required");

    const existing = await db.progressPhotos.findUnique({ where: { id } });
    if (!existing) return notFound("photo not found");

    await db.progressPhotos.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    console.error("photos DELETE error", e);
    return serverError("failed to delete photo");
  }
}
