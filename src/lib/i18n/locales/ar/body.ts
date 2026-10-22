/** body module strings (body + nutrition). */
const dict: Record<string, string> = {
  "body.title": "جسمي",

  // sub-tabs
  "body.tab.muscles": "عضلات",
  "body.tab.measurements": "قياسات",
  "body.tab.food": "أكل",

  "body.disclaimer": "قياسات شخصية للتتبع فقط — ليست بديلًا عن استشارة مختص.",

  // snapshot card
  "body.snapshot.title": "أحدث قياس",
  "body.snapshot.empty": "لا توجد قياسات بعد",
  "body.snapshot.vs": "مقارنة بالقياس السابق",
  "body.snapshot.date": "قياس {{date}}",

  // metrics
  "body.weight": "الوزن",
  "body.bodyFat": "نسبة الدهون",
  "body.muscleMass": "الكتلة العضلية",
  "body.water": "الماء",
  "body.visceral": "الدهون الحشوية",
  "body.notes": "ملاحظات",
  "body.notesPlaceholder": "أي ملاحظة عن هذا القياس…",

  // add / edit sheet
  "body.addMeasurement": "إضافة قياس",
  "body.editMeasurement": "تعديل القياس",
  "body.addHint": "اترك أي حقل فارغًا إن لم تقِسه",
  "body.circumferences": "المقاسات المحيطية",
  "body.part.chest": "الصدر",
  "body.part.waist": "الخصر",
  "body.part.arm": "الذراع",
  "body.part.thigh": "الفخذ",
  "body.part.hip": "الورك",
  "body.validation.weight": "أدخل وزنًا بين {{min}} و {{max}}",
  "body.validation.bodyFat": "أدخل نسبة دهون بين {{min}} و {{max}}",
  "body.validation.muscleMass": "أدخل كتلة عضلية بين {{min}} و {{max}}",
  "body.validation.water": "أدخل نسبة ماء بين {{min}} و {{max}}",
  "body.validation.visceral": "أدخل دهونًا حشوية بين {{min}} و {{max}}",
  "body.validation.circ": "أدخل محيط {{part}} بين {{min}} و {{max}}",
  "body.validation.date": "أدخل تاريخًا صحيحًا",
  "body.validation.required": "أدخل قيمة واحدة على الأقل",
  "body.existsNote": "يوجد قياس بهذا التاريخ — سيتم تحديثه",

  // trends
  "body.trends.title": "الاتجاه",
  "body.trends.movingAverage": "متوسط متحرك",
  "body.trends.raw": "القيمة",
  "body.trends.metric.weight": "الوزن",
  "body.trends.metric.bodyFat": "الدهون %",
  "body.trends.metric.muscle": "العضلات",
  "body.trends.metric.water": "الماء %",
  "body.trends.empty": "سجّل قياسين على الأقل لعرض الاتجاه",

  // before / after
  "body.compare.title": "قبل / بعد",
  "body.compare.first": "أول قياس",
  "body.compare.latest": "أحدث قياس",
  "body.compare.empty": "يلزم قياسان على الأقل للمقارنة",
  "body.compare.waist": "الخصر",

  // history
  "body.history.title": "السجل",
  "body.history.empty": "لا يوجد سجل بعد",
  "body.history.count": "{{count}} قياس",
  "body.deleteConfirm.title": "حذف القياس؟",
  "body.deleteConfirm.desc": "سيُحذف قياس يوم {{date}} نهائيًا مع محيطاته.",
  "body.historyItem": "وزن {{weight}} — دهون {{bodyFat}}",

  // data section (CSV)
  "body.data.title": "البيانات",
  "body.exportCsv": "تصدير CSV",
  "body.importCsv": "استيراد CSV",
  "body.import.pickFile": "اختر ملف CSV",
  "body.import.previewTitle": "تأكيد الاستيراد",
  "body.import.preview": "تم العثور على {{count}} صف صالح للاستيراد",
  "body.import.imported": "تم استيراد {{count}} قياس",
  "body.import.skipped": " وتم تجاهل {{count}} صف غير صالح",
  "body.import.none": "لم يُعثر على صفوف صالحة في الملف",
  "body.export.empty": "لا توجد بيانات للتصدير",

  // progress photos
  "body.photos.title": "صور التقدم",
  "body.photos.add": "إضافة صورة",
  "body.photos.empty": "لا توجد صور بعد",
  "body.photos.processing": "جارٍ معالجة الصورة…",
  "body.photos.tooLarge": "الصورة كبيرة جدًا بعد الضغط — جرّب صورة أصغر",
  "body.photos.delete": "حذف الصورة",
  "body.photos.deleteConfirm.title": "حذف الصورة؟",
  "body.photos.deleteConfirm.desc": "لا يمكن التراجع عن هذا الحذف.",
  "body.photos.loadError": "تعذّر تحميل الصور",
  "body.photos.invalidFile": "الملف ليس صورة صالحة",

  // photo PIN lock
  "body.photoLock.locked": "الصور مقفلة",
  "body.photoLock.subtitle": "أدخل الرقم السري لعرض صور التقدم",
  "body.photoLock.wrong": "رقم سري خاطئ — حاول مجددًا",
  "body.photoLock.manage": "إدارة القفل",
  "body.photoLock.set": "تعيين رقم سري",
  "body.photoLock.change": "تغيير الرقم السري",
  "body.photoLock.remove": "إزالة القفل",
  "body.photoLock.enterNew": "أدخل رقمًا سريًا جديدًا (٤ أرقام)",
  "body.photoLock.confirmNew": "أكّد الرقم السري الجديد",
  "body.photoLock.mismatch": "الرقمان غير متطابقين — أعد المحاولة",
  "body.photoLock.tooShort": "الرقم السري يجب أن يكون ٤ أرقام",
  "body.photoLock.saved": "تم تعيين الرقم السري",
  "body.photoLock.removed": "تمت إزالة القفل",
  "body.photoLock.removeHint": "أدخل الرقم السري الحالي لتأكيد الإزالة",
  "body.photoLock.current": "الرقم السري الحالي",
  "body.photoLock.note": "يُخزَّن الرقم مبعثرًا (SHA-256) ولا يُحفظ كنص صريح.",

  // misc deltas
  "body.delta.up": "ارتفاع",
  "body.delta.down": "انخفاض",
};

export default dict;
