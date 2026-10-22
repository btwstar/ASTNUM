# التوثيق — الفهرس | Documentation index

> الوثائق أدناه مرتبة حسب أولوية الاستخدام. أغلبها عربي أولًا (لغة المشروع الأساسية للمؤلف)، وبعضها إنجليزي — موضّح أمام كل ملف.
> Documentation is Arabic-first (the author's primary language); file languages are marked below.

## 📚 الملفات الرئيسية

| الملف | اللغة | ماذا يقدم |
| --- | --- | --- |
| [MANUAL_STEPS.md](MANUAL_STEPS.md) | عربي | ★ خريطة كل خطوة يدوية لا يمكن أتمتتها: مفتاح التوقيع Keystore، بناء APK/AAB، RevenueCat، Play Integrity، قائمة فحص Play Console، Health Connect، Open Food Facts، استضافة سياسة الخصوصية |
| [PRIVACY.md](PRIVACY.md) | عربي | مسودة سياسة الخصوصية الجاهزة للنشر (أندرويد + ويب ذاتي الاستضافة) |
| [PUBLISH_TO_GITHUB.md](PUBLISH_TO_GITHUB.md) | عربي | خطوات نشر هذا المصدر كمستودع GitHub عام (ويب أو سطر أوامر) + الخطوات المنشورة الموصى بها |
| [DESIGN.md](../DESIGN.md) | عربي | نظام التصميم الكامل (الألوان، الطباعة، الحركة، الوصولية) — في جذر المستودع |

## 📱 الأندرويد — `capacitor/`

| الملف | اللغة | ماذا يقدم |
| --- | --- | --- |
| [capacitor/APK_PIPELINE.md](capacitor/APK_PIPELINE.md) | English | خط الـAPK الكامل: تصدير ثابت → cap sync → gradle assembleDebug + المتطلبات |
| [capacitor/ANDROID_BUILD.md](capacitor/ANDROID_BUILD.md) | English | دليل البناء والتوقيع (release keystore → AAB) + جدول ترحيل API → SQLite |
| [capacitor/capacitor.config.example.ts](capacitor/capacitor.config.example.ts) | — | مثال إعداد Capacitor قابل للنسخ |

## 🏪 متجر Google Play — `play/`

| الملف | اللغة | ماذا يقدم |
| --- | --- | --- |
| [play/store-listing.md](play/store-listing.md) | عربي + English | نصوص صفحة المتجر كاملة (العنوان، الوصف القصير/الطويل، ما الجديد) باللغتين |
| [play/feature-graphic-1024x500.svg](play/feature-graphic-1024x500.svg) | — | مصدر رسم المتجر (feature graphic) |
| [play/icon-1024.svg](play/icon-1024.svg) | — | مصدر أيقونة المتجر عالية الدقة |

## 🖼 لقطات الشاشة — `screenshots/`

اللقطات التي يستخدمها [`README.md`](../README.md) و [`README.ar.md`](../README.ar.md): شاشات اليوم/العادات/التمارين/خريطة العضلات/الأكل (داكن)، بطاقة تتبّع الماء ومحرّر التقويم (عربي RTL)، منتقي اللغات، ونسخ فاتحة + صينية إضافية.

## 🔗 روابط ذات صلة

- [README.ar.md](../README.ar.md) — نظرة عامة عربية كاملة (خريطة الشاشات، الودجات الـ19، قاعدة البيانات، حدود صادقة)
- [CONTRIBUTING.md](../CONTRIBUTING.md) — دليل المساهمة (الترجمات أسهل نقطة دخول)
- [CHANGELOG.md](../CHANGELOG.md) — سجل التغييرات التفصيلي
