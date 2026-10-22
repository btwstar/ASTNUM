/**
 * ASTNUM seed data — exercise library (164 exercises).
 * Arabic names use common Egyptian gym terminology (e.g. "ضغط بنش بالبار",
 * "سحب أمامي واسع", "رفرفة", "متوازي", "استيك" for bands).
 *
 * Mapping conventions (ExerciseMuscles):
 *   - p(muscle) → role "primary",   weight 1.0
 *   - s(muscle) → role "secondary", weight 0.5
 *   - Only canonical muscle ids from data.ts (MUSCLE_IDS) are allowed.
 *   - Every exercise has at least one primary muscle; a muscle appears at most
 *     once per exercise (composite PK exerciseId+muscleId).
 *
 * Equipment covers: barbell, dumbbell, machine, cable, bodyweight, kettlebell,
 * band, other. All 15 muscles have multiple primary exercises each.
 */
import type { MuscleId } from "./data";

export type SeedEquipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export type SeedMuscleRole = "primary" | "secondary";

export interface SeedExerciseMuscle {
  muscleId: MuscleId;
  role: SeedMuscleRole;
  weight: number;
}

export interface SeedExercise {
  id: string; // stable slug — used as PK, never regenerated
  nameAr: string;
  nameEn: string;
  equipment: SeedEquipment;
  muscles: SeedExerciseMuscle[];
}

const p = (muscleId: MuscleId): SeedExerciseMuscle => ({ muscleId, role: "primary", weight: 1 });
const s = (muscleId: MuscleId): SeedExerciseMuscle => ({ muscleId, role: "secondary", weight: 0.5 });

export const EXERCISES: SeedExercise[] = [
  // ─────────────────────────── CHEST ───────────────────────────
  { id: "bench-press", nameAr: "ضغط بنش بالبار", nameEn: "Bench Press (Barbell)", equipment: "barbell", muscles: [p("chest"), s("triceps"), s("front_delts")] },
  { id: "incline-bench-press", nameAr: "ضغط بنش مايل بالبار", nameEn: "Incline Bench Press", equipment: "barbell", muscles: [p("chest"), s("front_delts"), s("triceps")] },
  { id: "decline-bench-press", nameAr: "ضغط بنش نازل بالبار", nameEn: "Decline Bench Press", equipment: "barbell", muscles: [p("chest"), s("triceps")] },
  { id: "dumbbell-bench-press", nameAr: "ضغط بنش دامبل", nameEn: "Dumbbell Bench Press", equipment: "dumbbell", muscles: [p("chest"), s("triceps"), s("front_delts")] },
  { id: "incline-dumbbell-press", nameAr: "ضغط دامبل مايل", nameEn: "Incline Dumbbell Press", equipment: "dumbbell", muscles: [p("chest"), s("front_delts"), s("triceps")] },
  { id: "decline-dumbbell-press", nameAr: "ضغط دامبل نازل", nameEn: "Decline Dumbbell Press", equipment: "dumbbell", muscles: [p("chest"), s("triceps")] },
  { id: "dumbbell-fly", nameAr: "تفتيح دامبل أرضي", nameEn: "Dumbbell Fly", equipment: "dumbbell", muscles: [p("chest"), s("front_delts")] },
  { id: "incline-dumbbell-fly", nameAr: "تفتيح دامبل مايل", nameEn: "Incline Dumbbell Fly", equipment: "dumbbell", muscles: [p("chest"), s("front_delts")] },
  { id: "chest-press-machine", nameAr: "ضغط صدر جهاز", nameEn: "Chest Press Machine", equipment: "machine", muscles: [p("chest"), s("triceps")] },
  { id: "incline-chest-press-machine", nameAr: "ضغط صدر مايل جهاز", nameEn: "Incline Chest Press Machine", equipment: "machine", muscles: [p("chest"), s("front_delts")] },
  { id: "pec-deck", nameAr: "تفتيح صدر جهاز (بيك ديك)", nameEn: "Pec Deck Fly", equipment: "machine", muscles: [p("chest")] },
  { id: "cable-crossover", nameAr: "تفتيح كيبل من أعلى", nameEn: "Cable Crossover", equipment: "cable", muscles: [p("chest"), s("front_delts")] },
  { id: "pushup", nameAr: "ضغط أرضي (بوش أب)", nameEn: "Push-Up", equipment: "bodyweight", muscles: [p("chest"), s("triceps"), s("front_delts"), s("abs")] },
  { id: "decline-pushup", nameAr: "ضغط أرضي بأرجل مرتفعة", nameEn: "Feet-Elevated Push-Up", equipment: "bodyweight", muscles: [p("chest"), s("triceps")] },
  { id: "wide-pushup", nameAr: "ضغط أرضي بقبضة واسعة", nameEn: "Wide Push-Up", equipment: "bodyweight", muscles: [p("chest"), s("front_delts")] },
  { id: "chest-dip", nameAr: "متوازي مايل للصدر", nameEn: "Chest Dip", equipment: "bodyweight", muscles: [p("chest"), s("triceps"), s("front_delts")] },
  { id: "band-chest-press", nameAr: "ضغط صدر باستيك", nameEn: "Band Chest Press", equipment: "band", muscles: [p("chest"), s("triceps")] },
  { id: "band-chest-fly", nameAr: "تفتيح صدر باستيك", nameEn: "Band Chest Fly", equipment: "band", muscles: [p("chest")] },
  { id: "kettlebell-floor-press", nameAr: "ضغط أرضي كيتل بل", nameEn: "Kettlebell Floor Press", equipment: "kettlebell", muscles: [p("chest"), s("triceps")] },

  // ──────────────────── FRONT DELTS (shoulders) ────────────────────
  { id: "overhead-press", nameAr: "ضغط كتف بالبار واقف (ميليتاري)", nameEn: "Overhead Press", equipment: "barbell", muscles: [p("front_delts"), s("triceps"), s("upper_back")] },
  { id: "seated-dumbbell-shoulder-press", nameAr: "ضغط كتف دامبل جالس", nameEn: "Seated Dumbbell Shoulder Press", equipment: "dumbbell", muscles: [p("front_delts"), s("triceps"), s("side_delts")] },
  { id: "arnold-press", nameAr: "ضغط أرنولد", nameEn: "Arnold Press", equipment: "dumbbell", muscles: [p("front_delts"), s("side_delts"), s("triceps")] },
  { id: "machine-shoulder-press", nameAr: "ضغط كتف جهاز", nameEn: "Machine Shoulder Press", equipment: "machine", muscles: [p("front_delts"), s("triceps"), s("side_delts")] },
  { id: "kettlebell-press", nameAr: "ضغط كيتل بل فوق الرأس", nameEn: "Kettlebell Overhead Press", equipment: "kettlebell", muscles: [p("front_delts"), s("triceps"), s("side_delts")] },
  { id: "pike-pushup", nameAr: "ضغط بايك", nameEn: "Pike Push-Up", equipment: "bodyweight", muscles: [p("front_delts"), s("triceps"), s("chest")] },
  { id: "handstand-pushup", nameAr: "ضغط وقوف على اليدين", nameEn: "Handstand Push-Up", equipment: "bodyweight", muscles: [p("front_delts"), s("triceps"), s("upper_back")] },
  { id: "barbell-front-raise", nameAr: "رفرفة أمامي بالبار", nameEn: "Barbell Front Raise", equipment: "barbell", muscles: [p("front_delts")] },
  { id: "dumbbell-front-raise", nameAr: "رفرفة أمامي دامبل", nameEn: "Dumbbell Front Raise", equipment: "dumbbell", muscles: [p("front_delts")] },
  { id: "cable-front-raise", nameAr: "رفرفة أمامي كيبل", nameEn: "Cable Front Raise", equipment: "cable", muscles: [p("front_delts")] },
  { id: "band-overhead-press", nameAr: "ضغط كتف باستيك", nameEn: "Band Overhead Press", equipment: "band", muscles: [p("front_delts"), s("triceps")] },

  // ──────────────────── SIDE DELTS (shoulders) ────────────────────
  { id: "lateral-raise", nameAr: "رفرفة جانبي دامبل", nameEn: "Dumbbell Lateral Raise", equipment: "dumbbell", muscles: [p("side_delts")] },
  { id: "cable-lateral-raise", nameAr: "رفرفة جانبي كيبل", nameEn: "Cable Lateral Raise", equipment: "cable", muscles: [p("side_delts")] },
  { id: "machine-lateral-raise", nameAr: "رفرفة جانبي جهاز", nameEn: "Machine Lateral Raise", equipment: "machine", muscles: [p("side_delts")] },
  { id: "band-lateral-raise", nameAr: "رفرفة جانبي باستيك", nameEn: "Band Lateral Raise", equipment: "band", muscles: [p("side_delts")] },
  { id: "upright-row", nameAr: "سحب عمودي بالبار", nameEn: "Barbell Upright Row", equipment: "barbell", muscles: [p("side_delts"), s("upper_back"), s("biceps")] },
  { id: "cable-upright-row", nameAr: "سحب عمودي كيبل", nameEn: "Cable Upright Row", equipment: "cable", muscles: [p("side_delts"), s("upper_back"), s("biceps")] },

  // ──────────────────── REAR DELTS (shoulders) ────────────────────
  { id: "rear-delt-fly", nameAr: "رفرفة خلفي دامبل", nameEn: "Dumbbell Rear Delt Fly", equipment: "dumbbell", muscles: [p("rear_delts"), s("upper_back")] },
  { id: "reverse-pec-deck", nameAr: "رفرفة خلفي جهاز", nameEn: "Reverse Pec Deck", equipment: "machine", muscles: [p("rear_delts"), s("upper_back")] },
  { id: "face-pull", nameAr: "فيس بول كيبل", nameEn: "Cable Face Pull", equipment: "cable", muscles: [p("rear_delts"), s("upper_back")] },
  { id: "band-face-pull", nameAr: "فيس بول باستيك", nameEn: "Band Face Pull", equipment: "band", muscles: [p("rear_delts"), s("upper_back")] },

  // ─────────────────────────── BICEPS ───────────────────────────
  { id: "barbell-curl", nameAr: "بايسبس بار مستقيم", nameEn: "Barbell Curl", equipment: "barbell", muscles: [p("biceps"), s("forearms")] },
  { id: "ez-bar-curl", nameAr: "بايسبس بار متعرج", nameEn: "EZ-Bar Curl", equipment: "barbell", muscles: [p("biceps"), s("forearms")] },
  { id: "dumbbell-curl", nameAr: "بايسبس دامبل", nameEn: "Dumbbell Curl", equipment: "dumbbell", muscles: [p("biceps"), s("forearms")] },
  { id: "hammer-curl", nameAr: "بايسبس مطرقة", nameEn: "Hammer Curl", equipment: "dumbbell", muscles: [p("biceps"), s("forearms")] },
  { id: "incline-dumbbell-curl", nameAr: "بايسبس دامبل مايل", nameEn: "Incline Dumbbell Curl", equipment: "dumbbell", muscles: [p("biceps")] },
  { id: "concentration-curl", nameAr: "بايسبس تركيز", nameEn: "Concentration Curl", equipment: "dumbbell", muscles: [p("biceps")] },
  { id: "spider-curl", nameAr: "بايسبس سبايدر", nameEn: "Spider Curl", equipment: "dumbbell", muscles: [p("biceps")] },
  { id: "zottman-curl", nameAr: "بايسبس زوتمان", nameEn: "Zottman Curl", equipment: "dumbbell", muscles: [p("biceps"), s("forearms")] },
  { id: "preacher-curl-machine", nameAr: "بايسبس جهاز (لاري)", nameEn: "Preacher Curl Machine", equipment: "machine", muscles: [p("biceps"), s("forearms")] },
  { id: "cable-curl", nameAr: "بايسبس كيبل", nameEn: "Cable Curl", equipment: "cable", muscles: [p("biceps"), s("forearms")] },
  { id: "rope-hammer-curl", nameAr: "بايسبس كيبل بالحبل (مطرقة)", nameEn: "Rope Hammer Curl", equipment: "cable", muscles: [p("biceps"), s("forearms")] },
  { id: "chin-up", nameAr: "عقلة بقبضة عكسية (تشين أب)", nameEn: "Chin-Up", equipment: "bodyweight", muscles: [p("biceps"), s("lats"), s("upper_back")] },
  { id: "band-curl", nameAr: "بايسبس باستيك", nameEn: "Band Curl", equipment: "band", muscles: [p("biceps"), s("forearms")] },

  // ─────────────────────────── FOREARMS ───────────────────────────
  { id: "barbell-wrist-curl", nameAr: "لي ساعد بالبار", nameEn: "Barbell Wrist Curl", equipment: "barbell", muscles: [p("forearms")] },
  { id: "reverse-wrist-curl", nameAr: "لي ساعد معاكس", nameEn: "Reverse Wrist Curl", equipment: "barbell", muscles: [p("forearms")] },
  { id: "reverse-grip-curl", nameAr: "بايسبس بقبضة عكسية", nameEn: "Reverse-Grip Curl", equipment: "barbell", muscles: [p("forearms"), s("biceps")] },
  { id: "farmers-walk", nameAr: "مشية المزارع", nameEn: "Farmer's Walk", equipment: "dumbbell", muscles: [p("forearms"), s("upper_back"), s("abs")] },
  { id: "dead-hang", nameAr: "التعليق على البار", nameEn: "Dead Hang", equipment: "bodyweight", muscles: [p("forearms"), s("lats")] },
  { id: "wrist-roller", nameAr: "رولر الساعد", nameEn: "Wrist Roller", equipment: "other", muscles: [p("forearms")] },

  // ─────────────────────────── TRICEPS ───────────────────────────
  { id: "triceps-pushdown", nameAr: "دفع ترايسبس كيبل", nameEn: "Cable Triceps Pushdown", equipment: "cable", muscles: [p("triceps")] },
  { id: "rope-triceps-pushdown", nameAr: "دفع ترايسبس كيبل بالحبل", nameEn: "Rope Triceps Pushdown", equipment: "cable", muscles: [p("triceps")] },
  { id: "single-arm-cable-pushdown", nameAr: "دفع ترايسبس كيبل بيد واحدة", nameEn: "Single-Arm Cable Pushdown", equipment: "cable", muscles: [p("triceps")] },
  { id: "overhead-cable-extension", nameAr: "ترايسبس كيبل من فوق الرأس", nameEn: "Overhead Cable Extension", equipment: "cable", muscles: [p("triceps")] },
  { id: "skull-crusher", nameAr: "ترايسبس نايم بالبار", nameEn: "Skull Crusher", equipment: "barbell", muscles: [p("triceps")] },
  { id: "french-press", nameAr: "ترايسبس بالبار جالس (فرينش)", nameEn: "Seated French Press", equipment: "barbell", muscles: [p("triceps")] },
  { id: "dumbbell-overhead-extension", nameAr: "ترايسبس دامبل من فوق", nameEn: "Dumbbell Overhead Extension", equipment: "dumbbell", muscles: [p("triceps")] },
  { id: "dumbbell-kickback", nameAr: "ترايسبس كيك بالدامبل", nameEn: "Dumbbell Kickback", equipment: "dumbbell", muscles: [p("triceps")] },
  { id: "close-grip-bench-press", nameAr: "ضغط بنش بقبضة ضيقة", nameEn: "Close-Grip Bench Press", equipment: "barbell", muscles: [p("triceps"), s("chest"), s("front_delts")] },
  { id: "diamond-pushup", nameAr: "ضغط أرضي دياموند", nameEn: "Diamond Push-Up", equipment: "bodyweight", muscles: [p("triceps"), s("chest")] },
  { id: "triceps-dip", nameAr: "متوازي رأسي للترايسبس", nameEn: "Triceps Dip", equipment: "bodyweight", muscles: [p("triceps"), s("chest"), s("front_delts")] },
  { id: "bench-dip", nameAr: "ترايسبس على البنش", nameEn: "Bench Dip", equipment: "bodyweight", muscles: [p("triceps"), s("front_delts")] },
  { id: "band-pushdown", nameAr: "دفع ترايسبس باستيك", nameEn: "Band Pushdown", equipment: "band", muscles: [p("triceps")] },

  // ─────────────────────────── UPPER BACK ───────────────────────────
  { id: "barbell-row", nameAr: "سحب أرضي بالبار", nameEn: "Barbell Row", equipment: "barbell", muscles: [p("upper_back"), s("lats"), s("biceps"), s("rear_delts")] },
  { id: "bent-over-dumbbell-row", nameAr: "سحب أرضي دامبل", nameEn: "Bent-Over Dumbbell Row", equipment: "dumbbell", muscles: [p("upper_back"), s("lats"), s("biceps")] },
  { id: "t-bar-row", nameAr: "سحب تي بار", nameEn: "T-Bar Row", equipment: "barbell", muscles: [p("upper_back"), s("lats"), s("biceps")] },
  { id: "seated-cable-row", nameAr: "سحب أرضي كيبل جالس", nameEn: "Seated Cable Row", equipment: "cable", muscles: [p("upper_back"), s("lats"), s("biceps")] },
  { id: "machine-row", nameAr: "سحب أرضي جهاز", nameEn: "Machine Row", equipment: "machine", muscles: [p("upper_back"), s("lats"), s("biceps")] },
  { id: "kettlebell-row", nameAr: "سحب أرضي كيتل بل بيد واحدة", nameEn: "Kettlebell One-Arm Row", equipment: "kettlebell", muscles: [p("upper_back"), s("lats"), s("biceps")] },
  { id: "inverted-row", nameAr: "سحب معاكس (أسترالي)", nameEn: "Inverted Row", equipment: "bodyweight", muscles: [p("upper_back"), s("lats"), s("biceps"), s("rear_delts")] },
  { id: "barbell-shrug", nameAr: "ترابيس بالبار", nameEn: "Barbell Shrug", equipment: "barbell", muscles: [p("upper_back")] },
  { id: "dumbbell-shrug", nameAr: "ترابيس دامبل", nameEn: "Dumbbell Shrug", equipment: "dumbbell", muscles: [p("upper_back")] },
  { id: "band-row", nameAr: "سحب أرضي باستيك", nameEn: "Band Row", equipment: "band", muscles: [p("upper_back"), s("lats"), s("biceps")] },

  // ─────────────────────────── LATS ───────────────────────────
  { id: "pull-up", nameAr: "عقلة واسعة (بول أب)", nameEn: "Pull-Up", equipment: "bodyweight", muscles: [p("lats"), s("upper_back"), s("biceps")] },
  { id: "wide-grip-lat-pulldown", nameAr: "سحب أمامي واسع", nameEn: "Wide-Grip Lat Pulldown", equipment: "cable", muscles: [p("lats"), s("upper_back"), s("biceps")] },
  { id: "close-grip-lat-pulldown", nameAr: "سحب أمامي ضيق", nameEn: "Close-Grip Lat Pulldown", equipment: "cable", muscles: [p("lats"), s("biceps"), s("upper_back")] },
  { id: "straight-arm-pulldown", nameAr: "سحب أمامي بأذرع ممدودة", nameEn: "Straight-Arm Pulldown", equipment: "cable", muscles: [p("lats")] },
  { id: "dumbbell-pullover", nameAr: "بول أوفر دامبل", nameEn: "Dumbbell Pullover", equipment: "dumbbell", muscles: [p("lats"), s("chest")] },
  { id: "cable-pullover", nameAr: "بول أوفر كيبل", nameEn: "Cable Pullover", equipment: "cable", muscles: [p("lats"), s("triceps")] },
  { id: "one-arm-dumbbell-row", nameAr: "سحب أرضي دامبل بيد واحدة", nameEn: "One-Arm Dumbbell Row", equipment: "dumbbell", muscles: [p("lats"), s("upper_back"), s("biceps")] },
  { id: "assisted-pull-up", nameAr: "عقلة جهاز بمساعدة", nameEn: "Assisted Pull-Up Machine", equipment: "machine", muscles: [p("lats"), s("biceps"), s("upper_back")] },
  { id: "band-lat-pulldown", nameAr: "سحب أمامي باستيك", nameEn: "Band Lat Pulldown", equipment: "band", muscles: [p("lats"), s("biceps"), s("upper_back")] },

  // ─────────────────────────── LOWER BACK ───────────────────────────
  { id: "deadlift", nameAr: "الرفعة الميتة (ديدلفت)", nameEn: "Deadlift", equipment: "barbell", muscles: [p("lower_back"), s("glutes"), s("hamstrings"), s("upper_back"), s("forearms")] },
  { id: "good-morning", nameAr: "جود مورنينج", nameEn: "Good Morning", equipment: "barbell", muscles: [p("lower_back"), s("hamstrings"), s("glutes")] },
  { id: "back-extension", nameAr: "تمرين أسفل الظهر (هايبر)", nameEn: "Back Extension", equipment: "machine", muscles: [p("lower_back"), s("glutes"), s("hamstrings")] },
  { id: "superman", nameAr: "سوبرمان", nameEn: "Superman", equipment: "bodyweight", muscles: [p("lower_back"), s("glutes")] },
  { id: "band-good-morning", nameAr: "جود مورنينج باستيك", nameEn: "Band Good Morning", equipment: "band", muscles: [p("lower_back"), s("hamstrings"), s("glutes")] },

  // ─────────────────────────── GLUTES ───────────────────────────
  { id: "sumo-deadlift", nameAr: "ديدلفت سومو", nameEn: "Sumo Deadlift", equipment: "barbell", muscles: [p("glutes"), s("hamstrings"), s("lower_back"), s("quads")] },
  { id: "hip-thrust", nameAr: "دفع أرداف بالبار (هيب ثراست)", nameEn: "Barbell Hip Thrust", equipment: "barbell", muscles: [p("glutes"), s("hamstrings")] },
  { id: "barbell-glute-bridge", nameAr: "جسر الأرداف بالبار", nameEn: "Barbell Glute Bridge", equipment: "barbell", muscles: [p("glutes"), s("hamstrings")] },
  { id: "glute-bridge", nameAr: "جسر الأرداف", nameEn: "Glute Bridge", equipment: "bodyweight", muscles: [p("glutes"), s("hamstrings")] },
  { id: "single-leg-glute-bridge", nameAr: "جسر أرداف بقدم واحدة", nameEn: "Single-Leg Glute Bridge", equipment: "bodyweight", muscles: [p("glutes"), s("hamstrings")] },
  { id: "cable-glute-kickback", nameAr: "كيك باك أرداف كيبل", nameEn: "Cable Glute Kickback", equipment: "cable", muscles: [p("glutes"), s("hamstrings")] },
  { id: "cable-pull-through", nameAr: "سحب كيبل من بين الرجلين", nameEn: "Cable Pull-Through", equipment: "cable", muscles: [p("glutes"), s("hamstrings")] },
  { id: "hip-abduction-machine", nameAr: "جهاز تبعيد الأرجل", nameEn: "Hip Abduction Machine", equipment: "machine", muscles: [p("glutes")] },
  { id: "band-lateral-walk", nameAr: "مشية جانبية باستيك", nameEn: "Band Lateral Walk", equipment: "band", muscles: [p("glutes")] },
  { id: "kettlebell-swing", nameAr: "أرجحة كيتل بل", nameEn: "Kettlebell Swing", equipment: "kettlebell", muscles: [p("glutes"), s("hamstrings"), s("lower_back"), s("abs")] },
  { id: "sumo-dumbbell-squat", nameAr: "سكوات سومو بالدامبل", nameEn: "Sumo Squat (Dumbbell)", equipment: "dumbbell", muscles: [p("glutes"), s("quads"), s("hamstrings")] },

  // ─────────────────────────── QUADS ───────────────────────────
  { id: "back-squat", nameAr: "سكوات خلفي بالبار", nameEn: "Back Squat", equipment: "barbell", muscles: [p("quads"), s("glutes"), s("hamstrings"), s("lower_back")] },
  { id: "front-squat", nameAr: "سكوات أمامي", nameEn: "Front Squat", equipment: "barbell", muscles: [p("quads"), s("glutes"), s("abs"), s("lower_back")] },
  { id: "smith-machine-squat", nameAr: "سكوات جهاز سميث", nameEn: "Smith Machine Squat", equipment: "machine", muscles: [p("quads"), s("glutes")] },
  { id: "goblet-squat", nameAr: "سكوات جوبلت بالكيتل", nameEn: "Goblet Squat", equipment: "kettlebell", muscles: [p("quads"), s("glutes"), s("abs")] },
  { id: "bulgarian-split-squat", nameAr: "سكوات بلغاري", nameEn: "Bulgarian Split Squat", equipment: "dumbbell", muscles: [p("quads"), s("glutes"), s("hamstrings")] },
  { id: "walking-lunge", nameAr: "طعن بالدامبل ماشي", nameEn: "Walking Lunge", equipment: "dumbbell", muscles: [p("quads"), s("glutes"), s("hamstrings")] },
  { id: "reverse-lunge", nameAr: "طعن للخلف", nameEn: "Reverse Lunge", equipment: "dumbbell", muscles: [p("quads"), s("glutes")] },
  { id: "step-up", nameAr: "الصعود على البنش", nameEn: "Step-Up", equipment: "bodyweight", muscles: [p("quads"), s("glutes")] },
  { id: "bodyweight-squat", nameAr: "سكوات حر", nameEn: "Bodyweight Squat", equipment: "bodyweight", muscles: [p("quads"), s("glutes")] },
  { id: "jump-squat", nameAr: "سكوات بالقفز", nameEn: "Jump Squat", equipment: "bodyweight", muscles: [p("quads"), s("glutes"), s("calves")] },
  { id: "pistol-squat", nameAr: "سكوات بقدم واحدة (بيستول)", nameEn: "Pistol Squat", equipment: "bodyweight", muscles: [p("quads"), s("glutes"), s("hamstrings")] },
  { id: "sissy-squat", nameAr: "سيسي سكوات", nameEn: "Sissy Squat", equipment: "bodyweight", muscles: [p("quads")] },
  { id: "wall-sit", nameAr: "الجلوس على الحائط", nameEn: "Wall Sit", equipment: "bodyweight", muscles: [p("quads")] },
  { id: "leg-press", nameAr: "ضغط أرجل جهاز (ليج برس)", nameEn: "Leg Press", equipment: "machine", muscles: [p("quads"), s("glutes")] },
  { id: "hack-squat", nameAr: "هاك سكوات جهاز", nameEn: "Hack Squat", equipment: "machine", muscles: [p("quads"), s("glutes")] },
  { id: "leg-extension", nameAr: "فرد الفخذ الأمامي جهاز", nameEn: "Leg Extension", equipment: "machine", muscles: [p("quads")] },
  { id: "band-squat", nameAr: "سكوات باستيك", nameEn: "Band Squat", equipment: "band", muscles: [p("quads"), s("glutes")] },
  { id: "band-knee-extension", nameAr: "فرد الركبة باستيك", nameEn: "Band Knee Extension", equipment: "band", muscles: [p("quads")] },
  { id: "burpees", nameAr: "بيربي", nameEn: "Burpees", equipment: "bodyweight", muscles: [p("quads"), s("chest"), s("abs"), s("front_delts")] },

  // ─────────────────────────── HAMSTRINGS ───────────────────────────
  { id: "romanian-deadlift", nameAr: "رفعة رومانية", nameEn: "Romanian Deadlift", equipment: "barbell", muscles: [p("hamstrings"), s("glutes"), s("lower_back")] },
  { id: "stiff-leg-deadlift", nameAr: "رفعة ميتة بأرجل ممدودة", nameEn: "Stiff-Leg Deadlift", equipment: "barbell", muscles: [p("hamstrings"), s("lower_back"), s("glutes")] },
  { id: "dumbbell-romanian-deadlift", nameAr: "رفعة رومانية دامبل", nameEn: "Dumbbell Romanian Deadlift", equipment: "dumbbell", muscles: [p("hamstrings"), s("glutes"), s("lower_back")] },
  { id: "single-leg-romanian-deadlift", nameAr: "رفعة رومانية بقدم واحدة", nameEn: "Single-Leg Romanian Deadlift", equipment: "dumbbell", muscles: [p("hamstrings"), s("glutes"), s("lower_back")] },
  { id: "kettlebell-deadlift", nameAr: "رفعة ميتة بالكيتل بل", nameEn: "Kettlebell Deadlift", equipment: "kettlebell", muscles: [p("hamstrings"), s("glutes"), s("lower_back"), s("quads")] },
  { id: "lying-leg-curl", nameAr: "ثني الفخذ الخلفي نايم", nameEn: "Lying Leg Curl", equipment: "machine", muscles: [p("hamstrings")] },
  { id: "seated-leg-curl", nameAr: "ثني الفخذ الخلفي جالس", nameEn: "Seated Leg Curl", equipment: "machine", muscles: [p("hamstrings")] },
  { id: "nordic-curl", nameAr: "نورديك كيرل", nameEn: "Nordic Curl", equipment: "bodyweight", muscles: [p("hamstrings")] },
  { id: "glute-ham-raise", nameAr: "جهاز جي إتش آر", nameEn: "Glute-Ham Raise", equipment: "machine", muscles: [p("hamstrings"), s("glutes"), s("lower_back")] },
  { id: "band-leg-curl", nameAr: "ثني الفخذ الخلفي باستيك", nameEn: "Band Leg Curl", equipment: "band", muscles: [p("hamstrings")] },
  { id: "stability-ball-leg-curl", nameAr: "ثني الفخذ الخلفي بالكرة السويسرية", nameEn: "Stability Ball Leg Curl", equipment: "other", muscles: [p("hamstrings"), s("glutes")] },

  // ─────────────────────────── CALVES ───────────────────────────
  { id: "standing-calf-raise", nameAr: "سمانة واقف جهاز", nameEn: "Standing Calf Raise", equipment: "machine", muscles: [p("calves")] },
  { id: "seated-calf-raise", nameAr: "سمانة جالس جهاز", nameEn: "Seated Calf Raise", equipment: "machine", muscles: [p("calves")] },
  { id: "barbell-calf-raise", nameAr: "سمانة بالبار", nameEn: "Barbell Calf Raise", equipment: "barbell", muscles: [p("calves")] },
  { id: "dumbbell-single-leg-calf-raise", nameAr: "سمانة بقدم واحدة دامبل", nameEn: "Single-Leg Calf Raise", equipment: "dumbbell", muscles: [p("calves")] },
  { id: "donkey-calf-raise", nameAr: "سمانة دونكي", nameEn: "Donkey Calf Raise", equipment: "machine", muscles: [p("calves")] },
  { id: "leg-press-calf-raise", nameAr: "سمانة على جهاز الليج برس", nameEn: "Leg Press Calf Raise", equipment: "machine", muscles: [p("calves")] },
  { id: "stair-edge-calf-raise", nameAr: "سمانة على حافة درجة", nameEn: "Stair-Edge Calf Raise", equipment: "bodyweight", muscles: [p("calves")] },

  // ─────────────────────────── ABS / CORE ───────────────────────────
  { id: "plank", nameAr: "بلانك", nameEn: "Plank", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "side-plank", nameAr: "بلانك جانبي", nameEn: "Side Plank", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "crunch", nameAr: "كرنش أرضي", nameEn: "Crunch", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "decline-sit-up", nameAr: "جلدة على بنش مايل", nameEn: "Decline Sit-Up", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "bicycle-crunch", nameAr: "كرنش الدراجة", nameEn: "Bicycle Crunch", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "reverse-crunch", nameAr: "كرنش معكوس", nameEn: "Reverse Crunch", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "lying-leg-raise", nameAr: "رفع الأرجل أرضًا", nameEn: "Lying Leg Raise", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "hanging-leg-raise", nameAr: "رفع الأرجل معلقًا", nameEn: "Hanging Leg Raise", equipment: "bodyweight", muscles: [p("abs"), s("forearms")] },
  { id: "hanging-knee-raise", nameAr: "رفع الركبتين معلقًا", nameEn: "Hanging Knee Raise", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "toes-to-bar", nameAr: "لمس البار بالأرجل", nameEn: "Toes-to-Bar", equipment: "bodyweight", muscles: [p("abs"), s("forearms")] },
  { id: "v-up", nameAr: "في أب", nameEn: "V-Up", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "russian-twist", nameAr: "تويست روسي", nameEn: "Russian Twist", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "dead-bug", nameAr: "ديد باج", nameEn: "Dead Bug", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "mountain-climbers", nameAr: "متسلق الجبال", nameEn: "Mountain Climbers", equipment: "bodyweight", muscles: [p("abs"), s("front_delts"), s("quads")] },
  { id: "scissors", nameAr: "مقص أرضي", nameEn: "Scissors", equipment: "bodyweight", muscles: [p("abs")] },
  { id: "ab-wheel-rollout", nameAr: "عجلة البطن", nameEn: "Ab Wheel Rollout", equipment: "other", muscles: [p("abs"), s("lats")] },
  { id: "cable-crunch", nameAr: "كرنش كيبل واقف", nameEn: "Cable Crunch", equipment: "cable", muscles: [p("abs")] },
  { id: "machine-crunch", nameAr: "جهاز البطن", nameEn: "Machine Crunch", equipment: "machine", muscles: [p("abs")] },
  { id: "dumbbell-side-bend", nameAr: "ميل جانبي بالدامبل", nameEn: "Dumbbell Side Bend", equipment: "dumbbell", muscles: [p("abs")] },
  { id: "band-pallof-press", nameAr: "بالوف برس باستيك", nameEn: "Band Pallof Press", equipment: "band", muscles: [p("abs")] },
];
