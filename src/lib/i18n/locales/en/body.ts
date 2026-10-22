/** body module strings (body + nutrition). */
const dict: Record<string, string> = {
  "body.title": "My Body",

  // sub-tabs
  "body.tab.muscles": "Muscles",
  "body.tab.measurements": "Measurements",
  "body.tab.food": "Food",

  "body.disclaimer": "Personal tracking measurements — not a substitute for professional advice.",

  // snapshot card
  "body.snapshot.title": "Latest measurement",
  "body.snapshot.empty": "No measurements yet",
  "body.snapshot.vs": "vs previous measurement",
  "body.snapshot.date": "Measured {{date}}",

  // metrics
  "body.weight": "Weight",
  "body.bodyFat": "Body fat",
  "body.muscleMass": "Muscle mass",
  "body.water": "Water",
  "body.visceral": "Visceral fat",
  "body.notes": "Notes",
  "body.notesPlaceholder": "Any note about this measurement…",

  // add / edit sheet
  "body.addMeasurement": "Add measurement",
  "body.editMeasurement": "Edit measurement",
  "body.addHint": "Leave any field empty if you didn't measure it",
  "body.circumferences": "Circumferences",
  "body.part.chest": "Chest",
  "body.part.waist": "Waist",
  "body.part.arm": "Arm",
  "body.part.thigh": "Thigh",
  "body.part.hip": "Hip",
  "body.validation.weight": "Enter a weight between {{min}} and {{max}}",
  "body.validation.bodyFat": "Enter body fat between {{min}} and {{max}}",
  "body.validation.muscleMass": "Enter muscle mass between {{min}} and {{max}}",
  "body.validation.water": "Enter water % between {{min}} and {{max}}",
  "body.validation.visceral": "Enter visceral fat between {{min}} and {{max}}",
  "body.validation.circ": "Enter {{part}} circumference between {{min}} and {{max}}",
  "body.validation.date": "Enter a valid date",
  "body.validation.required": "Enter at least one value",
  "body.existsNote": "A measurement exists on this date — it will be updated",

  // trends
  "body.trends.title": "Trends",
  "body.trends.movingAverage": "Moving average",
  "body.trends.raw": "Value",
  "body.trends.metric.weight": "Weight",
  "body.trends.metric.bodyFat": "Fat %",
  "body.trends.metric.muscle": "Muscle",
  "body.trends.metric.water": "Water %",
  "body.trends.empty": "Log at least two measurements to see trends",

  // before / after
  "body.compare.title": "Before / After",
  "body.compare.first": "First",
  "body.compare.latest": "Latest",
  "body.compare.empty": "At least two measurements are needed",
  "body.compare.waist": "Waist",

  // history
  "body.history.title": "History",
  "body.history.empty": "No history yet",
  "body.history.count_one": "{{count}} measurement",
  "body.history.count_other": "{{count}} measurements",
  "body.deleteConfirm.title": "Delete measurement?",
  "body.deleteConfirm.desc": "The measurement of {{date}} will be deleted with its circumferences.",
  "body.historyItem": "{{weight}} — fat {{bodyFat}}",

  // data section (CSV)
  "body.data.title": "Data",
  "body.exportCsv": "Export CSV",
  "body.importCsv": "Import CSV",
  "body.import.pickFile": "Pick a CSV file",
  "body.import.previewTitle": "Confirm import",
  "body.import.preview": "Found {{count}} valid rows to import",
  "body.import.imported_one": "Imported {{count}} measurement",
  "body.import.imported_other": "Imported {{count}} measurements",
  "body.import.skipped": ", skipped {{count}} invalid rows",
  "body.import.none": "No valid rows found in the file",
  "body.export.empty": "Nothing to export yet",

  // progress photos
  "body.photos.title": "Progress photos",
  "body.photos.add": "Add photo",
  "body.photos.empty": "No photos yet",
  "body.photos.processing": "Processing photo…",
  "body.photos.tooLarge": "Image still too large after compression — try a smaller one",
  "body.photos.delete": "Delete photo",
  "body.photos.deleteConfirm.title": "Delete photo?",
  "body.photos.deleteConfirm.desc": "This deletion cannot be undone.",
  "body.photos.loadError": "Couldn't load photos",
  "body.photos.invalidFile": "File is not a valid image",

  // photo PIN lock
  "body.photoLock.locked": "Photos locked",
  "body.photoLock.subtitle": "Enter your PIN to view progress photos",
  "body.photoLock.wrong": "Wrong PIN — try again",
  "body.photoLock.manage": "Manage lock",
  "body.photoLock.set": "Set PIN",
  "body.photoLock.change": "Change PIN",
  "body.photoLock.remove": "Remove lock",
  "body.photoLock.enterNew": "Enter a new 4-digit PIN",
  "body.photoLock.confirmNew": "Confirm the new PIN",
  "body.photoLock.mismatch": "PINs don't match — try again",
  "body.photoLock.tooShort": "PIN must be 4 digits",
  "body.photoLock.saved": "PIN saved",
  "body.photoLock.removed": "Lock removed",
  "body.photoLock.removeHint": "Enter the current PIN to confirm removal",
  "body.photoLock.current": "Current PIN",
  "body.photoLock.note": "The PIN is stored hashed (SHA-256), never as plain text.",

  // misc deltas
  "body.delta.up": "up",
  "body.delta.down": "down",
};

export default dict;
