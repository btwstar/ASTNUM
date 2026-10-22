/** muscles module strings (muscle map). English mirror of the Arabic source. */
const dict: Record<string, string> = {
  // screen
  "muscles.title": "Muscle Map",

  // view segmented control
  "muscles.view.front": "Front",
  "muscles.view.back": "Back",

  // period segmented control ({{days}} = locale-formatted day count)
  "muscles.period.days_zero": "less than a day",
  "muscles.period.days_one": "one day",
  "muscles.period.days_two": "{{days}} days",
  "muscles.period.days_other": "{{days}} days",

  // metric mode toggle
  "muscles.mode.sets": "Sets",
  "muscles.mode.volume": "Volume",

  // legend / heat levels
  "muscles.legend.title": "Legend",
  "muscles.legend.l0": "Untouched",
  "muscles.legend.l1": "Below target",
  "muscles.legend.l2": "On target",
  "muscles.legend.l3": "High load",
  "muscles.legend.l4": "Overload",
  "muscles.legend.note": "Numbers on the body = weighted sets",
  "muscles.legend.noteVolume": "Numbers on the body = total volume ({{unit}})",

  // FAB focus suggestion (v1.13 — the + button on the muscles tab)
  "muscles.fab.focus": "Muscle most needing training: {{name}}",

  // accessible list of all 15
  "muscles.list.title": "All muscles",
  "muscles.list.setsOf": "{{done}} of {{target}}",
  "muscles.list.volumeRow": "{{value}} {{unit}}",

  // bottom sheet
  "muscles.sheet.periodNote": "over the last {{period}}",
  "muscles.sheet.volumeLabel": "Total volume",
  "muscles.sheet.volumeValue": "{{value}} {{unit}}",
  "muscles.sheet.volumeSets": "{{done}} of {{target}} sets",
  "muscles.sheet.lastTrained": "Last trained: {{when}}",
  "muscles.sheet.neverTrained": "Not trained in this period",
  "muscles.sheet.levelLabel": "Status",
  "muscles.sheet.exercises": "Suggested exercises",
  "muscles.sheet.exercisesEmpty": "No linked exercises",
  "muscles.sheet.target": "Weekly target",
  "muscles.sheet.targetHint": "weighted sets per week (4–40)",
  "muscles.sheet.decreaseTarget": "Decrease target",
  "muscles.sheet.increaseTarget": "Increase target",

  // exercise roles
  "muscles.role.primary": "Primary",
  "muscles.role.secondary": "Secondary",

  // level guidance (factual, suggestion-only — no "neglect" framing)
  "muscles.reco.l0": "Not trained in this period",
  "muscles.reco.l1": "Below your weekly target",
  "muscles.reco.l2": "In the optimal range",
  "muscles.reco.l3": "High load — ease off the sets",
  "muscles.reco.l4": "Overloaded — this muscle needs rest",

  // empty + error
  "muscles.error.load": "Couldn't load the muscle map",

  // a11y
  "muscles.a11y.figure": "Body map — front and back",
  "muscles.a11y.openSheet": "Tap to open muscle details",

  // control group labels (radiogroups)
  "muscles.view.label": "View",
  "muscles.period.label": "Period",
  "muscles.mode.label": "Metric",

  // detail sheet — big number + relative days (added by completion pass)
  "muscles.sheet.bigRest": "of {{target}} sets",
  "muscles.sheet.today": "today",
  "muscles.sheet.daysAgo_one": "yesterday",
  "muscles.sheet.daysAgo_other": "{{days}} days ago",

  // errors
  "muscles.error.target": "Couldn't update the weekly target",
};
export default dict;
