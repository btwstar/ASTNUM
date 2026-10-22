/**
 * ASTNUM seed data — workout templates (6 classic splits).
 *
 * IMPORTANT DB CONVENTION (schema has a single `name` column for templates):
 *   WorkoutTemplates.name is stored as "<nameAr> | <nameEn>" (e.g. "يوم دفع | Push Day")
 *   so any screen can display it as-is in either locale, or split on " | ".
 *   `description` is a short bilingual line.
 *
 * Every exerciseId references the exercise library (exercises.ts slugs).
 * targetSets 3-4, targetReps 8-12 — realistic default prescriptions.
 */
import type { SeedExercise } from "./exercises";

export interface SeedTemplateExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
}

export interface SeedTemplate {
  id: string; // stable slug — used as PK, never regenerated
  nameAr: string;
  nameEn: string;
  description: string;
  exercises: SeedTemplateExercise[];
}

export const TEMPLATES: SeedTemplate[] = [
  {
    id: "tpl-push",
    nameAr: "يوم دفع",
    nameEn: "Push Day",
    description: "صدر وأكتاف وترايسبس — Chest, shoulders & triceps",
    exercises: [
      { exerciseId: "bench-press", targetSets: 4, targetReps: 8 },
      { exerciseId: "incline-dumbbell-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "cable-crossover", targetSets: 3, targetReps: 12 },
      { exerciseId: "overhead-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "lateral-raise", targetSets: 3, targetReps: 12 },
      { exerciseId: "triceps-pushdown", targetSets: 3, targetReps: 12 },
      { exerciseId: "dumbbell-overhead-extension", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    id: "tpl-pull",
    nameAr: "يوم سحب",
    nameEn: "Pull Day",
    description: "ظهر وبايسبس — Back & biceps",
    exercises: [
      { exerciseId: "pull-up", targetSets: 4, targetReps: 8 },
      { exerciseId: "wide-grip-lat-pulldown", targetSets: 3, targetReps: 10 },
      { exerciseId: "seated-cable-row", targetSets: 3, targetReps: 10 },
      { exerciseId: "one-arm-dumbbell-row", targetSets: 3, targetReps: 12 },
      { exerciseId: "face-pull", targetSets: 3, targetReps: 12 },
      { exerciseId: "barbell-curl", targetSets: 3, targetReps: 10 },
      { exerciseId: "hammer-curl", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    id: "tpl-legs",
    nameAr: "يوم أرجل",
    nameEn: "Legs Day",
    description: "أرجل كاملة مع السمانة — Full legs + calves",
    exercises: [
      { exerciseId: "back-squat", targetSets: 4, targetReps: 8 },
      { exerciseId: "leg-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "romanian-deadlift", targetSets: 3, targetReps: 10 },
      { exerciseId: "walking-lunge", targetSets: 3, targetReps: 12 },
      { exerciseId: "leg-extension", targetSets: 3, targetReps: 12 },
      { exerciseId: "lying-leg-curl", targetSets: 3, targetReps: 12 },
      { exerciseId: "standing-calf-raise", targetSets: 4, targetReps: 12 },
    ],
  },
  {
    id: "tpl-upper",
    nameAr: "يوم علوي",
    nameEn: "Upper Day",
    description: "جزء علوي كامل — Full upper body",
    exercises: [
      { exerciseId: "bench-press", targetSets: 4, targetReps: 8 },
      { exerciseId: "barbell-row", targetSets: 4, targetReps: 8 },
      { exerciseId: "overhead-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "wide-grip-lat-pulldown", targetSets: 3, targetReps: 10 },
      { exerciseId: "lateral-raise", targetSets: 3, targetReps: 12 },
      { exerciseId: "barbell-curl", targetSets: 3, targetReps: 10 },
      { exerciseId: "triceps-pushdown", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    id: "tpl-lower",
    nameAr: "يوم سفلي",
    nameEn: "Lower Day",
    description: "جزء سفلي كامل — Full lower body",
    exercises: [
      { exerciseId: "deadlift", targetSets: 4, targetReps: 8 },
      { exerciseId: "leg-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "bulgarian-split-squat", targetSets: 3, targetReps: 10 },
      { exerciseId: "seated-leg-curl", targetSets: 3, targetReps: 12 },
      { exerciseId: "leg-extension", targetSets: 3, targetReps: 12 },
      { exerciseId: "seated-calf-raise", targetSets: 3, targetReps: 12 },
      { exerciseId: "back-extension", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    id: "tpl-full-body",
    nameAr: "جسم كامل",
    nameEn: "Full Body",
    description: "تدريب شامل للجسم — Whole-body session",
    exercises: [
      { exerciseId: "back-squat", targetSets: 3, targetReps: 10 },
      { exerciseId: "bench-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "wide-grip-lat-pulldown", targetSets: 3, targetReps: 10 },
      { exerciseId: "barbell-row", targetSets: 3, targetReps: 10 },
      { exerciseId: "overhead-press", targetSets: 3, targetReps: 10 },
      { exerciseId: "barbell-curl", targetSets: 3, targetReps: 12 },
      { exerciseId: "triceps-pushdown", targetSets: 3, targetReps: 12 },
    ],
  },
];

/**
 * Compile-time guard: every template exercise id must exist in the exercise
 * library. Throws at module load if a slug is typo'd (cheap insurance).
 */
export function assertTemplatesReferenceValidExercises(exercises: SeedExercise[]): void {
  const ids = new Set(exercises.map((e) => e.id));
  for (const tpl of TEMPLATES) {
    for (const te of tpl.exercises) {
      if (!ids.has(te.exerciseId)) {
        throw new Error(`Template ${tpl.id} references unknown exercise: ${te.exerciseId}`);
      }
    }
  }
}
