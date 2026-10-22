## 📝 Summary

<!-- What does this PR do, and why? One or two sentences. -->

## 🔗 Related issue

<!-- e.g. "Closes #12". If none, delete this section. -->

## 📸 Screenshots / clips

<!-- For visual changes — before/after really helps reviewers. -->

## ✅ Checklist

- [ ] `bun run lint` passes and the dev server compiles cleanly
- [ ] UI strings use `t("namespace.key")` — nothing hardcoded
- [ ] Layouts use logical properties (`ms-`/`me-`/`text-start`) so RTL keeps working
- [ ] Data access goes through `src/lib/api.ts` (screens never touch Prisma directly)
- [ ] Translation dictionaries updated if I added/changed keys
      (`bun scripts/i18n/generate.ts --only <code>` for generated languages)

## 🌍 Language impact

<!-- Which languages are affected? New keys added? Plural forms considered? -->
