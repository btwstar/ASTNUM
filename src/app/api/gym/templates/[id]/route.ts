/**
 * /api/gym/templates/[id] — edit / soft-delete a template.
 *
 * PATCH  { name?, nameAr?, nameEn?, description?, days?, exercises? }
 *        exercises (when present) REPLACE the whole prescription list
 *        (delete + recreate, sortOrder = array index).
 *        days (v1.17): weekday ints 0..6 dedicated to this template;
 *        [] clears (= any day). Omitted = untouched.
 *        Built-in seeded templates may be edited too — the user owns the DB.
 *
 * DELETE → soft delete (deletedAt), its TemplateExercises rows are kept but
 *        hidden with the parent. 404 when the template does not exist.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { bad, notFound, ok, readJson, serverError } from "../../_helpers";
import { loadTemplates, parseTemplateExercises, templateNameFrom } from "../../_templates";
import { encodeDaysJson, validateDaysInput } from "@/lib/logic/gym-smart";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** tiny internal control-flow error so the transaction can abort with a 400 */
class ValidationError extends Error {}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const tpl = await db.workoutTemplates.findUnique({ where: { id } });
    if (!tpl || tpl.deletedAt) return notFound("template_not_found");

    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    const data: {
      name?: string;
      description?: string | null;
      daysJson?: string | null;
      updatedAt: string;
    } = { updatedAt: new Date().toISOString() };

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (nameAr || nameEn || name) {
      if (nameAr.length > 80 || nameEn.length > 80 || name.length > 80) {
        return bad("name_too_long");
      }
      const finalAr = nameAr || name.replace(/\s\|\s/g, " ") || nameEn;
      const finalEn = nameEn || name.replace(/\s\|\s/g, " ") || nameAr;
      data.name = templateNameFrom(finalAr, finalEn);
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim().slice(0, 300)
          : null;
    }

    // v1.17 day scheduling — [] clears (any day), omitted = untouched
    const daysParsed = validateDaysInput(body.days);
    if (daysParsed.kind === "invalid") return bad("invalid_days");
    if (daysParsed.kind === "days") data.daysJson = encodeDaysJson(daysParsed.days);

    const replaceExercises = body.exercises !== undefined;

    await db.$transaction(async (tx) => {
      await tx.workoutTemplates.update({ where: { id }, data });
      if (replaceExercises) {
        const parsed = parseTemplateExercises(body.exercises);
        if ("error" in parsed) throw new ValidationError(parsed.error);
        const known = new Set(
          (
            await tx.exercises.findMany({
              where: { deletedAt: null },
              select: { id: true },
            })
          ).map((e) => e.id)
        );
        if (parsed.exercises.some((te) => !known.has(te.exerciseId))) {
          throw new ValidationError("unknown_exercise_id");
        }
        await tx.templateExercises.deleteMany({ where: { templateId: id } });
        await tx.templateExercises.createMany({
          data: parsed.exercises.map((te, i) => ({
            id: `te-${crypto.randomUUID()}`,
            templateId: id,
            exerciseId: te.exerciseId,
            targetSets: te.targetSets,
            targetReps: te.targetReps,
            sortOrder: i,
          })),
        });
      }
    });

    const templates = await loadTemplates();
    const updated = templates.find((t) => t.id === id);
    return ok({ template: updated ?? null });
  } catch (e) {
    if (e instanceof ValidationError) return bad(e.message);
    console.error("gym template PATCH error", e);
    return serverError("failed_to_update_template");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const tpl = await db.workoutTemplates.findUnique({ where: { id } });
    if (!tpl || tpl.deletedAt) return notFound("template_not_found");
    await db.workoutTemplates.update({
      where: { id },
      data: { deletedAt: new Date().toISOString() },
    });
    return ok({ deleted: id });
  } catch (e) {
    console.error("gym template DELETE error", e);
    return serverError("failed_to_delete_template");
  }
}
