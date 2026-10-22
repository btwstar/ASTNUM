# النشر على GitHub — دليلك خطوة بخطوة 🚀

> هذا الملف يرافق ملف `ASTNUM-source-v1.24.zip`. اتبع الخطوات أدناه وسيصبح
> التطبيق مشروعًا منشورًا على حسابك خلال دقائق.

## ماذا يوجد داخل ملف الـZIP؟

عند فك الضغط ستحصل على مجلد واحد `astnum/` يضم **المشروع كاملًا وجاهزًا**:

```
astnum/
├─ README.md            ← الصفحة الرئيسية للمستودع (بالإنجليزية)
├─ README.ar.md          ← النسخة العربية
├─ LICENSE               ← رخصة MIT باسمك (btwstar)
├─ CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
├─ .github/              ← قوالب المشاكل + سير CI (اختبارات تلقائية) + dependabot
├─ src/                  ← كل كود التطبيق + سجل الـ160 لغة وقواميسها المولّدة (src/lib/i18n)
├─ android-app/          ← مشروع أندرويد كامل (19 ودجة أصلية + نافذة الإضافة السريعة + الأيقونة)
├─ prisma/ · scripts/ · docs/ · assets/brand/ · docs/screenshots/ · public/quickadd/
└─ package.json …
```

**مستثنى عمدًا** (يُعاد توليده أو خاص بك): `node_modules` · `.next` · قاعدة
بياناتك المحلية `db/` · مخرجات بناء gradle · سلسلة أدوات JDK (يجهزها
`scripts/toolchain-setup.sh`).

## الطريقة 1 — من الويب (الأسهل، بدون أي أوامر)

1. أنشئ مستودعًا جديدًا على GitHub باسم مثل `astnum` (بدون README مبدئيًا).
2. فك ضغط `ASTNUM-source-v1.24.zip`.
3. من صفحة المستودع الجديد اضغط **"uploading an existing file"** (أو
   **Add file → Upload files**).
4. اسحب **كل ما داخل مجلد `astnum/`** (وليس المجلد نفسه — الملفات
   مباشرة: README.md، src، android-app…).
5. اكتب رسالة إيداع مثل `ASTNUM v1.24 — 160 languages, 19 widgets, water tracking, open source 🎉`
   واضغط **Commit changes**.

✅ انتهى — CI (`.github/workflows/ci.yml`) سيعمل تلقائيًا على أول إيداع
(اختبارات lint + typecheck + build).

## الطريقة 2 — من سطر الأوامر (للمطورين)

```bash
cd astnum
git init -b main
git add -A
git commit -m "ASTNUM v1.24 — 160 languages, 19 widgets, water tracking, open source"
# أنشئ المستودع على GitHub ثم:
git remote add origin https://github.com/<username>/astnum.git
git push -u origin main
```

## خطوات منشورة يوصى بها (اختيارية لكن أنيقة)

| الخطوة | كيف |
| --- | --- |
| **الوصف والمواضيع** | في Settings → Description: `Habits · Notes · Workouts — offline-first, 160 languages, 19 home widgets` — وأضف topics مثل `fitness`, `habits`, `nextjs`, `capacitor`, `android` |
| **الصورة الاجتماعية** | Settings → Social preview → ارفع `assets/brand/banner.png` (1280×640) |
| **عنوان موقع المستودع** | Settings → Pages → من فرع main/مجلد docs (اختياري) |
| **الإصدارات** | Releases → **Draft a new release** → وسم `v1.24.0` + أرفق ملف الـAPK `ASTNUM-v1.24-debug.apk` (من إعدادات التطبيق نفسه أو مجلد download) — سيظهر زر التحميل في الصفحة الرئيسية |
| **الحماية** | Settings → Code security → فعّل Dependabot alerts (ملف dependabot جاهز أصلًا) |
| **الرعاية** | حرر `.github/FUNDING.yml` بروابطك إن رغبت |

## قبل النشر — تحقق سريع (اختياري)

```bash
cd astnum
bun install
cp .env.example .env # مرة واحدة — مسار قاعدة البيانات المحلية
bun run db:push     # ينشئ قاعدة بياناتك المحلية من prisma/schema.prisma
bun run dev         # http://localhost:3000 — جرّب اللغات من الإعدادات!
bun run lint        # يجب أن يمر نظيفًا
```

لبناء نسخة APK جديدة بهذه اللغات: `bash scripts/build-apk.sh` (راجع
`docs/capacitor/APK_PIPELINE.md` لمتطلبات JDK/SDK).

## إضافة لغات جديدة بعد النشر

```bash
bun scripts/i18n/generate.ts --status    # ما المتبقي
bun scripts/i18n/generate.ts --only xx    # توليد/تحديث لغة
```
ثم commit + push — CI يتأكد أن كل شيء يبني سليمًا.

---

صدر بموجب رخصة MIT — © 2026 btwstar. استمتع، وساعد المجتمع بالنجوم ⭐
