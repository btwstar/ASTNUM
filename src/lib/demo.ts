/**
 * ASTNUM — realistic demo dataset (pure, isomorphic).
 *
 * Generates a believable ~14 weeks of history for a 28-year-old Egyptian
 * user cutting from 82kg to ~78.5kg on a Push/Pull/Legs+Upper rotation.
 * Pure functions ONLY — no Prisma, no fetch. Consumers:
 *   - web:  src/app/api/demo/[seed|clear]/route.ts (inserts via Prisma)
 *   - APK : src/lib/local-api (inserts into localStorage tables)
 *
 * All generated rows carry `demo:`-prefixed ids so seeding is idempotent
 * (re-seed wipes previous demo rows first) and demo data can never be
 * confused with real user rows.
 */

/* ── tiny deterministic RNG (mulberry32) ─────────────────────── */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── local date helpers (no TZ drift: pure calendar math) ────── */
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, days: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + days);
  return c;
}
function isoAt(d: Date, h: number, min: number): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0, 0);
  return c.toISOString();
}

export const DEMO_ID_PREFIX = "demo:";

/* ── row types (mirror prisma models; kept local & structural) ── */
export interface DemoHabit {
  id: string; name: string; icon: string; color: string; scheduleJson: string;
  gymTemplateId: string | null;
  reminderTime: string | null; note: string | null; sortOrder: number;
  archived: boolean; deletedAt: string | null; createdAt: string; updatedAt: string;
}
export interface DemoHabitLog { id: string; habitId: string; date: string; done: boolean; updatedAt: string }
export interface DemoFreeze { id: string; habitId: string; date: string; updatedAt: string }
export interface DemoTask {
  id: string; noteId: string | null; title: string; dueAt: string | null; priority: number;
  done: boolean; doneAt: string | null; repeatRule: string; sortOrder: number;
  deletedAt: string | null; createdAt: string; updatedAt: string;
}
export interface DemoNote {
  id: string; title: string; body: string; pinned: boolean; archived: boolean;
  deletedAt: string | null; image: string | null; imageThumb: string | null;
  createdAt: string; updatedAt: string;
}
export interface DemoTag { id: string; name: string; updatedAt: string }
export interface DemoNoteTag { noteId: string; tagId: string }
export interface DemoWorkout {
  id: string; date: string; templateId: string | null; name: string | null;
  durationSec: number; notes: string | null;
  /** v1.17 smart-session columns (mirrored on the local WorkoutRow) */
  deferredJson: string | null; carryJson: string | null;
  completedAt: string | null;
  deletedAt: string | null; createdAt: string; updatedAt: string;
}
export interface DemoSet {
  id: string; workoutId: string; exerciseId: string; setType: string;
  reps: number; weight: number; rpe: number | null; isPr: boolean;
  createdAt: string; updatedAt: string;
}
export interface DemoMeasurement {
  id: string; date: string; weight: number | null; bodyFatPct: number | null;
  muscleMass: number | null; water: number | null; visceralFat: number | null;
  notes: string | null; createdAt: string; updatedAt: string;
}
export interface DemoCircumference { id: string; date: string; part: string; valueCm: number; updatedAt: string }
export interface DemoFoodLog {
  id: string; date: string; mealType: string; foodId: string | null; name: string;
  quantity: number; grams: number | null; kcal: number; protein: number; carbs: number; fat: number; updatedAt: string;
}
export interface DemoWaterLog {
  id: string; date: string; drink: string; name: string; amountMl: number; updatedAt: string;
}
export interface DemoGoals {
  id: string; date: string; kcal: number; protein: number; carbs: number; fat: number;
  waterMl: number; formulaMeta: string; updatedAt: string;
}

export interface DemoData {
  habits: DemoHabit[];
  habitLogs: DemoHabitLog[];
  freezes: DemoFreeze[];
  tasks: DemoTask[];
  notes: DemoNote[];
  tags: DemoTag[];
  noteTags: DemoNoteTag[];
  workouts: DemoWorkout[];
  sets: DemoSet[];
  measurements: DemoMeasurement[];
  circumferences: DemoCircumference[];
  foodLogs: DemoFoodLog[];
  waterLogs: DemoWaterLog[];
  goals: DemoGoals | null;
}

/* ── generator ───────────────────────────────────────────────── */

/** Template rotation + per-exercise working weights (kg) with slow progression. */
const TEMPLATES: Array<{
  tpl: string; name: string;
  ex: Array<{ id: string; base: number; inc: number; reps: number[]; sets: number }>;
}> = [
  {
    tpl: "tpl-push", name: "يوم دفع | Push Day",
    ex: [
      { id: "bench-press", base: 70, inc: 1.25, reps: [8, 8, 7, 6], sets: 4 },
      { id: "incline-dumbbell-press", base: 24, inc: 0.75, reps: [10, 10, 9], sets: 3 },
      { id: "cable-crossover", base: 17.5, inc: 0.5, reps: [12, 12, 11], sets: 3 },
      { id: "overhead-press", base: 42.5, inc: 0.75, reps: [10, 9, 8], sets: 3 },
      { id: "lateral-raise", base: 10, inc: 0.35, reps: [12, 12, 11], sets: 3 },
      { id: "triceps-pushdown", base: 27.5, inc: 0.5, reps: [12, 11, 11], sets: 3 },
    ],
  },
  {
    tpl: "tpl-pull", name: "يوم سحب | Pull Day",
    ex: [
      { id: "pull-up", base: 0, inc: 0, reps: [9, 8, 7, 6], sets: 4 },
      { id: "wide-grip-lat-pulldown", base: 55, inc: 0.9, reps: [10, 10, 9], sets: 3 },
      { id: "seated-cable-row", base: 60, inc: 1, reps: [10, 10, 9], sets: 3 },
      { id: "one-arm-dumbbell-row", base: 28, inc: 0.6, reps: [12, 11, 10], sets: 3 },
      { id: "face-pull", base: 17.5, inc: 0.35, reps: [12, 12, 12], sets: 3 },
      { id: "barbell-curl", base: 32.5, inc: 0.5, reps: [10, 9, 9], sets: 3 },
    ],
  },
  {
    tpl: "tpl-legs", name: "يوم أرجل | Legs Day",
    ex: [
      { id: "back-squat", base: 95, inc: 1.5, reps: [8, 8, 7, 6], sets: 4 },
      { id: "leg-press", base: 170, inc: 2.5, reps: [10, 10, 9], sets: 3 },
      { id: "romanian-deadlift", base: 90, inc: 1.25, reps: [10, 10, 9], sets: 3 },
      { id: "walking-lunge", base: 16, inc: 0.5, reps: [12, 12, 11], sets: 3 },
      { id: "leg-extension", base: 45, inc: 0.75, reps: [12, 12, 12], sets: 3 },
      { id: "lying-leg-curl", base: 35, inc: 0.5, reps: [12, 11, 10], sets: 3 },
      { id: "standing-calf-raise", base: 60, inc: 1, reps: [12, 12, 11, 10], sets: 4 },
    ],
  },
  {
    tpl: "tpl-upper", name: "يوم علوي | Upper Day",
    ex: [
      { id: "bench-press", base: 67.5, inc: 1, reps: [8, 8, 8], sets: 3 },
      { id: "seated-cable-row", base: 57.5, inc: 0.9, reps: [10, 10, 10], sets: 3 },
      { id: "overhead-press", base: 40, inc: 0.6, reps: [10, 9, 9], sets: 3 },
      { id: "wide-grip-lat-pulldown", base: 52.5, inc: 0.8, reps: [10, 10, 9], sets: 3 },
      { id: "incline-dumbbell-press", base: 22, inc: 0.5, reps: [10, 10, 9], sets: 3 },
      { id: "hammer-curl", base: 14, inc: 0.4, reps: [12, 12, 11], sets: 3 },
    ],
  },
];

export function buildDemoData(now = new Date()): DemoData {
  const r = rng(20261020);
  const uid = (k: string) => `${DEMO_ID_PREFIX}${k}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowIso = now.toISOString();

  /* habits — 5, daily schedules, believable completion */
  const habitDefs = [
    { key: "water", name: "شرب ٨ أكواب ماء", icon: "lucide:Droplets", color: "#22d3ee", rate: 0.9, streak: 23 },
    { key: "read", name: "قراءة ٢٠ دقيقة", icon: "lucide:BookOpen", color: "#a3e635", rate: 0.74, streak: 4 },
    { key: "gym", name: "الالتزام بالتمرين", icon: "lucide:Dumbbell", color: "#34d399", rate: 0.86, streak: 6 },
    { key: "sleep", name: "النوم قبل ١١", icon: "lucide:Moon", color: "#c084fc", rate: 0.62, streak: 2 },
    { key: "walk", name: "مشي ٦٠٠٠ خطوة", icon: "lucide:Footprints", color: "#fbbf24", rate: 0.8, streak: 11 },
  ];

  const habits: DemoHabit[] = [];
  const habitLogs: DemoHabitLog[] = [];
  const freezes: DemoFreeze[] = [];

  habitDefs.forEach((h, idx) => {
    const hid = uid(`habit-${h.key}`);
    habits.push({
      id: hid, name: h.name, icon: h.icon, color: h.color,
      scheduleJson: JSON.stringify({ type: "daily" }),
      gymTemplateId: null,
      reminderTime: h.key === "sleep" ? "21:30" : h.key === "water" ? "10:00" : null,
      note: null, sortOrder: idx, archived: false, deletedAt: null,
      createdAt: isoAt(addDays(today, -98), 9, 0), updatedAt: nowIso,
    });

    for (let back = 97; back >= 0; back--) {
      const d = addDays(today, -back);
      // enforce a live current streak: last `streak` days always done
      const mustDone = back < h.streak;
      const done = mustDone || r() < h.rate + Math.sin(back / 9) * 0.06;
      if (done) {
        habitLogs.push({
          id: uid(`log-${h.key}-${toKey(d)}`), habitId: hid, date: toKey(d),
          done: true, updatedAt: isoAt(d, 21, 12),
        });
      }
    }
  });
  // one freeze this month on the reading habit (protects a missed day 9 days ago)
  const freezeDay = addDays(today, -9);
  freezes.push({
    id: uid(`frz-read-${toKey(freezeDay)}`), habitId: uid("habit-read"),
    date: toKey(freezeDay), updatedAt: isoAt(freezeDay, 22, 0),
  });

  /* tasks */
  const tasks: DemoTask[] = [];
  const taskDefs: Array<[string, number, number | null, number, string]> = [
    // [title, priority(0=high), dueOffsetDays|null, done(0|1), repeat]
    ["تسليم تقرير المشروع", 0, -1, 0, "none"],
    ["مكالمة مع العميل", 1, 0, 0, "none"],
    ["شراء طعام للأسبوع", 2, 0, 0, "none"],
    ["حجز موعد الجيم", 1, 1, 0, "none"],
    ["دفع فاتورة النت", 0, 2, 0, "none"],
    ["ترتيب المكتب", 3, null, 0, "none"],
    ["مراجعة أهداف الشهر", 1, null, 0, "{\"type\":\"monthly\",\"day\":1}"],
    ["قياس الوزن وتسجيله", 2, null, 1, "none"],
    ["تحضير وجبات الغد", 2, 0, 1, "none"],
    ["قراءة ١٠ صفحات", 3, 0, 1, "none"],
  ];
  taskDefs.forEach(([title, priority, dueOff, done, repeat], i) => {
    const due = dueOff === null ? null : isoAt(addDays(today, dueOff), 18, 0);
    tasks.push({
      id: uid(`task-${i}`), noteId: null, title, dueAt: due, priority,
      done: done === 1, doneAt: done ? isoAt(today, 11, 30 + i) : null,
      repeatRule: repeat.startsWith("{") ? repeat : `{"type":"${repeat}"}`,
      sortOrder: i, deletedAt: null,
      createdAt: isoAt(addDays(today, -20 + i), 12, 0), updatedAt: nowIso,
    });
  });

  /* notes + tags */
  const tags: DemoTag[] = [
    { id: uid("tag-work"), name: "عمل", updatedAt: nowIso },
    { id: uid("tag-gym"), name: "جيم", updatedAt: nowIso },
    { id: uid("tag-ideas"), name: "أفكار", updatedAt: nowIso },
    { id: uid("tag-recipes"), name: "وصفات", updatedAt: nowIso },
  ];
  const notes: DemoNote[] = [
    {
      id: uid("note-plan"),
      title: "خطة الشهر — ديسمبر",
      body:
        "# خطة الشهر\n\n**الهدف:** نزول ٢ كيلو مع الحفاظ على العضل.\n\n- [ ] ٤ تمرين أرجل في الشهر\n- [x] تفعيل التذكيرات\n- [ ] تجربة قالب Full Body\n\n> الغد: يوم دفع — التركيز على التصحيح في البنش.\n\n### وجبات\n1. فول + بيض الصبح\n2. فراخ وأرز بعد التمرين",
      pinned: true, archived: false, deletedAt: null, image: null, imageThumb: null,
      createdAt: isoAt(addDays(today, -12), 20, 15), updatedAt: isoAt(addDays(today, -2), 13, 40),
    },
    {
      id: uid("note-gym"),
      title: "ملاحظات بنش برس",
      body: "التصحيح المهم:\n- شد الكتف للخلف والصدر فوق\n- النزول ببطء ٣ ثواني\n- آخر مرة ٧٢.٥×٨ حسيت آخر عدتين صعبة\n\nنبدأ الأسبوع الجاي ٧٥ كيلو إن شاء الله.",
      pinned: false, archived: false, deletedAt: null, image: null, imageThumb: null,
      createdAt: isoAt(addDays(today, -6), 22, 5), updatedAt: isoAt(addDays(today, -6), 22, 9),
    },
    {
      id: uid("note-recipe"),
      title: "شوفرة: فراخ بالزبادي",
      body: "صدور فراخ + زبادي لايت + ليمون وثوم وكزبرة → ساعة في التلاجة ثم جريل ٧ دقائق لكل وش.\n\nالسعرات للوجبة: حوالي ٣٢٠ سعر.",
      pinned: false, archived: false, deletedAt: null, image: null, imageThumb: null,
      createdAt: isoAt(addDays(today, -30), 19, 0), updatedAt: isoAt(addDays(today, -30), 19, 2),
    },
    {
      id: uid("note-old"),
      title: "أرشيف: قائمة معدات الجيم",
      body: "قفازات، حزام، وشريط مقاومة. تم الشراء ✓",
      pinned: false, archived: true, deletedAt: null, image: null, imageThumb: null,
      createdAt: isoAt(addDays(today, -75), 10, 0), updatedAt: isoAt(addDays(today, -40), 10, 0),
    },
  ];
  const noteTags: DemoNoteTag[] = [
    { noteId: uid("note-plan"), tagId: uid("tag-work") },
    { noteId: uid("note-plan"), tagId: uid("tag-ideas") },
    { noteId: uid("note-gym"), tagId: uid("tag-gym") },
    { noteId: uid("note-recipe"), tagId: uid("tag-recipes") },
  ];

  /* workouts — 12 weeks, PPL + Upper ≈ 4 sessions/week, progressive */
  const workouts: DemoWorkout[] = [];
  const sets: DemoSet[] = [];
  const ROTATION = [TEMPLATES[0], TEMPLATES[1], TEMPLATES[2], TEMPLATES[3]]; // push, pull, legs, upper
  // day offsets (most recent first) — 47 sessions over ~84 days
  const sessionOffsets: number[] = [];
  let off = 84;
  while (off >= 1) {
    const gap = r() < 0.72 ? 1 : 2;
    off -= gap;
    if (off >= 1) sessionOffsets.push(off);
  }
  sessionOffsets.reverse(); // oldest first
  sessionOffsets.forEach((dayOff, i) => {
    const t = ROTATION[i % ROTATION.length];
    const date = addDays(today, -dayOff);
    const weekFloor = Math.floor(i / 4); // progression step
    const wid = uid(`wo-${toKey(date)}-${i}`);
    const startH = 18;
    workouts.push({
      id: wid, date: toKey(date), templateId: t.tpl, name: t.name,
      durationSec: 3900 + Math.floor(r() * 1500),
      notes: i === sessionOffsets.length - 1 ? "جلسة قوية — البنش تحسن عن الأسبوع الفائت." : null,
      deferredJson: null, carryJson: null,
      completedAt: isoAt(date, startH + 1, 35), deletedAt: null,
      createdAt: isoAt(date, startH, 5), updatedAt: isoAt(date, startH + 1, 35),
    });
    t.ex.forEach((ex, ei) => {
      // last exercise of pull day sometimes skipped for time
      if (t.tpl === "tpl-pull" && ei >= 5 && r() < 0.4) return;
      const w = Math.round((ex.base + ex.inc * weekFloor) / 2.5) * 2.5;
      for (let s = 0; s < ex.sets; s++) {
        const reps = ex.reps[Math.min(s, ex.reps.length - 1)] - (r() < 0.25 ? 1 : 0);
        sets.push({
          id: uid(`set-${toKey(date)}-${ei}-${s}`), workoutId: wid, exerciseId: ex.id,
          setType: ei === 0 && s === 0 ? "warmup" : "work",
          reps: ei === 0 && s === 0 ? 12 : reps,
          weight: ei === 0 && s === 0 ? Math.round(w * 0.55) : w,
          rpe: r() < 0.35 ? 8.5 : null,
          isPr: false, // PRs are computed by the backend on insert (best-effort)
          createdAt: isoAt(date, startH, 10 + ei * 9 + s * 2), updatedAt: nowIso,
        });
      }
    });
  });

  /* measurements — 13 weekly InBody-style rows, cutting trend */
  const measurements: DemoMeasurement[] = [];
  const circumferences: DemoCircumference[] = [];
  const parts: Array<[string, number, number]> = [
    ["chest", 104, 102], ["waist", 93, 86.5], ["arm", 35, 36.4], ["thigh", 58, 57.2],
  ];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const frac = i / (N - 1);
    const date = addDays(today, -Math.round(84 * (1 - frac)));
    const jitter = (r() - 0.5) * 0.35;
    const weight = +(82.4 - 3.9 * frac + jitter).toFixed(1);
    measurements.push({
      id: uid(`bm-${toKey(date)}`), date: toKey(date), weight,
      bodyFatPct: +(18.6 - 2.1 * frac + (r() - 0.5) * 0.2).toFixed(1),
      muscleMass: +(39.9 + 1.2 * frac + (r() - 0.5) * 0.15).toFixed(1),
      water: +(54.5 + 1.5 * frac).toFixed(1),
      visceralFat: +(9 - 1.5 * frac).toFixed(0),
      notes: i === N - 1 ? "تحليل إن بدي — تحسن واضح في الدهون" : null,
      createdAt: isoAt(date, 8, 30), updatedAt: isoAt(date, 8, 31),
    });
    if (i % 2 === 0 || i === N - 1) {
      parts.forEach(([part, from, to]) => {
        circumferences.push({
          id: uid(`bc-${toKey(date)}-${part}`), date: toKey(date), part,
          valueCm: +(from + (to - from) * frac).toFixed(1), updatedAt: isoAt(date, 8, 32),
        });
      });
    }
  }

  /* nutrition — goals + today's meals (realistic Egyptian day) */
  const goals: DemoGoals = {
    id: uid("goals"), date: "1970-01-01",
    kcal: 2350, protein: 160, carbs: 265, fat: 70, waterMl: 2800,
    formulaMeta: JSON.stringify({
      formula: "mifflin", sex: "male", age: 28, heightCm: 176, weightKg: 78.5,
      activity: 1.55, goal: "cut", manual: false, waterAuto: true,
    }),
    updatedAt: nowIso,
  };

  const foodLogs: DemoFoodLog[] = [];
  // foodId references real seed slugs (nutrition module falls back to name display)
  const mealDefs: Array<[string, string, string | null, number, number, number, number, number]> = [
    // [meal, name, foodId, qty, kcal, P, C, F]
    ["breakfast", "فول مدمس (طبق)", "ful-medames", 1, 320, 19, 46, 5],
    ["breakfast", "رغيف عيش بلدي", "baladi-bread", 1, 150, 5, 30, 1],
    ["breakfast", "بيضة مسلوقة", "boiled-egg", 2, 78, 6.3, 0.6, 5.3],
    ["lunch", "صدر فراخ مشوي (120ج)", "chicken-breast-grilled", 2, 220, 46, 0, 5],
    ["lunch", "أرز أبيض مطبوخ (كوب)", "white-rice", 1, 205, 4.3, 45, 0.4],
    ["snack", "زبادي يوناني (كوب)", "greek-yogurt", 1, 130, 15, 6, 3],
    ["snack", "موزة (ثمرة)", "banana", 1, 105, 1.3, 27, 0.4],
  ];
  mealDefs.forEach(([meal, name, foodId, qty, kcal, p, c, f], i) => {
    foodLogs.push({
      id: uid(`fl-${i}`), date: toKey(today), mealType: meal,
      foodId, name, quantity: qty, grams: null,
      kcal: Math.round(kcal * qty), protein: +(p * qty).toFixed(1),
      carbs: +(c * qty).toFixed(1), fat: +(f * qty).toFixed(1),
      updatedAt: nowIso,
    });
  });

  /* hydration — today's realistic glass trail (2,000 of the 2,800 goal) */
  const waterLogs: DemoWaterLog[] = [];
  const drinkDefs: Array<[string, string, number, number]> = [
    // drink, name, time-of-day anchor, ml
    ["water", "ماء", 8, 250],
    ["water", "ماء", 10, 330],
    ["juice", "عصير برتقال", 12, 200],
    ["water", "ماء", 15, 500],
    ["other", "شاي", 17, 250],
    ["water", "ماء", 19, 470],
  ];
  drinkDefs.forEach(([drink, name, hour, ml], i) => {
    waterLogs.push({
      id: uid(`wl-${i}`),
      date: toKey(today),
      drink,
      name,
      amountMl: ml,
      updatedAt: new Date(today.getTime() + hour * 3_600_000).toISOString(),
    });
  });

  return {
    habits, habitLogs, freezes, tasks, notes, tags, noteTags,
    workouts, sets, measurements, circumferences, foodLogs, waterLogs, goals,
  };
}

/** Tables that must be wiped before (re)seeding demo data — shared contract. */
export const DEMO_TABLES = [
  "habitLogs", "freezes", "habits",
  "tasks", "noteTags", "tags", "notes",
  "sets", "workouts",
  "circumferences", "measurements",
  "foodLogs", "waterLogs",
] as const;
