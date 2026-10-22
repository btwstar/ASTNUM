# دليل بناء أندرويد (ANDROID_BUILD.md) — سقالة الترحيل والتوقيع والبناء

> هذا الملف يكمل `docs/MANUAL_STEPS.md` §ب (القرار المعماري) بالتفاصيل التنفيذية: **جدول ترحيل API→SQLite الكامل**، تبديل طبقة النقل، الإشعارات الأصلية، ثم أمر البناء والتوقيع خطوة بخطوة.
> بصراحة: هذا **دليل عمل** لا كودًا منتهيًا — طبقة البيانات الأصلية عملٌ عليك تنفيذه (أو تكليف وكيل برمجي به لاحقًا)، والبنية هنا صُممت لتجعله ميكانيكيًا قدر الإمكان.

---

## 1. المبادئ التي تجعل الترحيل ميكانيكيًا

1. **نقطة نقل واحدة**: كل مكونات الواجهة تستدعي `apiGet/apiPost/apiPatch/apiPut/apiDelete` من `src/lib/api.ts` — استبدل جسم هذه الدوال فقط، ولا تلمس أي شاشة.
2. **مخطط مرآة 1:1**: `prisma/schema.prisma` هو مخطط النسخة الأصلية نفسه (23 جدولًا بأسمائها وأعمدتها — الأسماء مصممة لتناسب SQLite أصلًا). انسخ DDL منه.
3. **منطق نقي قابل لإعادة الاستخدام حرفيًا**: كل قواعد العمل في `src/lib/logic/` (streak, pr, heatmap, calories, quota) بلا أي اعتماد على Prisma أو fetch — انقلها كما هي.
4. **عقد الاستجابة**: الأصل يجب أن يطابق envelope الويب: `{ ok: true, data } | { ok: false, error: { code, message } }` — بذلك لا تتغير معالجة الأخطاء في أي شاشة.
5. **بذر واحد**: `src/lib/seed/*.ts` (164 تمرينًا/171 طعامًا/15 عضلة/6 قوالب) — بيانات TypeScript نقيلة؛ انقل `ensureSeed()` ليعمل فوق الجسر الأصلي كما هو.

## 2. جدول الترحيل الكامل: مسار ويب → عملية SQLite أصلية (نفس أسماء الجداول)

| مسار API الحالي | العملية الأصلية المكافئة | الجداول (نفس الأسماء) | ملاحظات |
|---|---|---|---|
| `GET/POST /api/habits` | list/create | `Habits` | `scheduleJson` عمود JSON نصي — نفس الصيغة |
| `PATCH/DELETE /api/habits/[id]` | update/soft-delete | `Habits` | الحذف = تعيين `deletedAt` |
| `POST /api/habits/[id]/log` | upsert | `HabitLogs` | `@@unique(habitId,date)` → `INSERT OR REPLACE` |
| `POST /api/habits/[id]/freeze` | insert + فحص حصة | `StreakFreezes` | المنطق: `src/lib/logic/streak.ts` كما هو |
| `GET /api/habits/stats` | قراءة + حساب محلي | `HabitLogs`, `StreakFreezes`, `Habits` | استخدم دوال streak مباشرة |
| `GET/POST /api/notes` | list (بحث/فلترة)/create | `Notes` | `@@index(deletedAt,pinned,updatedAt)` → أنشئ INDEX مقابلة |
| `GET/PATCH/DELETE /api/notes/[id]` | read/update/soft-delete | `Notes` | سلة المهملات = `deletedAt` + تنقية 30 يومًا |
| `POST /api/notes/[id]/restore` | update | `Notes` | أصفّر `deletedAt` |
| `GET/POST/DELETE /api/notes/[id]/tags`, `GET /api/notes/tags` | join ops | `Tags`, `NoteTags` | `NoteTags` مفتاح مركب `(noteId,tagId)` |
| `GET /api/notes/trash` | قراءة | `Notes` | `deletedAt != null` + قبل 30 يومًا |
| `GET/POST /api/tasks` | list/create | `Tasks` | `repeatRule` JSON نصي — نفس الصيغة |
| `GET/PATCH/DELETE /api/tasks/[id]` | read/update/delete | `Tasks` | منطق التكرار عند الإكمال في `src/app/api/tasks/_lib.ts` — انقله كدالة نقية |
| `GET /api/gym/exercises` | list + فلترة (بحث/عُدّة/عضلة) | `Exercises`, `ExerciseMuscles` | فلترة العضلة عبر join على `ExerciseMuscles` |
| `POST /api/gym/exercises` | create | `Exercises`, `ExerciseMuscles` | custom=true + ≥1 عضلة أساسية (تحقق موجود بالكود) |
| `GET/POST /api/gym/workouts` | list/start | `Workouts` | جلسة نشطة = `completedAt IS NULL` |
| `GET/PATCH/DELETE /api/gym/workouts/[id]` | detail/finish/soft-delete | `Workouts` | finish يضبط `completedAt + durationSec` |
| `POST /api/gym/workouts/[id]/sets` | insert + كشف PR | `Sets` | كشف PR: `src/lib/logic/pr.ts` كما هو + `isPr` |
| `PATCH/DELETE /api/gym/sets/[id]` | update/delete | `Sets` | |
| `GET/POST /api/gym/templates`, `PATCH/DELETE .../[id]` | CRUD قوالب | `WorkoutTemplates`, `TemplateExercises` | الترتيب بـ `sortOrder` |
| `GET /api/gym/stats` | تجميع محلي | `Sets`, `Workouts`, `Exercises` | e1RM/سجل آخر أداء عبر `src/lib/logic/pr.ts` |
| `GET /api/muscles` | list | `MuscleGroups` | 15 صفًا ثابتة (بذر) |
| `PATCH /api/muscles/targets` | update | `MuscleGroups.weeklyTarget` | |
| `GET /api/muscles/load` | حساب محلي | `Sets` + `ExerciseMuscles` + `MuscleGroups` | `src/lib/logic/heatmap.ts` كما هو |
| `GET /api/muscles/[id]/exercises` | list عبر join | `ExerciseMuscles`, `Exercises` | |
| `GET/POST /api/body/measurements` | list/create | `BodyMeasurements` | `@@unique(date)` → upsert يومي |
| `GET/POST /api/body/circumferences` | list/upsert | `BodyCircumferences` | `@@unique(date,part)` |
| `GET/POST/DELETE /api/body/photos` | list/add/delete | `ProgressPhotos` | **الفرق الأصلي الوحيد**: `filePath` يخزن مسار ملف `@capacitor/filesystem` في `Directory.Data` بدل data-URL |
| `POST /api/body/import` | bulk insert | `BodyMeasurements`, `BodyCircumferences` | استيراد CSV |
| `GET/POST /api/nutrition/logs`, `DELETE .../[id]` | list/create/delete | `FoodLogs` | |
| `GET/PUT /api/nutrition/goals` | read/upsert | `NutritionGoals` | صف واحد نشِط (`date='1970-01-01'` اصطلاحًا) + `formulaMeta` JSON |
| `GET/POST /api/nutrition/foods` | list/search/create | `Foods` | |
| `GET /api/nutrition/summary` | تجميع محلي | `FoodLogs`, `NutritionGoals` | `?week=1` يجمع 7 أيام في استعلام واحد |
| `GET /api/nutrition/barcode` | **يبقى شبكيًا**: Open Food Facts → cache | `Foods` (+ شبكة) | نفس المنطق: OFF ثم خزّن في `Foods`، والخطأ `OFFLINE` عند فشل الشبكة |
| `GET/PUT /api/settings` | read/write | `Settings` | key/value — نفس الصفوف (`seed:v1` يحفظ البذر) |
| `POST /api/ai/run`, `GET /api/ai/quota` | **لا يُرحَّلان محليًا** | — (الحصص في العامل) | يذهبان مباشرة إلى عامل Cloudflare (MANUAL_STEPS §أ.7)؛ جدولا `AiCache`/`AiUsage` خاصتان بالويب ولا حاجة لهما في الأصل |

**قاعدة عامة عند الشك**: افتح ملف المسار في `src/app/api/...` — جسم كل handler صغير ومحدد، والاستعلامات Prisma قابلة للترجمة إلى SQL يدويًا بسهولة (لا توجد استعلامات مركبة معقدة خارج `stats/load/summary` المذكورة، ومنطق حسابها متوفر في `src/lib/logic/`).

## 3. تبديل طبقة النقل (الخطوة الأهم)

في `src/lib/api.ts` (نفس التوقيعات، لا تغيير في أي مستدعٍ):

```
request(path, init) {
  if (native SQLite bridge handles path) → نفّذ العملية المقابلة من جدول §2
                                  → أعد نفس الـ envelope { ok:true, data } / { ok:false, error }
  else → fetch كما هو (لا يتبقى سوى نداءا AI في use-ai.ts — يُفصلان في MANUAL_STEPS §أ.7)
}
```

- التنفيذ العملي: خريطة `path → handler` (regex بسيط على المسار + method) تستدعي `CapacitorSQLite` — أو استخدم إطار عمل بسيط لتوليد CRUD من تعريف الجدول.
- **استثناء وحيد خارج api.ts**: نداءا AI في `src/components/ai/use-ai.ts` (موثقان بالاسم في MANUAL_STEPS §أ.7) — يوجّهان للعامل مباشرة.
- أضف حزمة ترحيل منسدلة واحدة `ensureSeed()` تعمل فوق الجسر عند أول تشغيل (صف قفل `seed:v1` في `Settings` كما في الويب).

## 4. الإشعارات الأصلية (الميزة الأكبر المكتسبة)

- **الجدولة**: عند حفظ/تعديل عادة بوقت تذكير (`Habits.reminderTime "HH:MM"`) أو مهمة بموعد (`Tasks.dueAt`) → `LocalNotifications.schedule()` بالمعرفات المستقرة (نفس معرف السجل) — والإلغاء عند الحذف.
- **أندرويد 13+ (API 33)**: إذن تشغيلي — `LocalNotifications.requestPermissions()` قبل أول جدولة؛ الرفض = تذكيرات صامتة (أخبر المستخدم داخل الشاشة — نفس صدق الويب).
- **أندرويد 14+ (API 34)**: للمواعيد الدقيقة (`scheduleExact`) يلزم `SCHEDULE_EXACT_ALARM` في الـ manifest + توجيه المستخدم لإعدادات «المنبّهات والتذكيرات» إن رفض النظام. بديل مبتذل لكن مقبول: `USE_EXACT_ALARM` (مخصص لتطبيقات جوهرها تنبيهات — **تحقّق من موقف Google الحالي وقت الرفع**؛ سوء استخدامه سبب رفض شائع في المراجعة).
- **قنوات**: أنشئ قناتين عربيتين (تذكيرات العادات / مهام) بأهمية DEFAULT — بلا صوت مزعج ولا أولوية مبالغ فيها.
- إعادة الجدولة بعد إعادة تشغيل الجهاز: استمع لـ `@capacitor/app` `appStateChange`/boot أو أعد الجدولة عند كل فتح (خيار ASTNUM: أعد الجدولة عند كل إقلاع — بسيط وموثوق لعدد تذكيرات معقول).

## 5. تبديلات صغيرة معروفة

| الملف الحالي | التبديل الأصلي |
|---|---|
| `src/lib/haptics.ts` | `@capacitor/haptics`: `light/medium/heavy → ImpactStyle.Light/Medium/Heavy`، `success → notification(Success)`، `pr → impact(Heavy) ×2` بفاصل 150ms (أو نمط JNI مخصص — وثّق اختيارك) |
| `src/components/gym/rest-timer.tsx` (Wake Lock) | `@capacitor-community/keep-awake` أثناء الجلسة النشطة + المؤقّت (نفس الاستمرارية) |
| `src/components/nutrition/barcode-sheet.tsx` (BarcodeDetector) | إضافة الباركود (ML Kit) — نفس تدفق الإدخال اليدوي يبقى أساسًا؛ الكاميرا تصبح ميزة مضمّنة أصلية |
| `src/components/body/photos.tsx` (data URL) | `@capacitor/filesystem` (`Directory.Data`) + `WebView Capacitor.convertFileSrc()` للعرض |

## 6. البناء والتوقيع — الأوامر بالترتيب

> الشرح الكامل للمفتاح والسياسات في MANUAL_STEPS §ج/§د — هذا التسلسل التنفيذي المختصر.

```bash
# (مرة واحدة) بعد إعداد capacitor.config.ts وإنجاز المسار الثابت:
bun install
bun add @capacitor/core @capacitor/cli @capacitor/android
bunx cap add android

# كل دورة تطوير:
bun run build:static        # (أضف سكربت: next build مع output:'export')
bunx cap sync android       # ينسخ out/ → android/app/src/main/assets/public + يحدّث الإضافات

# فتح Android Studio (أول مرة لضمان SDK):
bunx cap open android

# من مجلد android/:
cd android
./gradlew assembleDebug     # APK تجريبي → app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease     # AAB نشر   → app/build/outputs/bundle/release/app-release.aab
```

### signing داخل `android/app/build.gradle`

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../../astnum-upload.keystore')   // خارج android/ — ولا يُرفع لـ git أبدًا
            storePassword System.getenv("ASTNUM_STORE_PASS")
            keyAlias "astnum-upload"
            keyPassword System.getenv("ASTNUM_KEY_PASS")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false    # ابدأ false؛ فعّلها + shrinkResources بعد أول نشر ناجح إن أردت
        }
    }
    defaultConfig {
        versionCode 1
        versionName "0.1.0"
    }
}
```

### SDK levels داخل `android/variables.gradle`

```gradle
ext {
    minSdkVersion = 26                  // قرار ASTNUM (Android 8.0)
    targetSdkVersion = <تحقّق من متطلب Play الحالي وقت البناء — MANUAL_STEPS §د.5>
    compileSdkVersion = <>= targetSdkVersion>
}
```

### فحص نهائي قبل الرفع

```bash
cd android
./gradlew bundleRelease
java -jar bundletool.jar validate --bundle app/build/outputs/bundle/release/app-release.aab
keytool -list -v -keystore ../astnum-upload.keystore -alias astnum-upload | grep -i sha256
```

ثم ارفع `app-release.aab` إلى Internal testing → Pre-launch report → إكمال قائمة MANUAL_STEPS §ز.

---

## 7. ماذا يحدث للبيانات الموجودة في نسخة الويب إن كنت مستخدمًا لها الآن؟

بصراحة: **لا توجد أداة ترحيل ويب→أصل جاهزة في المستودع**. إن كانت لديك بيانات في `db/custom.db` تريد نقلها:

1. افتح ملف SQLite بأي أداة، وصدّر الجداول إلى CSV/JSON (أو استخدم تصدير CSV المدمج لجدول القياسات فقط).
2. في النسخة الأصلية: وظيفة استيراد واحدة (مثل `POST /api/body/import` الموجود للقياسات — وسّعها لتشمل بقية الجداول) تقرأ الملف وتملأ نفس الجداول.
3. هذه وظيفة لم تُكتب بعد — مذكورة هنا حتى لا تفاجأ، وهي عمل صغير ومحدد مقارنة ببقية الطبقة.
