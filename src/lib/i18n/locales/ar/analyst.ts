/** analyst module strings — v1.9: the Analyst is now الإحصائيات (Statistics). Pure stat labels — no questions, no judgment. Arabic is the source of truth. */
const dict: Record<string, string> = {
  // ── shell ────────────────────────────────────────────────
  "analyst.title": "الإحصائيات",
  "analyst.instant": "فوري",
  "analyst.noData": "لا توجد بيانات بعد",
  "analyst.categories": "تصنيفات الإحصائيات",
  "analyst.trend.flat": "ثابت",

  // ── categories ───────────────────────────────────────────
  "analyst.category.all": "الكل",
  "analyst.category.gym": "التمارين",
  "analyst.category.habits": "العادات",
  "analyst.category.tasks": "الإنجاز",
  "analyst.category.body": "الجسم",
  "analyst.category.nutrition": "التغذية",

  // ── units ────────────────────────────────────────────────
  "analyst.unit.kg": "كيلو",
  "analyst.unit.sets": "مجموعة موزونة",
  "analyst.unit.kcal": "سعرات",
  "analyst.unit.g": "جرام",
  "analyst.unit.pct": "٪",
  "analyst.unit.day": "يوم",
  "analyst.unit.week": "أسبوع",

  // ── stat labels (gym) ────────────────────────────────────
  "analyst.stat.volumeToday": "حجم اليوم",
  "analyst.stat.weekVolume": "حجم هذا الأسبوع",
  "analyst.stat.volumeTotal": "إجمالي ما رفعته",
  "analyst.stat.workoutsCount": "تمارين مكتملة",
  "analyst.stat.strongestLift": "أقوى رفعة",
  "analyst.stat.topMuscle": "أكثر عضلة دربتها",

  // ── stat labels (habits) ─────────────────────────────────
  "analyst.stat.bestStreak": "أطول سلسلة التزام حالية",
  "analyst.stat.consistency30": "الالتزام — آخر ٣٠ يوم",
  "analyst.stat.habitsToday": "عادات أنجزتها اليوم",

  // ── stat labels (tasks) ──────────────────────────────────
  "analyst.stat.tasksDone": "مهام أنجزتها",
  "analyst.stat.tasksOpen": "مهام متبقية",
  "analyst.stat.allCompletions": "إجمالي إنجازاتك",

  // ── stat labels (body) ───────────────────────────────────
  "analyst.stat.weightChange": "تغير وزنك",
  "analyst.stat.latestWeight": "آخر وزن",

  // ── stat labels (nutrition) ──────────────────────────────
  "analyst.stat.caloriesWeek": "متوسط السعرات — آخر ٧ أيام",
  "analyst.stat.proteinWeek": "متوسط البروتين — آخر ٧ أيام",

  // ── context lines (gym) ──────────────────────────────────
  "analyst.a.volumeToday.detail": "{{sets}} مجموعة موزونة اليوم",
  "analyst.a.volumeToday.none": "لا مجموعات موزونة اليوم",
  "analyst.a.weekVolume.detail": "الأسبوع الفائت كان {{last}} كيلو",
  "analyst.a.volumeTotal.detail": "منها {{pct}}٪ هذا الشهر عبر {{n}} تمرين مكتمل",
  "analyst.a.workoutsCount.detail": "بمتوسط {{perWeek}} تمرين في الأسبوع",
  "analyst.a.workoutsCount.detailFull": "بمتوسط {{perWeek}} تمرين في الأسبوع • متوسط الجلسة {{mins}} دقيقة",
  "analyst.a.strongestLift.detail": "أفضل مجموعة: {{weight}} كيلو × {{reps}} تكرار في «{{name}}» (تقدير 1RM إيبلي)",
  "analyst.a.topMuscle.detail": "حسب المجموعات الموزونة (أساسية كاملة وثانوية بنص وزن) آخر ٦٠ يوم",

  // ── context lines (habits) ───────────────────────────────
  "analyst.a.bestStreak.detail": "سلسلة عادة «{{name}}»",
  "analyst.a.consistency30.detail": "{{done}} إنجاز من {{scheduled}} يوم مجدول عبر كل عاداتك النشطة",
  "analyst.a.habitsToday.detail": "من {{total}} عادة مجدولة اليوم",

  // ── context lines (tasks) ────────────────────────────────
  "analyst.a.tasksDone.detail": "منها {{week}} خلال آخر ٧ أيام",
  "analyst.a.tasksDone.detailOld": "كلها أُنجزت قبل هذا الأسبوع",
  "analyst.a.tasksOpen.detail": "بانتظارك الآن من {{total}} مهمة",
  "analyst.a.tasksOpen.clear": "كل المهام منجزة",
  "analyst.a.allCompletions.detail": "عاداتك + مهامك + تمارينك المكتملة",
  "analyst.source.habits": "العادات",
  "analyst.source.tasks": "المهام",
  "analyst.source.workouts": "التمارين",

  // ── context lines (body) ─────────────────────────────────
  "analyst.a.weightChange.detail": "من {{first}} إلى {{latest}} كيلو خلال {{days}} يوم",
  "analyst.a.latestWeight.detail": "آخر قياس بتاريخ {{date}}",

  // ── context lines (nutrition) ────────────────────────────
  "analyst.a.caloriesWeek.detail": "سجلت أكلك في {{days}} أيام",
  "analyst.a.caloriesWeek.detailGoal": "الهدف اليومي {{goal}} سعرات • سجلت {{days}} أيام",
  "analyst.a.proteinWeek.detail": "سجلت أكلك في {{days}} أيام",
  "analyst.a.proteinWeek.detailGoal": "الهدف اليومي {{goal}} جرام • سجلت {{days}} أيام",
};

export default dict;
