/**
 * localApiRequest(path, init) — the in-browser dispatcher behind the
 * `@/lib/local-api` transport seam in src/lib/api.ts (NEXT_PUBLIC_STATIC=1
 * APK builds). Mirrors Next.js App Router semantics for every route under
 * src/app/api/**:
 *
 *  - Method resolution: default GET, HEAD falls back to GET.
 *  - Path resolution: the best PATTERN wins first — static segments beat
 *    dynamic ones per-segment (notes/tags + notes/trash beat notes/:id;
 *    habits/stats beats habits/:id; muscles/load + muscles/targets beat
 *    muscles/:id).
 *  - Method groups: routes sharing a pattern (GET+POST of one route file)
 *    form a GROUP — a wrong method 405s only when the whole file lacks it
 *    (the 4-a/6-a "collapsed registration" bug class, avoided by design).
 *  - Unknown path → 404 { NOT_FOUND }; known path wrong method →
 *    405 { METHOD_NOT_ALLOWED }.
 *  - Persistence: every matched non-GET/HEAD route markDirty()s as a safety
 *    net (GET/HEAD never persist — even though some GETs opportunistically
 *    mutate, e.g. the notes trash purge, which only lives in memory until
 *    the next write).
 */

import { markDirty } from "./db";
import { ApiError } from "@/lib/api";
import type { LocalRequest } from "./shared";
import * as settings from "./handlers/settings";
import * as habits from "./handlers/habits";
import * as notes from "./handlers/notes";
import * as tasks from "./handlers/tasks";
import * as gym from "./handlers/gym";
import * as muscles from "./handlers/muscles";
import * as nutrition from "./handlers/nutrition";
import * as body from "./handlers/body";
import * as backup from "./handlers/backup";
import * as demo from "./handlers/demo";
import * as analyst from "./handlers/analyst";

/* ── route registry (pattern → method → handler) ─────────────────── */

type Handler = (req: LocalRequest) => unknown;

interface RoutePattern {
  /** Path segments after /api; ":name" marks a dynamic segment. */
  segments: string[];
  /** Method → handler map (the route file's exported methods). */
  methods: Record<string, Handler>;
}

function route(pattern: string, methods: Record<string, Handler>): RoutePattern {
  return { segments: pattern.split("/"), methods };
}

const ROUTES: RoutePattern[] = [
  // settings
  route("settings", { GET: settings.settingsGet, POST: settings.settingsPost }),

  // habits (static segments beat the dynamic [id] per Next.js conventions)
  route("habits", { GET: habits.habitsList, POST: habits.habitsCreate }),
  route("habits/stats", { GET: habits.habitsStats }),
  route("habits/from-template", { POST: habits.habitFromTemplate }),
  route("habits/:id", {
    GET: habits.habitDetail,
    PATCH: habits.habitUpdate,
    DELETE: habits.habitDelete,
  }),
  route("habits/:id/log", { POST: habits.habitLog }),
  route("habits/:id/freeze", { POST: habits.habitFreeze }),

  // notes (tags + trash are static segments; UUID ids never collide anyway)
  route("notes", { GET: notes.notesList, POST: notes.notesCreate }),
  route("notes/tags", { GET: notes.notesTags }),
  route("notes/trash", { GET: notes.notesTrashList, DELETE: notes.notesTrashPurge }),
  route("notes/:id", {
    GET: notes.noteDetail,
    PATCH: notes.noteUpdate,
    DELETE: notes.noteDelete,
  }),
  route("notes/:id/tags", { PUT: notes.noteTagsReplace }),
  route("notes/:id/restore", { POST: notes.noteRestore }),

  // tasks (trash + restore: v1.15 review finding 1 — were MISSING here,
  // which 404'd the APK trash view into the generic error screen)
  route("tasks", { GET: tasks.tasksList, POST: tasks.tasksCreate }),
  route("tasks/trash", { GET: tasks.tasksTrashList, DELETE: tasks.tasksTrashPurge }),
  route("tasks/:id", { PATCH: tasks.taskUpdate, DELETE: tasks.taskDelete }),
  route("tasks/:id/restore", { POST: tasks.taskRestore }),

  // gym
  route("gym/workouts", { GET: gym.workoutsList, POST: gym.workoutsStart }),
  route("gym/workouts/:id", {
    GET: gym.workoutDetail,
    PATCH: gym.workoutUpdate,
    DELETE: gym.workoutDelete,
  }),
  route("gym/workouts/:id/sets", { POST: gym.workoutLogSet }),
  route("gym/sets/:id", { PATCH: gym.setUpdate, DELETE: gym.setDelete }),
  route("gym/templates", { GET: gym.templatesList, POST: gym.templatesCreate }),
  route("gym/templates/:id", { PATCH: gym.templateUpdate, DELETE: gym.templateDelete }),
  route("gym/exercises", { GET: gym.exercisesList, POST: gym.exercisesCreate }),
  route("gym/exercises/:id", {
    GET: gym.exerciseDetail,
    PATCH: gym.exerciseMediaUpdate,
    DELETE: gym.exerciseDelete,
  }),
  route("gym/stats", { GET: gym.gymStats }),

  // muscles
  route("muscles", { GET: muscles.musclesList }),
  route("muscles/load", { GET: muscles.musclesLoad }),
  route("muscles/targets", { PATCH: muscles.musclesTargetUpdate }),
  route("muscles/:id/exercises", { GET: muscles.muscleExercises }),

  // nutrition
  route("nutrition/logs", { GET: nutrition.nutritionLogsList, POST: nutrition.nutritionLogsCreate }),
  route("nutrition/logs/:id", {
    PATCH: nutrition.nutritionLogUpdate,
    DELETE: nutrition.nutritionLogDelete,
  }),
  route("nutrition/foods", {
    GET: nutrition.nutritionFoodsList,
    POST: nutrition.nutritionFoodsCreate,
    PATCH: nutrition.nutritionFoodsPatch,
  }),
  route("nutrition/foods/:id", {
    DELETE: nutrition.nutritionFoodsDelete,
  }),
  route("nutrition/summary", { GET: nutrition.nutritionSummary }),
  route("nutrition/goals", { GET: nutrition.nutritionGoalsGet, PUT: nutrition.nutritionGoalsPut }),
  route("nutrition/water", { GET: nutrition.nutritionWaterList, POST: nutrition.nutritionWaterCreate }),
  route("nutrition/water/:id", {
    PATCH: nutrition.nutritionWaterPatch,
    DELETE: nutrition.nutritionWaterDelete,
  }),
  route("nutrition/barcode", { GET: nutrition.nutritionBarcode }),

  // body
  route("body/measurements", {
    GET: body.measurementsList,
    POST: body.measurementsUpsert,
    DELETE: body.measurementsDelete,
  }),
  route("body/circumferences", { GET: body.circumferencesList, POST: body.circumferencesUpsert }),
  route("body/photos", { GET: body.photosList, POST: body.photosCreate, DELETE: body.photosDelete }),
  route("body/import", { POST: body.bodyImport }),

  // backup / demo / analyst
  route("backup", { GET: backup.backupExport, POST: backup.backupRestore, DELETE: backup.backupWipe }),
  route("demo", { POST: demo.demoSeed, DELETE: demo.demoClear }),
  route("analyst", { GET: analyst.analystGet }),
];

/* ── matching (Next.js App Router precedence) ────────────────────── */

const DYNAMIC_RE = /^:/;

/** Does `pattern` match `segments`, and how static is it (higher = better)? */
function matchScore(
  pattern: string[],
  segments: string[]
): { matched: boolean; params: Record<string, string> } {
  if (pattern.length !== segments.length) return { matched: false, params: {} };
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (DYNAMIC_RE.test(p)) {
      params[p.slice(1)] = decodeURIComponent(segments[i]);
    } else if (p !== segments[i]) {
      return { matched: false, params: {} };
    }
  }
  return { matched: true, params };
}

/**
 * Per-segment static-beats-dynamic comparison. Returns true when A is more
 * specific than B (A has a static segment where B has a dynamic one, and
 * never the reverse).
 */
function patternBeats(a: string[], b: string[]): boolean {
  let aAdvantage = false;
  for (let i = 0; i < a.length; i++) {
    const aStatic = !DYNAMIC_RE.test(a[i]);
    const bStatic = !DYNAMIC_RE.test(b[i]);
    if (aStatic !== bStatic) {
      if (bStatic) return false; // B is more specific somewhere → B wins
      aAdvantage = true;
    }
  }
  return aAdvantage;
}

/* ── request parsing ─────────────────────────────────────────────── */

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[String(key).toLowerCase()] = String(value);
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

/* ── the dispatcher (the @/lib/local-api entry contract) ──────────── */

export async function localApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const queryStart = path.indexOf("?");
  const rawPath = queryStart >= 0 ? path.slice(0, queryStart) : path;
  const rawQuery = queryStart >= 0 ? path.slice(queryStart + 1) : "";

  // Only /api/** paths exist; anything else is a 404 like the dev server.
  const allSegments = rawPath.split("/").filter((s) => s.length > 0);
  const segments = allSegments[0] === "api" ? allSegments.slice(1) : allSegments;

  const searchParams = new URLSearchParams(rawQuery);

  let body: unknown;
  let bodyMalformed = false;
  if (typeof init?.body === "string" && init.body.length > 0) {
    try {
      body = JSON.parse(init.body);
    } catch {
      bodyMalformed = true;
    }
  }

  const headers = normalizeHeaders(init?.headers);

  // Resolve the best matching PATTERN first (static beats dynamic per segment).
  let best: { pattern: RoutePattern; params: Record<string, string> } | null = null;
  for (const pattern of ROUTES) {
    const { matched, params } = matchScore(pattern.segments, segments);
    if (!matched) continue;
    if (!best || patternBeats(pattern.segments, best.pattern.segments)) {
      best = { pattern, params };
    }
  }

  if (!best) {
    throw new ApiError("not_found", "NOT_FOUND", 404);
  }

  // Method group: HEAD falls back to GET; a missing method → 405 (the whole
  // file's exports were checked, not just the first registration).
  const effectiveMethod = method === "HEAD" ? "GET" : method;
  const handler = best.pattern.methods[effectiveMethod];
  if (!handler) {
    throw new ApiError("method_not_allowed", "METHOD_NOT_ALLOWED", 405);
  }

  // Persistence safety net: GET/HEAD never persist; every other matched
  // method marks the DB dirty even if the handler forgets to.
  if (effectiveMethod !== "GET") markDirty();

  const req: LocalRequest = {
    method,
    path: rawPath,
    query: searchParams,
    body,
    bodyMalformed,
    headers,
    params: best.params,
  };

  const data = await handler(req);
  return data as T;
}

/* ── route table (drives the parity test) ────────────────────────── */

/**
 * The full pattern×method table of this adapter. consumed by
 * tests/local-api-parity.test.ts, which asserts EXACT parity with the
 * exported methods of every route.ts under src/app/api — so a server
 * route added without its adapter twin (the v1.15 tasks/trash class of
 * bug, which 404'd the APK trash screen) can never ship silently again.
 */
export function listLocalApiRoutes(): Array<{ pattern: string; methods: string[] }> {
  return ROUTES.map((r) => ({
    pattern: `/${r.segments.join("/")}`,
    methods: Object.keys(r.methods),
  }));
}
