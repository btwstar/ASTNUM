/** analyst module strings — v1.9: the Analyst is now Statistics. Pure stat labels — no questions, no judgment. English mirror of the Arabic source 1:1. */
const dict: Record<string, string> = {
  // ── shell ────────────────────────────────────────────────
  "analyst.title": "Statistics",
  "analyst.instant": "Instant",
  "analyst.noData": "No data yet",
  "analyst.categories": "Stat categories",
  "analyst.trend.flat": "Steady",

  // ── categories ───────────────────────────────────────────
  "analyst.category.all": "All",
  "analyst.category.gym": "Workouts",
  "analyst.category.habits": "Habits",
  "analyst.category.tasks": "Progress",
  "analyst.category.body": "Body",
  "analyst.category.nutrition": "Nutrition",

  // ── units ────────────────────────────────────────────────
  "analyst.unit.kg": "kg",
  "analyst.unit.sets": "weighted sets",
  "analyst.unit.kcal": "kcal",
  "analyst.unit.g": "g",
  "analyst.unit.pct": "%",
  "analyst.unit.day": "day",
  "analyst.unit.week": "week",

  // ── stat labels (gym) ────────────────────────────────────
  "analyst.stat.volumeToday": "Volume today",
  "analyst.stat.weekVolume": "This week's volume",
  "analyst.stat.volumeTotal": "Total lifted",
  "analyst.stat.workoutsCount": "Completed workouts",
  "analyst.stat.strongestLift": "Strongest lift",
  "analyst.stat.topMuscle": "Most-trained muscle",

  // ── stat labels (habits) ─────────────────────────────────
  "analyst.stat.bestStreak": "Longest active streak",
  "analyst.stat.consistency30": "Consistency — last 30 days",
  "analyst.stat.habitsToday": "Habits done today",

  // ── stat labels (tasks) ──────────────────────────────────
  "analyst.stat.tasksDone": "Tasks completed",
  "analyst.stat.tasksOpen": "Open tasks",
  "analyst.stat.allCompletions": "Total completions",

  // ── stat labels (body) ───────────────────────────────────
  "analyst.stat.weightChange": "Weight change",
  "analyst.stat.latestWeight": "Latest weight",

  // ── stat labels (nutrition) ──────────────────────────────
  "analyst.stat.caloriesWeek": "Avg calories — last 7 days",
  "analyst.stat.proteinWeek": "Avg protein — last 7 days",

  // ── context lines (gym) ──────────────────────────────────
  "analyst.a.volumeToday.detail": "{{sets}} weighted sets today",
  "analyst.a.volumeToday.none": "No weighted sets today",
  "analyst.a.weekVolume.detail": "Last week was {{last}} kg",
  "analyst.a.volumeTotal.detail": "{{pct}}% of it this month across {{n}} completed workouts",
  "analyst.a.workoutsCount.detail": "Averaging {{perWeek}} workouts per week",
  "analyst.a.workoutsCount.detailFull": "Averaging {{perWeek}} workouts per week • average session {{mins}} min",
  "analyst.a.strongestLift.detail": "Best set: {{weight}} kg × {{reps}} reps on \"{{name}}\" (Epley e1RM)",
  "analyst.a.topMuscle.detail": "Weighted sets (primary full, secondary half) over the last 60 days",

  // ── context lines (habits) ───────────────────────────────
  "analyst.a.bestStreak.detail": "The streak of \"{{name}}\"",
  "analyst.a.consistency30.detail": "{{done}} completions out of {{scheduled}} scheduled days across your active habits",
  "analyst.a.habitsToday.detail": "Out of {{total}} habits scheduled today",

  // ── context lines (tasks) ────────────────────────────────
  "analyst.a.tasksDone.detail": "{{week}} of them in the last 7 days",
  "analyst.a.tasksDone.detailOld": "All completed before this week",
  "analyst.a.tasksOpen.detail": "Waiting for you out of {{total}} tasks",
  "analyst.a.tasksOpen.clear": "All tasks are done",
  "analyst.a.allCompletions.detail": "Your habits + tasks + completed workouts",
  "analyst.source.habits": "Habits",
  "analyst.source.tasks": "Tasks",
  "analyst.source.workouts": "Workouts",

  // ── context lines (body) ─────────────────────────────────
  "analyst.a.weightChange.detail": "From {{first}} to {{latest}} kg over {{days}} days",
  "analyst.a.latestWeight.detail": "Last measured on {{date}}",

  // ── context lines (nutrition) ────────────────────────────
  "analyst.a.caloriesWeek.detail": "Logged food on {{days}} days",
  "analyst.a.caloriesWeek.detailGoal": "Daily goal {{goal}} kcal • logged {{days}} days",
  "analyst.a.proteinWeek.detail": "Logged food on {{days}} days",
  "analyst.a.proteinWeek.detailGoal": "Daily goal {{goal}} g • logged {{days}} days",
};

export default dict;
