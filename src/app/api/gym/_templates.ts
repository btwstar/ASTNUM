/**
 * Shared template loader/validators for gym template routes (server-only).
 * Private module — lives beside the routes but outside route.ts so
 * route files only export HTTP handlers (Next.js validates route exports).
 */
import { db } from "@/lib/db";
import { parseDaysJson } from "@/lib/logic/gym-smart";
import { validInt } from "./_helpers";

export interface TemplateExerciseInput {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
}

/** User-created templates get ids "utpl-<uuid>" — everything else is built-in. */
export function isBuiltinTemplate(id: string): boolean {
  return !id.startsWith("utpl-");
}

/** Shared loader: templates + joined exercises + exercise names (3 queries). */
export async function loadTemplates() {
  const [templates, templateExercises, exercises] = await Promise.all([
    db.workoutTemplates.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.templateExercises.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.exercises.findMany({
      where: { deletedAt: null },
      select: { id: true, nameAr: true, nameEn: true, equipment: true },
    }),
  ]);
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const byTemplate = new Map<string, typeof templateExercises>();
  for (const te of templateExercises) {
    let list = byTemplate.get(te.templateId);
    if (!list) {
      list = [];
      byTemplate.set(te.templateId, list);
    }
    list.push(te);
  }
  return templates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    builtin: isBuiltinTemplate(tpl.id),
    days: parseDaysJson(tpl.daysJson),
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
    exercises: (byTemplate.get(tpl.id) ?? []).map((te) => {
      const ex = exerciseById.get(te.exerciseId);
      return {
        id: te.id,
        exerciseId: te.exerciseId,
        targetSets: te.targetSets,
        targetReps: te.targetReps,
        sortOrder: te.sortOrder,
        exercise: ex
          ? { nameAr: ex.nameAr, nameEn: ex.nameEn, equipment: ex.equipment }
          : null,
      };
    }),
  }));
}

/** Normalize + validate an exercises array → { exercises } or { error }. */
export function parseTemplateExercises(
  raw: unknown
): { exercises: TemplateExerciseInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "exercises_required" };
  if (raw.length > 30) return { error: "too_many_exercises" };
  const out: TemplateExerciseInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "invalid_exercise_entry" };
    }
    const r = item as { exerciseId?: unknown; targetSets?: unknown; targetReps?: unknown };
    if (typeof r.exerciseId !== "string" || !r.exerciseId) return { error: "invalid_exercise_id" };
    const sets = validInt(r.targetSets ?? 3, 1, 12);
    const reps = validInt(r.targetReps ?? 10, 1, 100);
    if (sets === null || reps === null) return { error: "invalid_targets" };
    out.push({ exerciseId: r.exerciseId, targetSets: sets, targetReps: reps });
  }
  return { exercises: out };
}

/** Bilingual name storage: "AR | EN" (frozen seed convention). */
export function templateNameFrom(nameAr: string, nameEn: string): string {
  return `${nameAr} | ${nameEn}`;
}
