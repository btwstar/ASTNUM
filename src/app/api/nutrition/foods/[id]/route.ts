import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { ok, validationError, notFound, serverError } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/nutrition/foods/[id] — remove a food from the user's database
 * (SOFT delete: deletedAt = now, mirroring habits/notes/exercises).
 *
 * Safe by design: meal logs snapshot name/kcal/macros at logging time, so
 * past (and future "repeat yesterday") entries keep rendering untouched.
 * Soft-deleted rows also keep the foods count > 0, which prevents the seed
 * guard from re-importing the 171 starter items after a wipe-by-hand.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return validationError("id is required");

    const existing = await db.foods.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return notFound("food not found");

    await db.foods.update({
      where: { id: existing.id },
      data: { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });

    return ok({ deleted: true });
  } catch (e) {
    console.error("nutrition foods DELETE error", e);
    return serverError("failed to delete food");
  }
}
