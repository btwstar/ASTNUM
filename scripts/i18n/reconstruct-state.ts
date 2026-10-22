/**
 * Reconstructs the i18n pipeline resume state from the generated chunks that
 * already exist under src/lib/i18n/generated/ (their state.json + out/*.json
 * batch cache were lost). Re-chunks each existing dictionary exactly like
 * generate.ts would (sorted keys → 250-key batches) so a hypothetical
 * regeneration also resumes per-batch, and marks every present chunk as a
 * done language. Prints a summary. Safe to run repeatedly (idempotent).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(__dirname, "out");
const GEN_DIR = join(ROOT, "src", "lib", "i18n", "generated");
const STATE_FILE = join(OUT_DIR, "state.json");
const BATCH = 250;

interface State {
  batches: Record<string, "done">;
  languages: Record<string, "done" | "failed">;
}

const state: State = { batches: {}, languages: {} };
if (existsSync(STATE_FILE)) {
  try {
    Object.assign(state, JSON.parse(readFileSync(STATE_FILE, "utf-8")) as State);
  } catch { /* rebuild from scratch */ }
}

mkdirSync(OUT_DIR, { recursive: true });

const chunks = readdirSync(GEN_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts");
let reconstructed = 0;

for (const file of chunks) {
  const code = file.replace(/\.ts$/, "");
  const mod = await import(join(GEN_DIR, file));
  const dict = (mod.default ?? {}) as Record<string, string>;
  const keys = Object.keys(dict).sort();
  if (keys.length === 0) continue;

  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += BATCH) batches.push(keys.slice(i, i + BATCH));

  batches.forEach((batchKeys, i) => {
    const obj: Record<string, string> = {};
    for (const k of batchKeys) obj[k] = dict[k];
    writeFileSync(join(OUT_DIR, `${code}.${i}.json`), JSON.stringify(obj, null, 1));
    state.batches[`${code}#${i}`] = "done";
  });
  state.languages[code] = "done";
  reconstructed++;
  console.log(`✓ ${code} — ${keys.length} keys → ${batches.length} batch file(s)`);
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`\nReconstructed ${reconstructed} language(s); state.json written.`);
