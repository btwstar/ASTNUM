/**
 * ASTNUM Widgets — payload contract v2.1 (web → native).
 *
 * The web app builds ONE JSON snapshot of everything the 15 home-screen
 * widgets show and pushes it through the native AstnumWidgets Capacitor
 * plugin (Android SharedPreferences) after every data mutation + on app
 * start/resume. The native layer NEVER computes or formats anything:
 *
 *   • every number shown to the user arrives pre-formatted (locale digits,
 *     units, plurals, the Arabic ٪ sign) exactly as the app shows it;
 *   • raw ints (pct / barDone / barTotal / startedAtMs) are sent only to
 *     drive ProgressBar fills, the ring bitmaps and the session Chronometer;
 *   • heat.image is a pre-rendered PNG (base64, no data: prefix) of the
 *     app's own muscle heat figure — the widgets show the REAL map;
 *   • the native side renders a branded placeholder until the first
 *     payload lands (`empty: true` also covers the data-less state).
 *
 * This module is pure types — imported by the snapshot builder, the bridge
 * and (as documentation) by the native layer's WidgetState.java mirror.
 */

/** 1×1 macro ring (calories / carbs / protein / fat). */
export interface WidgetMacro {
  /** display name — "سعرات" | "كارب" | "بروتين" | "دهون" */
  name: string;
  /** ring fill, clamped 0..100 (the native painter clamps again) */
  pct: number;
  /** real percentage label even when over target — "٦٤٪" | "١٢٠٪" */
  pctLabel: string;
  /** "١٬٥٠٦ سعرة" | "١٥٥ جم" */
  valueLabel: string;
}

/** One meal row on the meals widget (the 4 fixed meals, always present). */
export interface WidgetMealItem {
  /** breakfast | lunch | dinner | snack */
  key: string;
  /** "فطور" */
  name: string;
  /** raw kcal — drives the row's muted/active state + share bar */
  kcal: number;
  /** "٤٢٠ سعرة" ("٠ سعرة" when empty) */
  kcalLabel: string;
  /** "بروتين ٢٤ جم" ("" when empty) */
  detailLabel: string;
  /** share of today's consumed kcal, 0..100 — drives the thin bar */
  pct: number;
}

export interface WidgetBar {
  /** progress fill (0..barTotal). Native clamps to [0, barTotal]. */
  barDone: number;
  /** progress max (≥ 1). */
  barTotal: number;
}

/** One habit row (habits list widget ≤4 rows; flip widget cycles ≤6). */
export interface WidgetHabitItem {
  id: string;
  /** display name, pre-truncated by the web side (≤ 22 chars) */
  name: string;
  done: boolean;
  /** streak count, formatted ("١٢") */
  streakLabel: string;
  hasStreak: boolean;
  /** flip widget position label, pre-formatted — "٢/٥" (list rows ignore it) */
  counterLabel: string;
}

/** One task row (tasks list widget ≤5 rows; flip widget cycles ≤6). */
export interface WidgetTaskItem {
  id: string;
  /** pre-truncated (≤ 26 chars) */
  title: string;
  done: boolean;
  overdue: boolean;
  /** flip widget position label, pre-formatted — "٢/٥" (list rows ignore it) */
  counterLabel: string;
}

/** The running gym session — powers the live active-session widget. */
export interface WidgetActiveWorkout {
  active: boolean;
  /** session/template display name */
  name: string;
  /** epoch ms — native converts to a Chronometer base (live ticking) */
  startedAtMs: number;
  /** "٨٤٠ كجم" */
  volumeLabel: string;
  /** first prescription exercise not fully done and not deferred */
  currentExercise: {
    id: string;
    name: string;
    setsDone: number;
    setsTarget: number;
    /** "٣ من ٤ مجموعة" */
    setsLabel: string;
  } | null;
  /** "التالي: ضغط صدر" ("" when it is the last one) */
  nextLabel: string;
}

/** One scheduled template row on the sessions widget. */
export interface WidgetSessionItem {
  templateId: string;
  name: string;
  /** "اليوم" | "غدًا" | short weekday */
  dayLabel: string;
  isToday: boolean;
  /** "٧ تمارين • ٢٢ مجموعة" */
  detail: string;
}

/** ONE pinned item rendered by a «عنصر مثبّت» widget instance. */
export interface WidgetPinItem {
  /** the Android appWidgetId this config belongs to (per-instance) */
  widgetId: number;
  type: "habit" | "session" | "note";
  /** habit id | template id | note id */
  id: string;
  /** display title, pre-truncated by the app */
  title: string;
  /** streak line / exercises+sets line / note body preview */
  line1: string;
  /** "تمت اليوم ✓" | "اليوم" | "آخر تحديث …" */
  line2: string;
  /** habit + session get a one-tap action button; notes don't */
  hasAction: boolean;
  /** "سجّل الآن" | "ابدأ الجلسة" ("" → hidden) */
  buttonLabel: string;
  /** habit: astnum://open?tab=habits&toggle=<id> — session: &start=<id> */
  actionUri: string;
  /** tap on the card body — opens the item's own screen */
  openUri: string;
}

/** One upcoming event row on the «الأحداث القادمة» widget. */
export interface WidgetEventItem {
  kind: "session" | "task";
  /** display title, pre-truncated by the app */
  title: string;
  /** "اليوم" | "غدًا" | "الإثنين ٢٧" — formatted in the app language */
  whenLabel: string;
  /** today's events render with the accent */
  isToday: boolean;
  /** tap target: session → gym tab / task → tasks segment */
  openUri: string;
}

/** One day cell of the «التقويم» month grid (42 = 6×7, Sunday-first). */
export interface WidgetCalendarCell {
  /** pre-formatted day-of-month in the app digits — "" when out of month */
  dayLabel: string;
  inMonth: boolean;
  isToday: boolean;
  /** a workout session is scheduled that day (template day assignment) */
  hasSession: boolean;
  /** a pending task is due that day */
  hasTask: boolean;
  /** at least one habit was completed that day */
  hasHabit: boolean;
  /** day tap → astnum://open?tab=today&cal=YYYY-MM-DD (opens the app's
   *  calendar sheet on that day). "" for out-of-month cells. */
  openUri: string;
}

/** v2.4 — hydration: powers the 1×1 water ring + the 2×1 drinks quick-add. */
export interface WidgetWater {
  /** "Water" | "الماء" */
  name: string;
  /** ring fill, clamped 0..100 (Σ all drinks vs the ml goal) */
  pct: number;
  /** "٦٤٪" | "64%" */
  pctLabel: string;
  /** "١٫٣ / ٢٫٧ لتر" | "1.3 / 2.7 L" — compact liters for the ring's value line */
  valueLabel: string;
  /** "١٬٢٥٠ من ٢٬٨٠٠ مل" — the drinks widget header (pre-composed, one string) */
  headerLabel: string;
  /** "تحقق الهدف 💧" — the drinks widget header line once goalDone */
  headerDone: string;
  /** goal reached — the drinks widget swaps the header for the 💧 line */
  goalDone: boolean;
  /** raw ints for the drinks widget's mini ProgressBar */
  bar: WidgetBar;
  /** "+٢٥٠ مل" — the three one-tap buttons, pre-formatted */
  plusWater: string;
  plusJuice: string;
  plusOther: string;
}

/** Widget snapshot, versioned. v2 shipped with APK 1.19 (13 widgets). */
export interface WidgetSnapshot {
  v: 2;
  lang: string;
  rtl: boolean;
  /** "الجمعة، ١٢ يناير" / "Fri, Jan 12" */
  dateLabel: string;
  /** last-push time, "٩:٤١ ص" */
  updatedAt: string;
  /** true → widgets render the "open ASTNUM" placeholder */
  empty: boolean;

  /** the four 1×1 macro rings */
  macros: {
    calories: WidgetMacro;
    carb: WidgetMacro;
    protein: WidgetMacro;
    fat: WidgetMacro;
  };

  /** 4×2 meals list */
  meals: {
    has: boolean;
    items: WidgetMealItem[];
    /** "١٬٥٠٦ من ٢٬٣٥٠ سعرة" */
    totalLabel: string;
    /** "أضف أول وجبة من التطبيق" */
    emptyHint: string;
    bar: WidgetBar;
  };

  habits: {
    done: number;
    total: number;
    /** "٣ من ٥" */
    label: string;
    bar: WidgetBar;
    items: WidgetHabitItem[];
    emptyHint: string;
  };

  /** today's tasks (list + flip widgets share this section) */
  tasks: {
    label: string;
    pending: number;
    /** completed today (ratio numerator for the percent widget) */
    doneToday: number;
    /** doneToday + pending (ratio denominator) */
    totalToday: number;
    items: WidgetTaskItem[];
    emptyHint: string;
  };

  /** the live session widget (2×2 with timer + quick-log buttons) */
  workout: WidgetActiveWorkout;

  /** scheduled templates widget (per the user's own day assignments) */
  sessions: {
    items: WidgetSessionItem[];
    /** "لا جداول بعد — أنشئ جدولك من الجيم" */
    emptyHint: string;
  };

  /** muscle heat widget — body PNG rendered by the app itself */
  heat: {
    has: boolean;
    /** "آخر ٣٠ يومًا" */
    periodLabel: string;
    /** base64 PNG (no data: prefix). "" when rasterization is unavailable. */
    image: string;
    /** "الأعلى: الصدر" */
    topLabel: string;
  };

  /** the "نِسَب اليوم" 4×2 two-column ratios list */
  percent: {
    /** exactly 7 rows: habits, calories, protein, carb, fat, workout, tasks */
    rows: Array<{
      key: string;
      label: string;
      pct: number;
      pctLabel: string;
      bar: WidgetBar;
    }>;
  };

  /** 2×1 quick-capture buttons (new habit / new note) */
  quickAdd: {
    habitLabel: string;
    habitHint: string;
    noteLabel: string;
    noteHint: string;
    /** Native quick-add DIALOG labels (v1.22) — pre-formatted per language so
     *  the dialog never needs its own translation layer. */
    titleHabit: string;
    titleNote: string;
    inputHintHabit: string;
    inputHintNote: string;
    save: string;
    cancel: string;
    saved: string;
    errorEmpty: string;
    /** layout direction of the app's current language */
    rtl: boolean;
    /* v2.4 — the dialog's third mode: one-tap drinks */
    /** "ماء" | "Water" — the segment + first button */
    waterLabel: string;
    /** "بضغطة واحدة — دون فتح التطبيق" */
    waterHint: string;
    /** "عصير" | "Juice" */
    juiceLabel: string;
    /** "مشروب" | "Drink" (the other-drink category) */
    otherLabel: string;
    /** "تسجيل مشروب" | "Log a drink" — water mode title */
    titleWater: string;
    /** "الكمية" | "Amount" */
    amountLabel: string;
    /** "مل" | "ml" */
    unitMl: string;
    /** "كمية مخصصة (مل)" — the custom-amount input hint */
    amountHint: string;
    /** preset amount chips, pre-formatted in the app digits — ["١٠٠", "٢٥٠", "٣٣٠", "٥٠٠", "٧٥٠"] */
    amounts: string[];
  };

  /** «عنصر مثبّت» — ONE user-chosen item per placed pin-widget instance.
   *  Configs live in the settings DB (key "widget_pins":
   *  {"<appWidgetId>": {type, id}}) and are re-resolved on every push. */
  pins: {
    items: WidgetPinItem[];
    labelHabit: string;
    labelSession: string;
    labelNote: string;
    /** placeholder CTA when an instance has no config yet */
    chooseCta: string;
    chooseHint: string;
  };

  /** v2.3 — every widget title/hint, pre-formatted in the app's language so
   *  the native layer renders ZERO hardcoded strings (160 languages). */
  t: {
    brand: string;
    /** "افتح التطبيق" — placeholder tap hint */
    openApp: string;
    /** "افتح التطبيق لتحديث البيانات" */
    noData: string;
    habitsTitle: string;
    habitsEmpty: string;
    habitFlipTitle: string;
    tasksTitle: string;
    tasksEmpty: string;
    taskFlipTitle: string;
    mealsTitle: string;
    mealsEmpty: string;
    sessionsTitle: string;
    sessionsEmpty: string;
    activeTitle: string;
    activeNone: string;
    activeStartHint: string;
    activeLogSet: string;
    activeNext: string;
    activeAllDone: string;
    heatTitle: string;
    heatRegen: string;
    percentTitle: string;
    flipHint: string;
    eventsTitle: string;
    eventsEmpty: string;
  };

  /** v2.4 — «ماء اليوم»: hydration totals for the 1×1 ring + drinks widget. */
  water: WidgetWater;

  /** v2.3 — «الأحداث القادمة»: the next 4 things ahead (sessions + tasks). */
  events: {
    title: string;
    emptyHint: string;
    items: WidgetEventItem[];
  };

  /** v2.3 — «التقويم»: the current month as a 6×7 grid with per-day marks.
   *  Day taps deep-link astnum://open?tab=today&cal=YYYY-MM-DD which opens
   *  the app's calendar sheet focused on that day (tasks/notes per day). */
  calendar: {
    /** "أكتوبر ٢٠٢٥" — formatted via Intl in the app language */
    monthLabel: string;
    /** 7 short weekday headers, Sunday-first, app language */
    dow: string[];
    /** exactly 42 cells (6 rows × 7 cols) covering the current month */
    cells: WidgetCalendarCell[];
    /** the month header tap target (today's deep link) */
    todayUri: string;
  };
}

/** Deep-link query contract (native → app). Single host `astnum://open`:
 *  tab, sub, toggle (habit one-tap log), start (template), quicklog/quicknext
 *  (widget buttons), add (quick-capture widget), habit/note (open one item),
 *  pickpin (pin widget → choose what IT shows). */
export type WidgetTab = "today" | "habits" | "gym" | "notes" | "body";
export type WidgetBodySub = "measure" | "muscles" | "food";

/** All 19 home-screen widget kinds (pinning + settings). */
export type WidgetKind =
  | "carb"
  | "protein"
  | "fat"
  | "calories"
  | "water"
  | "drinks"
  | "meals"
  | "tasks"
  | "taskFlip"
  | "habits"
  | "habitFlip"
  | "muscles"
  | "sessions"
  | "active"
  | "percent"
  | "quickAdd"
  | "pin"
  | "events"
  | "calendar";
