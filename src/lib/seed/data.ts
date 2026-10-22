/**
 * ASTNUM seed data — canonical muscle group definitions (FROZEN IDs — do not rename).
 * The 15 ids below are the frozen
 * cross-module contract used by the exercise library, workout templates and the
 * muscle-map heatmap. DO NOT rename, reorder or remove them.
 *
 * Mapping weights used across the seed library (matches ExerciseMuscles):
 *   role "primary"   → weight 1.0
 *   role "secondary" → weight 0.5
 */

export interface SeedMuscleGroup {
  id: string;
  nameAr: string;
  nameEn: string;
  svgId: string;
  region: "front" | "back";
}

/** Canonical muscle ids (FROZEN — exactly 15, order matters for sortOrder). */
export const MUSCLE_IDS = [
  "chest",
  "front_delts",
  "side_delts",
  "biceps",
  "forearms",
  "abs",
  "quads",
  "upper_back",
  "lats",
  "rear_delts",
  "triceps",
  "lower_back",
  "glutes",
  "hamstrings",
  "calves",
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export const MUSCLE_GROUPS: SeedMuscleGroup[] = [
  { id: "chest", nameAr: "الصدر", nameEn: "Chest", svgId: "chest", region: "front" },
  { id: "front_delts", nameAr: "الكتف الأمامي", nameEn: "Front Delts", svgId: "front_delts", region: "front" },
  { id: "side_delts", nameAr: "الكتف الجانبي", nameEn: "Side Delts", svgId: "side_delts", region: "front" },
  { id: "biceps", nameAr: "البايسبس", nameEn: "Biceps", svgId: "biceps", region: "front" },
  { id: "forearms", nameAr: "الساعد", nameEn: "Forearms", svgId: "forearms", region: "front" },
  { id: "abs", nameAr: "البطن", nameEn: "Abs", svgId: "abs", region: "front" },
  { id: "quads", nameAr: "الفخذ الأمامي", nameEn: "Quads", svgId: "quads", region: "front" },
  { id: "upper_back", nameAr: "الظهر العلوي", nameEn: "Upper Back / Traps", svgId: "upper_back", region: "back" },
  { id: "lats", nameAr: "اللاتس", nameEn: "Lats", svgId: "lats", region: "back" },
  { id: "rear_delts", nameAr: "الكتف الخلفي", nameEn: "Rear Delts", svgId: "rear_delts", region: "back" },
  { id: "triceps", nameAr: "الترايسبس", nameEn: "Triceps", svgId: "triceps", region: "back" },
  { id: "lower_back", nameAr: "أسفل الظهر", nameEn: "Lower Back", svgId: "lower_back", region: "back" },
  { id: "glutes", nameAr: "المؤخرة", nameEn: "Glutes", svgId: "glutes", region: "back" },
  { id: "hamstrings", nameAr: "الفخذ الخلفي", nameEn: "Hamstrings", svgId: "hamstrings", region: "back" },
  { id: "calves", nameAr: "السمانة", nameEn: "Calves", svgId: "calves", region: "back" },
];
