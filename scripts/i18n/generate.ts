/**
 * ASTNUM — translation pipeline (i18n generator, v1.20).
 *
 * Generates professional UI translations for every registered language by
 * batching the English base dictionary through the LLM (z-ai-web-dev-sdk,
 * backend-side). Output: one lazy TS chunk per language under
 * src/lib/i18n/generated/, plus a regenerated generated/index.ts registry.
 *
 * Tiers:
 *   FULL  — entire dictionary (~1,200 keys) for the 16 most-used languages.
 *   CORE  — the highest-visibility ~450 keys for every remaining language;
 *           untranslated keys gracefully fall back to English at runtime.
 *
 * Quality guardrails on every batch:
 *   • exact key-set match (nothing dropped, nothing invented)
 *   • {{placeholder}} preservation (multiset compare)
 *   • non-empty, sane-length values
 *   • 3 attempts with error feedback, then the batch is skipped & resumable
 *
 * Resume: per-batch state in scripts/i18n/out/state.json — re-running skips
 * everything already generated, so the pipeline can be interrupted freely.
 *
 * Usage:
 *   bun scripts/i18n/generate.ts               # full run (all languages)
 *   bun scripts/i18n/generate.ts --only de fr  # specific languages
 *   bun scripts/i18n/generate.ts --limit 5     # first N pending languages
 *   bun scripts/i18n/generate.ts --status      # progress report only
 *   bun scripts/i18n/generate.ts --workers 3   # concurrency (default 2)
 */

import ZAI from "z-ai-web-dev-sdk";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(__dirname, "out");
const GEN_DIR = join(ROOT, "src", "lib", "i18n", "generated");
const STATE_FILE = join(OUT_DIR, "state.json");

/* ── source dictionaries + registry (imported from the app itself) ───── */

import { BASE_DICTS } from "../../src/lib/i18n/dictionaries";
import { LANGUAGES } from "../../src/lib/i18n/languages";

const EN = BASE_DICTS.en;

/* ── configuration ─────────────────────────────────────────────────── */


/** Registry entries with no own chunk (fully covered by their fallback). */
const SKIP_LANGS = new Set<string>([]);


const BATCH_SIZE = 250;
const MAX_ATTEMPTS = 5;

/** Script/dialect guidance for languages where it matters. */
const LANG_NOTES: Record<string, string> = {
  zh: "Simplified Chinese, Mainland China conventions (简体中文).",
  "zh-Hant": "Traditional Chinese, Taiwan conventions (繁體中文，臺灣用語).",
  yue: "Written Cantonese in Traditional characters with natural Cantonese wording (嘅、唔、喺) where appropriate for UI.",
  nan: "Min Nan (Hokkien) rendered in Traditional Chinese characters reflecting Hokkien vocabulary.",
  hak: "Hakka rendered in Traditional Chinese characters reflecting Hakka vocabulary.",
  wuu: "Wu Chinese (Shanghainese) in Chinese characters reflecting Wu vocabulary.",
  nb: "Norwegian Bokmål.",
  ms: "Bahasa Melayu (Malaysian standard), distinct from Indonesian.",
  tl: "Filipino (standard Tagalog-based national language).",
  ha: "Hausa in Latin script (boko orthography).",
  ff: "Fulfulde in Latin script.",
  sr: "Serbian in Cyrillic script.",
  uz: "Uzbek in the current Latin orthography.",
  kk: "Kazakh in Cyrillic script.",
  mn: "Mongolian in Cyrillic script.",
  tg: "Tajik in Cyrillic script.",
  ba: "Bashkir in Cyrillic script.",
  tt: "Tatar in Cyrillic script.",
  ce: "Chechen in Cyrillic script.",
  os: "Ossetian in Cyrillic script (Iron dialect).",
  sgh: "Shughni (Pamir) in Cyrillic-based orthography.",
  lbj: "Ladakhi (Bhoti) in Tibetan script.",
  ckb: "Central Kurdish (Sorani) in Arabic script.",
  pnb: "Western Punjabi in Shahmukhi (Arabic) script.",
  ks: "Kashmiri in Perso-Arabic script.",
  sd: "Sindhi in Arabic-Sindhi script.",
  ug: "Uyghur in Arabic script (UEY).",
  bo: "Tibetan in Uchen script.",
  sa: "Sanskrit in Devanagari, classical but clear for UI use.",
  eo: "Esperanto, standard Fundamenta vocabulary.",
  zgh: "Standard Moroccan Tamazight in Tifinagh script.",
  tzm: "Central Atlas Tamazight in Tifinagh script.",
  kab: "Kabyle in Latin script.",
  tmh: "Tamasheq in Tifinagh script.",
  nub: "Nubian (Nobiin) — Arabic script is acceptable.",
  dcr: "Negerhollands (Dutch Virgin Islands Creole) — reconstruct from Dutch/English/Akan elements as best documented.",
  tcs: "Torres Strait Creole (Yumplatok).",
  "es-MX": "Mexican Spanish — Mexican vocabulary and idioms.",
  "es-AR": "Argentine Spanish — voseo where natural for UI.",
  "pt-BR": "Brazilian Portuguese.",
  prs: "Dari (Afghan Persian) — Dari vocabulary differs from Iranian Persian.",
  pcm: "Nigerian Pidgin — natural Naijá wording.",
  mt: "Maltese (Semitic language written in Latin script).",
};

/* ── batch construction ────────────────────────────────────────────── */


/** Every language's planned key set — the FULL dictionary (v1.23 decision). */
function langKeys(_code: string): string[] {
  void _code;
  return Object.keys(EN).sort();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ── state ─────────────────────────────────────────────────────────── */

interface State {
  batches: Record<string, "done">; // `${code}#${idx}`
  languages: Record<string, "done" | "failed">;
}

function loadState(): State {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as State;
  } catch { /* fresh */ }
  return { batches: {}, languages: {} };
}

function saveState(state: State) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/* ── LLM ───────────────────────────────────────────────────────────── */

let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function client() {
  zai ??= await ZAI.create();
  return zai;
}

/* Global request pacing — the LLM endpoint 429s under concurrent load, so
 * every request start waits for the previous one + a small breathing gap. */
let lastRequestAt = 0;
let pacingMs = 1500;
async function pace(isRetry: boolean) {
  const now = Date.now();
  const wait = lastRequestAt + (pacingMs + (isRetry ? 4000 : 0)) - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

const SYSTEM_PROMPT = `You are a senior localization engineer translating the UI of a mobile app into many languages with professional, native quality.

The app — ASTNUM — is an all-in-one self-tracker:
• Habits: recurring activities with streaks, freezes and flexible schedules.
• Notes: notes + checklist tasks (todo) with tags, pinning and archive.
• Gym: weight-training log (exercises, sets, reps, weight, rest timer, workout templates, gym plan schedule).
• Body: weight & body measurements (body fat, muscle mass, waist…) + an interactive muscle heat map.
• Nutrition: daily calories/macros (protein, carbs, fat) logged by meal (breakfast, lunch, dinner, snack).
• 13 Android home-screen widgets + an instant statistics screen ("Analyst").

STRICT RULES:
1. Reply with STRICT JSON only — a single object mapping every given key to its translation. No markdown fences, no commentary, no extra keys.
2. Never rename, add, drop or reorder keys. Translate ONLY the string values.
3. Preserve {{placeholders}} (like {{count}}, {{name}}, {{value}}) EXACTLY as written — same names, same braces, same order.
4. Keys ending in _zero, _one, _two, _few, _many, _other are plural forms of the same phrase. Translate each variant so it is grammatical for that plural category in the target language. If the language does not make such distinctions, use the same natural wording for each variant.
5. Keep standalone emoji, and leading/trailing punctuation such as "…" or "•", exactly as in the source.
6. Terminology: use the standard, everyday terms for fitness/nutrition UI in the target language (e.g., reps = repetition count, sets, rest, volume = weight×reps, streak = consecutive days, kcal = calories). The brand name "ASTNUM" stays untranslated.
7. Tone: concise, friendly, professional. Button labels stay short (1–3 words where natural). Never add explanations inside strings.
8. Numbers/dates are formatted by the system — do not hardcode digit forms; translate words only.`;

function userPrompt(code: string, batch: Record<string, string>): string {
  const meta = LANGUAGES.find((l) => l.code === code)!;
  const notes = LANG_NOTES[code] ? `\nLanguage-specific guidance: ${LANG_NOTES[code]}` : "";
  const direction = meta.rtl ? "right-to-left" : "left-to-right";
  return `Target language: ${meta.english} (endonym: ${meta.native}); BCP-47 locale: ${meta.intl}; script direction: ${direction}.${notes}

Translate every value of this JSON object into ${meta.english}. Reply with the translated JSON object ONLY.
${JSON.stringify(batch)}`;
}

function extractJson(text: string): Record<string, string> | null {
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* fallthrough */ }
  return null;
}

/**
 * Tolerant pair scanner — pulls every `"key": "value"` pair out of the raw
 * reply even when the surrounding JSON has a syntax slip or is truncated.
 * Much more robust than whole-object JSON.parse for long replies.
 */
function extractPairs(text: string, wanted: Set<string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  const re = /"((?:[^"\\]|\\.)+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  let matched = 0;
  while ((m = re.exec(text))) {
    const k = m[1];
    const rawVal = m[2];
    if (!wanted.has(k)) continue;
    if (out[k] !== undefined) continue;
    try {
      out[k] = JSON.parse(`"${rawVal}"`);
    } catch {
      out[k] = rawVal;
    }
    matched++;
  }
  return matched > 0 ? out : null;
}

function placeholdersOf(text: string): string[] {
  return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

/** Validate a translated batch → list of human-readable problems. */
function validateBatch(
  source: Record<string, string>,
  out: Record<string, string>
): string[] {
  const problems: string[] = [];
  const srcKeys = Object.keys(source).sort();

  const missing = srcKeys.filter((k) => !(k in out));
  if (missing.length) problems.push(`missing keys (${missing.length}): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}`);
  const extra = Object.keys(out).filter((k) => !(k in source));
  if (extra.length) problems.push(`unknown keys: ${extra.slice(0, 8).join(", ")}`);

  for (const k of srcKeys) {
    const v = out[k];
    if (typeof v !== "string") { problems.push(`${k}: not a string`); continue; }
    if (source[k] === "") {
      // deliberate empty string (e.g. "hide when 0") — must stay empty
      if (v !== "") problems.push(`${k}: must stay an empty string`);
      continue;
    }
    if (v.trim().length === 0) { problems.push(`${k}: empty value`); continue; }
    if (v.length > source[k].length * 4 + 60) problems.push(`${k}: suspiciously long`);
    const srcP = placeholdersOf(source[k]).join(",");
    const outP = placeholdersOf(v).join(",");
    if (srcP !== outP) problems.push(`${k}: placeholders changed (${srcP} → ${outP})`);
  }
  return problems;
}

async function translateBatch(
  code: string,
  batch: Record<string, string>,
  opts: { noRepair?: boolean } = {}
): Promise<Record<string, string> | null> {
  const cli = await client();
  let feedback = "";
  const srcKeys = Object.keys(batch);
  const wanted = new Set(srcKeys);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await pace(attempt > 1);
      const completion = await cli.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              userPrompt(code, batch) +
              (feedback
                ? `\n\nYour previous reply had problems — FIX THEM and reply again:\n${feedback}`
                : ""),
          },
        ],
        thinking: { type: "disabled" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("empty completion");

      const parsed = extractPairs(raw, wanted) ?? extractJson(raw);
      if (!parsed) {
        console.error(
          `      ✗ attempt ${attempt}: unparseable reply (${raw.length} chars, tail: …${JSON.stringify(raw.slice(-60))})`
        );
        feedback =
          "Your previous reply was not valid JSON — most likely it was cut off or contained commentary. Reply with the COMPLETE JSON object only, starting with { and ending with }. Keep translations concise so the reply fits.";
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }

      let problems = validateBatch(batch, parsed);

      /* Auto-repair: if the only problem is a handful of missing keys
       * (classic truncation), translate just those keys in one mini call
       * instead of throwing away 90% of good work. */
      if (
        problems.length > 0 &&
        problems.every((p) => p.startsWith("missing keys")) &&
        !opts.noRepair
      ) {
        const missing = srcKeys.filter((k) => !(k in parsed));
        if (missing.length > 0 && missing.length <= 40) {
          console.log(`      ↙ repairing ${missing.length} missing keys in a mini call…`);
          const mini: Record<string, string> = {};
          for (const k of missing) mini[k] = batch[k];
          const sub = await translateBatch(code, mini, { noRepair: true });
          if (sub) {
            Object.assign(parsed, sub);
            problems = validateBatch(batch, parsed);
          }
        }
      }

      if (problems.length === 0) return parsed;

      feedback = problems.slice(0, 12).map((p) => `- ${p}`).join("\n");
      console.error(`      ✗ attempt ${attempt}: ${problems.length} problems, retrying…`);
      for (const p of problems.slice(0, 6)) console.error(`        · ${p}`);
    } catch (e) {
      const msg = (e as Error).message;
      const isRateLimit = msg.includes("429");
      console.error(`      ✗ attempt ${attempt} failed: ${msg}`);
      if (isRateLimit) {
        pacingMs = Math.min(pacingMs * 2, 30000); // back off globally, let a retry absorb it
        console.error(`        (rate-limited — pacing raised to ${pacingMs}ms)`);
        await new Promise((r) => setTimeout(r, pacingMs));
      }
      feedback = "";
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  pacingMs = Math.max(1500, pacingMs / 2);

  /* All attempts failed — salvage by splitting the batch in halves so each
   * half fits comfortably inside the output limit. */
  if (srcKeys.length > 60) {
    console.log(`      ↯ splitting batch (${srcKeys.length} keys → two halves) and retrying…`);
    const mid = Math.ceil(srcKeys.length / 2);
    const halves = [srcKeys.slice(0, mid), srcKeys.slice(mid)].map((ks) =>
      Object.fromEntries(ks.map((k) => [k, batch[k]]))
    );
    const results = await Promise.all(halves.map((h) => translateBatch(code, h, opts)));
    const merged: Record<string, string> = {};
    let ok = true;
    for (const r of results) {
      if (!r) ok = false;
      else Object.assign(merged, r);
    }
    return ok ? merged : null;
  }
  return null;
}

/* ── generated-file emission ───────────────────────────────────────── */

function emitLanguage(code: string, merged: Record<string, string>) {
  mkdirSync(GEN_DIR, { recursive: true });
  const header =
    `/* AUTO-GENERATED by scripts/i18n/generate.ts — ${new Date().toISOString().slice(0, 10)}.\n` +
    ` * Language: ${code}. DO NOT hand-edit: rerun the pipeline instead. */\n` +
    `const dict: Record<string, string> = {\n`;
  const body = Object.keys(merged)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(merged[k])},`)
    .join("\n");
  writeFileSync(join(GEN_DIR, `${code}.ts`), header + body + "\n};\n\nexport default dict;\n");
}

const STATE = loadState();

/**
 * PATCH PASS — completes every emitted language's missing keys (added to the
 * base dictionary after that language was generated). Merges the translated
 * keys into the existing chunk, rewrites its resume-cache batch files so a
 * future regeneration stays coherent, and refreshes generated/index.ts.
 */
async function patchDoneLanguages(): Promise<void> {
  const codes = chunkedLanguages().filter((c) => c !== "en" && c !== "ar");
  console.log(`\nASTNUM i18n patch — checking ${codes.length} emitted language(s) for missing keys`);
  let patched = 0, clean = 0, failed = 0;

  for (const code of codes) {
    const meta = LANGUAGES.find((l) => l.code === code);
    if (!meta) { console.log(`· ${code} — not in the registry, skipped`); continue; }
    const tier = langKeys(code);
    const chunkPath = join(GEN_DIR, `${code}.ts`);
    let existing: Record<string, string> = {};
    try {
      existing = ((await import(chunkPath)).default ?? {}) as Record<string, string>;
    } catch { existing = {}; }
    const missing = tier.filter((k) => existing[k] === undefined);

    if (missing.length === 0) {
      clean++;
      console.log(`✓ ${code} — already complete (${Object.keys(existing).length} keys)`);
      continue;
    }
    console.log(`▶ ${code} — ${existing.length} keys, missing ${missing.length} → LLM…`);
    const batch: Record<string, string> = {};
    for (const k of missing) batch[k] = EN[k];
    const result = await translateBatch(code, batch);
    if (!result) {
      failed++;
      console.error(`⨯ ${code} patch FAILED after ${MAX_ATTEMPTS} attempts`);
      continue;
    }
    const merged = { ...existing, ...result };
    emitLanguage(code, merged);
    STATE.languages[code] = "done";

    // keep the resume cache coherent with the widened chunk
    const batches = chunk(tier, BATCH_SIZE);
    mkdirSync(OUT_DIR, { recursive: true });
    batches.forEach((batchKeys, i) => {
      const obj: Record<string, string> = {};
      let have = 0;
      for (const k of batchKeys) {
        if (merged[k] !== undefined) { obj[k] = merged[k]; have++; }
      }
      if (have > 0) {
        writeFileSync(join(OUT_DIR, `${code}.${i}.json`), JSON.stringify(obj, null, 1));
        STATE.batches[`${code}#${i}`] = "done";
      }
    });
    saveState(STATE);
    patched++;
    console.log(`✓ ${code} patched +${missing.length} → ${Object.keys(merged).length} keys`);
  }
  regenIndex();
  console.log(`\npatch finished — ${patched} patched, ${clean} already complete, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 2;
}

/**
 * Languages with an emitted chunk on disk — the source of truth for the
 * index. Scanning the directory (NOT state.json) keeps concurrent runs,
 * hand-repairs and resume tricks from ever dropping a language here.
 */
function chunkedLanguages(): string[] {
  try {
    return readdirSync(GEN_DIR)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
}

function regenIndex() {
  const doneLangs = chunkedLanguages();

  const loaders = doneLangs
    .map((c) => `  ${JSON.stringify(c)}: () => import(${JSON.stringify(`./${c}`)}),`)
    .join("\n");
  const counts = doneLangs
    .map((c) => {
      const src = readFileSync(join(GEN_DIR, `${c}.ts`), "utf-8");
      const n = (src.match(/^\s{2}"/gm) ?? []).length;
      return `  ${JSON.stringify(c)}: ${n},`;
    })
    .join("\n");

  const content =
    `/* AUTO-GENERATED by scripts/i18n/generate.ts — lazy per-language chunks.\n` +
    ` * ${doneLangs.length} language dictionaries generated so far. */\n\n` +
    `import type { Dict } from "../dictionaries";\n\n` +
    `/** code → lazy chunk loader */\n` +
    `export const GENERATED_LOADERS: Record<string, () => Promise<{ default: Dict }>> = {\n${loaders}\n};\n\n` +
    `/** code → number of translated keys (for coverage badges) */\n` +
    `export const GENERATED_KEY_COUNTS: Record<string, number> = {\n${counts}\n};\n`;
  writeFileSync(join(GEN_DIR, "index.ts"), content);
}

/* ── engine ────────────────────────────────────────────────────────── */

async function processLanguage(code: string): Promise<"done" | "failed"> {
  const keys = langKeys(code);
  const batches = chunk(keys, BATCH_SIZE);
  const meta = LANGUAGES.find((l) => l.code === code)!;

  console.log(`\n▶ ${code} — ${meta.english} (${meta.native}) — ${keys.length} keys, ${batches.length} batch(es)`);

  const merged: Record<string, string> = {};
  let allOk = true;

  for (let i = 0; i < batches.length; i++) {
    const stateKey = `${code}#${i}`;

    // resume from a previous run
    const prevPath = join(OUT_DIR, `${code}.${i}.json`);
    if (STATE.batches[stateKey] === "done" && existsSync(prevPath)) {
      try {
        Object.assign(merged, JSON.parse(readFileSync(prevPath, "utf-8")) as Record<string, string>);
        console.log(`   batch ${i + 1}/${batches.length}: cached ✓`);
        continue;
      } catch { /* regenerate */ }
    }

    const batch: Record<string, string> = {};
    for (const k of batches[i]) batch[k] = EN[k];

    console.log(`   batch ${i + 1}/${batches.length}: ${Object.keys(batch).length} keys → LLM…`);
    const t0 = Date.now();
    const result = await translateBatch(code, batch);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);

    if (!result) {
      console.error(`   ✗ batch ${i + 1} FAILED after ${MAX_ATTEMPTS} attempts (${secs}s)`);
      allOk = false;
      continue;
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(prevPath, JSON.stringify(result, null, 1));
    STATE.batches[stateKey] = "done";
    saveState(STATE);
    Object.assign(merged, result);
    console.log(`   ✓ batch ${i + 1} done in ${secs}s`);
  }

  if (!allOk || Object.keys(merged).length === 0) {
    STATE.languages[code] = "failed";
    saveState(STATE);
    console.error(`⨯ ${code} FAILED (partial)`);
    return "failed";
  }

  emitLanguage(code, merged);
  STATE.languages[code] = "done";
  saveState(STATE);
  regenIndex();
  console.log(`✓ ${code} complete — ${Object.keys(merged).length} keys emitted`);
  return "done";
}

/* ── CLI ───────────────────────────────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const only: string[] = [];
  let limit = Infinity;
  let workers = 2;
  let status = false;
  let patch = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--only") {
      i++;
      while (i < args.length && !args[i].startsWith("--")) only.push(args[i++]);
      i--;
    } else if (args[i] === "--limit") limit = Number(args[++i]);
    else if (args[i] === "--workers") workers = Number(args[++i]);
    else if (args[i] === "--status") status = true;
    else if (args[i] === "--patch") patch = true;
  }
  return { only, limit, workers, status, patch };
}

const { only, limit, workers, status, patch } = parseArgs();

if (patch) {
  await patchDoneLanguages();
  process.exit(0);
}

const queue = LANGUAGES.filter((l) => {
  const code = l.code;
  if (code === "en" || code === "ar") return false; // built-in
  if (SKIP_LANGS.has(code)) return false;
  if (STATE.languages[code] === "done") return false;
  if (only.length && !only.includes(code)) return false;
  return true;
}).map((l) => l.code);

const doneCount = Object.values(STATE.languages).filter((s) => s === "done").length;

if (status) {
  console.log(`\nASTNUM i18n pipeline status`);
  console.log(`  base keys (en): ${Object.keys(EN).length}`);
  console.log(`  full keys per language: ${Object.keys(EN).length}`);
  console.log(`  languages done: ${doneCount}`);
  console.log(`  languages pending: ${queue.length}${only.length ? " (filtered)" : ""}`);
  for (const c of queue.slice(0, 30)) console.log(`    · ${c} — ${LANGUAGES.find((l) => l.code === c)?.english}`);
  process.exit(0);
}

if (queue.length === 0) {
  console.log("\nNothing to do — all languages generated. (Use --only <code> to regenerate, or clear state.json.)");
  process.exit(0);
}

console.log(`\nASTNUM i18n pipeline`);
console.log(`  base keys (en): ${Object.keys(EN).length}`);
console.log(`  full keys per language: ${Object.keys(EN).length}`);
console.log(`  queue: ${Math.min(queue.length, limit)} languages, ${workers} worker(s)`);
console.log(`  resume state: ${Object.keys(STATE.batches).length} batches cached, ${doneCount} languages done`);

const runQueue = queue.slice(0, limit);
let cursor = 0;
let okCount = 0;

async function worker(_id: number) {
  while (cursor < runQueue.length) {
    const code = runQueue[cursor++];
    const res = await processLanguage(code);
    if (res === "done") okCount++;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(workers, runQueue.length) }, (_, i) => worker(i)));
const mins = ((Date.now() - t0) / 60000).toFixed(1);

console.log(`\n══════════════════════════════════════`);
console.log(`pipeline finished in ${mins} min — ${okCount}/${runQueue.length} languages generated`);
console.log(`total languages done: ${doneCount + okCount}`);
if (queue.length > runQueue.length) console.log(`(more pending — rerun the same command to continue)`);
process.exitCode = okCount === runQueue.length ? 0 : 2;
