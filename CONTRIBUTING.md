# Contributing to ASTNUM

First off, thank you for considering a contribution! 🎉 ASTNUM is a
community-driven, open-source self-tracker — every contribution counts:
code, translations, docs, bug reports and ideas.

## Ways to help

| Area | How |
| --- | --- |
| 🌍 **Translations** (highest impact!) | Improve any of the [167 languages](src/lib/i18n/languages.ts) — see below |
| 🐛 **Bugs** | [Open an issue](../../issues/new?template=bug_report.md) with reproduction steps |
| 💡 **Features** | [Open a feature request](../../issues/new?template=feature_request.md) first, then discuss |
| 📖 **Docs** | Typos, clarifications, new guides — small PRs are perfect |
| 🔧 **Code** | Pick an issue labeled `good first issue` / `help wanted` |

## Setting up a development environment

```bash
git clone https://github.com/btwstar/astnum.git
cd astnum
bun install
bun run db:push       # create the local SQLite database
bun run dev           # http://localhost:3000
```

You need [Bun](https://bun.sh) ≥ 1.2. For the Android build see
[docs/capacitor/APK_PIPELINE.md](docs/capacitor/APK_PIPELINE.md).

## Working on translations

The translation system:

- **English** (`src/lib/i18n/locales/en/`) is the base — every key must exist there.
- **Arabic** (`src/lib/i18n/locales/ar/`) is hand-maintained and complete.
- Every other language lives in `src/lib/i18n/generated/<code>.ts` —
  produced by the pipeline and reviewed by humans.

To (re)generate a language or fix a batch:

```bash
bun scripts/i18n/generate.ts --status        # see what's pending
bun scripts/i18n/generate.ts --only de       # (re)generate German
```

The pipeline validates key parity and placeholders automatically, but
**native-speaker review is irreplaceable**. If you spot a bad string:

1. Edit `src/lib/i18n/generated/<code>.ts` directly (it's committed —
   manual fixes win over regeneration), **or**
2. Delete the language's batches from `scripts/i18n/out/state.json` and
   regenerate, **or**
3. Open a PR with the corrected strings — screenshots help a lot.

Adding a brand-new language:

1. Add an entry to `src/lib/i18n/languages.ts`
   (code, English name, native endonym, BCP-47 locale, RTL flag).
2. Run `bun scripts/i18n/generate.ts --only <code>`.
3. Verify in the app: Settings → Languages → pick it, check digits/dates.
4. PR it 🎉.

## Code conventions

- **TypeScript everywhere**, strict typing — `bunx tsc --noEmit` and
  `bun run lint` must pass.
- UI text **never hardcoded**: use `const { t } = useI18n()` and
  `t("namespace.key")`.
- Layouts use **logical properties** (`ms-`, `me-`, `ps-`, `pe-`,
  `text-start/end`) so RTL works automatically.
- Data access goes through `src/lib/api.ts` (`apiGet/apiPost/...`) —
  screens never touch Prisma directly.
- Every module screen: default export from `src/components/<module>/index.tsx`.
- Icons: `lucide-react` only. Components: prefer `src/components/ui/*` (shadcn).
- Semantic colors (`text-success`, `bg-warning/15`, `text-danger`) over raw colors.
- Touch targets ≥ 44px (`min-h-11`).

## Pull requests

1. Fork → branch (`feat/my-feature` or `fix/my-bug`).
2. Keep PRs small and focused; describe **what & why**.
3. Run `bun run lint` and make sure the dev server compiles cleanly.
4. Reference the issue (`Closes #12`).
5. For visual changes, add before/after screenshots.

A maintainer will review as soon as possible. Be kind, be patient 💚
