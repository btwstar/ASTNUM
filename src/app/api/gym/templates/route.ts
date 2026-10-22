/**
 * /api/gym/templates — workout templates.
 *
 * GET  → all non-deleted templates (built-in seeded + user-created) with their
 *      exercises joined: [{exerciseId, targetSets, targetReps, sortOrder,
 *      exercise:{nameAr,nameEn,equipment}}]. `name` is stored per the seed
 *      convention "AR name | EN name" — split on " | " for display.
 *      `builtin` flag = id does NOT start with "utpl-" (user template prefix).
 *
 * POST { name?, nameAr?, nameEn?, description?, days?, exercises: [{exerciseId,
 *      targetSets, targetReps}] } → create a user template.
 *      One of name/nameAr/nameEn required (stored bilingually);
 *      ≥1 exercise required; ids validated against the exercise library.
 *      days: optional weekday ints 0..6 (0=Sunday) dedicated to this
 *      template — [] or omitted = any day ("جدول اليوم" ignores it).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { bad, ensureSeeded, ok, readJson, serverError } from "../_helpers";
import {
  loadTemplates,
  parseTemplateExercises,
  templateNameFrom,
} from "../_templates";
import { encodeDaysJson, validateDaysInput } from "@/lib/logic/gym-smart";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const templates = await loadTemplates();
    return ok({ templates });
  } catch (e) {
    console.error("gym templates GET error", e);
    return serverError("failed_to_load_templates");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return bad("json_object_body_required");

    const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
    const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!nameAr && !nameEn && !name) return bad("name_required");
    if (nameAr.length > 80 || nameEn.length > 80 || name.length > 80) {
      return bad("name_too_long");
    }
    const finalAr = nameAr || name.replace(/\s\|\s/g, " ") || nameEn;
    const finalEn = nameEn || name.replace(/\s\|\s/g, " ") || nameAr;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 300)
        : null;

    const parsed = parseTemplateExercises(body.exercises);
    if ("error" in parsed) return bad(parsed.error);
    const exercises = parsed.exercises;

    // v1.17 day scheduling — validate + encode before touching the DB
    const daysParsed = validateDaysInput(body.days);
    if (daysParsed.kind === "invalid") return bad("invalid_days");

    // every exerciseId must exist in the library
    const known = new Set(
      (
        await db.exercises.findMany({
          where: { deletedAt: null },
          select: { id: true },
        })
      ).map((e) => e.id)
    );
    if (exercises.some((te) => !known.has(te.exerciseId))) return bad("unknown_exercise_id");

    const now = new Date().toISOString();
    const id = `utpl-${crypto.randomUUID()}`;
    await db.$transaction([
      db.workoutTemplates.create({
        data: {
          id,
          name: templateNameFrom(finalAr, finalEn),
          description,
          daysJson: daysParsed.kind === "days" ? encodeDaysJson(daysParsed.days) : null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
      db.templateExercises.createMany({
        data: exercises.map((te, i) => ({
          id: `te-${crypto.randomUUID()}`,
          templateId: id,
          exerciseId: te.exerciseId,
          targetSets: te.targetSets,
          targetReps: te.targetReps,
          sortOrder: i,
        })),
      }),
    ]);

    const templates = await loadTemplates();
    const created = templates.find((tpl) => tpl.id === id);
    return ok({ template: created ?? null });
  } catch (e) {
    console.error("gym templates POST error", e);
    return serverError("failed_to_create_template");
  }
}
