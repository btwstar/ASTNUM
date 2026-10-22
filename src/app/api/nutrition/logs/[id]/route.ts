import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, notFound, serverError, parseNumber, round2 } from "../../_lib";

export const dynamic = "force-dynamic";

/** PATCH /api/nutrition/logs/[id] { quantity } — re-scale stored macros proportionally. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { quantity?: unknown };

    const existing = await db.foodLogs.findUnique({ where: { id } });
    if (!existing) return notFound("food log not found");

    const newQuantity = parseNumber(body.quantity);
    if (newQuantity === null || newQuantity < 0.1 || newQuantity > 100) {
      return validationError("quantity must be between 0.1 and 100");
    }

    // Original per-portion = stored ÷ old quantity, then × new quantity.
    const oldQuantity = existing.quantity > 0 ? existing.quantity : 1;
    const scale = newQuantity / oldQuantity;

    const log = await db.foodLogs.update({
      where: { id },
      data: {
        quantity: newQuantity,
        grams: existing.grams !== null ? round2(existing.grams * scale) : null,
        kcal: round2(existing.kcal * scale),
        protein: round2(existing.protein * scale),
        carbs: round2(existing.carbs * scale),
        fat: round2(existing.fat * scale),
        updatedAt: new Date().toISOString(),
      },
    });

    return ok({ log });
  } catch (e) {
    console.error("nutrition log PATCH error", e);
    return serverError("failed to update food log");
  }
}

/** DELETE /api/nutrition/logs/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const existing = await db.foodLogs.findUnique({ where: { id } });
    if (!existing) return notFound("food log not found");

    await db.foodLogs.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    console.error("nutrition log DELETE error", e);
    return serverError("failed to delete food log");
  }
}
