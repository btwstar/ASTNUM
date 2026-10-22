/** muscles module strings (muscle map). Arabic = source of truth. */
const dict: Record<string, string> = {
  // screen
  "muscles.title": "خريطة العضلات",

  // view segmented control
  "muscles.view.front": "أمامي",
  "muscles.view.back": "خلفي",

  // period segmented control ({{days}} = locale-formatted day count)
  "muscles.period.days_zero": "أقل من يوم",
  "muscles.period.days_one": "يوم واحد",
  "muscles.period.days_two": "يومان",
  "muscles.period.days_few": "{{days}} أيام",
  "muscles.period.days_many": "{{days}} يومًا",
  "muscles.period.days_other": "{{days}} يومًا",

  // metric mode toggle
  "muscles.mode.sets": "مجموعات",
  "muscles.mode.volume": "حجم",

  // legend / heat levels
  "muscles.legend.title": "المفتاح",
  "muscles.legend.l0": "لم تُدرَّب",
  "muscles.legend.l1": "أقل من الهدف",
  "muscles.legend.l2": "في النطاق",
  "muscles.legend.l3": "حمل مرتفع",
  "muscles.legend.l4": "حمل زائد",
  "muscles.legend.note": "الأرقام على الجسم = مجموعات موزونة",
  "muscles.legend.noteVolume": "الأرقام على الجسم = الحجم الكلي ({{unit}})",

  // FAB focus suggestion (v1.13 — the + button on the muscles tab)
  "muscles.fab.focus": "العضلة الأكثر حاجة للتدريب: {{name}}",

  // accessible list of all 15
  "muscles.list.title": "كل العضلات",
  "muscles.list.setsOf": "{{done}} من {{target}}",
  "muscles.list.volumeRow": "{{value}} {{unit}}",

  // bottom sheet
  "muscles.sheet.periodNote": "خلال آخر {{period}}",
  "muscles.sheet.volumeLabel": "الحجم الكلي",
  "muscles.sheet.volumeValue": "{{value}} {{unit}}",
  "muscles.sheet.volumeSets": "{{done}} من {{target}} مجموعة",
  "muscles.sheet.lastTrained": "آخر تدريب: {{when}}",
  "muscles.sheet.neverTrained": "لم تُدرَّب خلال هذه الفترة",
  "muscles.sheet.levelLabel": "الحالة",
  "muscles.sheet.exercises": "تمارين مقترحة",
  "muscles.sheet.exercisesEmpty": "لا توجد تمارين مرتبطة",
  "muscles.sheet.target": "الهدف الأسبوعي",
  "muscles.sheet.targetHint": "مجموعات موزونة أسبوعيًا (٤–٤٠)",
  "muscles.sheet.decreaseTarget": "تقليل الهدف",
  "muscles.sheet.increaseTarget": "زيادة الهدف",

  // exercise roles
  "muscles.role.primary": "رئيسي",
  "muscles.role.secondary": "مساعد",

  // level guidance (factual, suggestion-only — no "neglect" framing)
  "muscles.reco.l0": "لم تُدرَّب خلال هذه الفترة",
  "muscles.reco.l1": "أقل من الهدف الأسبوعي",
  "muscles.reco.l2": "في النطاق المثالي",
  "muscles.reco.l3": "حمل مرتفع — خفف المجموعات",
  "muscles.reco.l4": "حمل زائد — هذه العضلة تحتاج راحة",

  // empty + error
  "muscles.error.load": "تعذّر تحميل خريطة العضلات",

  // a11y
  "muscles.a11y.figure": "خريطة الجسم — أمامي وخلفي",
  "muscles.a11y.openSheet": "اضغط لعرض تفاصيل العضلة",

  // control group labels (radiogroups)
  "muscles.view.label": "المنظر",
  "muscles.period.label": "الفترة",
  "muscles.mode.label": "نوع القياس",

  // detail sheet — big number + relative days (added by completion pass)
  "muscles.sheet.bigRest": "من {{target}} مجموعة",
  "muscles.sheet.today": "اليوم",
  "muscles.sheet.daysAgo_one": "أمس",
  "muscles.sheet.daysAgo_two": "منذ يومين",
  "muscles.sheet.daysAgo_few": "منذ {{days}} أيام",
  "muscles.sheet.daysAgo_many": "منذ {{days}} يومًا",
  "muscles.sheet.daysAgo_other": "منذ {{days}} يومًا",

  // errors
  "muscles.error.target": "تعذّر تحديث الهدف الأسبوعي",
};
export default dict;
