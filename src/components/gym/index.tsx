"use client";

/**
 * Gym screen — now a MAIN TAB of the app shell (v1.8: promoted from overlay).
 *
 * Owns the cross-tab data flow so the four tabs stay dumb where possible:
 *  - workouts roster + active detail + stats queries (all under ["gym", …])
 *  - start / finish / log-set mutations (invalidation via the ["gym"] prefix)
 *  - the FAST logger sheet (autofill = last session set → lastPerformance)
 *  - rest timer + wake lock + PR celebration host
 *  - the 4-tab layout (Session / Library / Templates / History)
 *
 * The shell keeps this screen mounted after the first visit (CSS-hidden
 * while inactive) so the session + rest timers survive tab switches.
 *
 * Cache-shape shim: session-tab reads ["gym","exercises"|"templates"] as the
 * RAW envelope ({ok,data}), while the picker and the tabs read the UNWRAPPED
 * payload via apiGet. Both component sets are frozen (previous agents), so
 * after every fetch under those keys we normalize the cache to a dual-shape
 * object both readers understand — one render of undefined in between at
 * worst (every reader guards with ?? []).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAppStore } from "@/lib/store/app-store";
import { suggestNext, type PrType } from "@/lib/logic/pr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_REST_SECONDS,
  exerciseName,
  kgToDisplay,
  type GymExercise,
  type SetRow,
  type StatsData,
  type WorkoutDetailData,
  type WorkoutSummary,
  type WorkoutsListData,
} from "./shared";
import { SessionTab } from "./session-tab";
import { LibraryTab } from "./library-tab";
import { TemplatesTab } from "./templates-tab";
import { HistoryTab } from "./history-tab";
import { LoggerSheet, type LoggerEditing, type LoggerInput } from "./logger-sheet";
import { ExercisePickerSheet } from "./exercise-picker-sheet";
import { RestTimerChip, useRestTimer } from "./rest-timer";
import { PrBurst, type PrBurstState } from "./pr-burst";

type GymTab = "session" | "library" | "templates" | "history";

const REST_STORAGE_KEY = "astnum-gym-rest-seconds";
const KEEP_AWAKE_STORAGE_KEY = "astnum-gym-keep-awake";

interface ScreenWakeLock {
  release: () => Promise<void>;
}

function readStoredFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

export default function GymScreen() {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();
  const autoStartTemplateId = useAppStore((s) => s.gymAutoStartTemplateId);
  const weightUnit = useAppStore((s) => s.weightUnit);

  const [tab, setTab] = useState<GymTab>("session");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [logger, setLogger] = useState<{ id: string; name: string } | null>(null);
  const [loggerInitial, setLoggerInitial] = useState<{
    reps: number;
    weightKg: number;
    fromSuggestion: boolean;
  } | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [burst, setBurst] = useState<PrBurstState | null>(null);

  /* ── set EDIT flow (v1.9: تعديل السجل) — shared by session + history ──
   * `editTarget` carries identity; the numeric values live in LoggerSheet
   * via `editing` (hydrates all four fields from the set itself). */
  const [editTarget, setEditTarget] = useState<{
    setId: string;
    exerciseId: string;
    name: string;
  } | null>(null);
  const [editValues, setEditValues] = useState<LoggerEditing | null>(null);
  const [deletingSet, setDeletingSet] = useState<SetRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_REST_SECONDS;
    const raw = window.localStorage.getItem(REST_STORAGE_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 15 && n <= 600 ? Math.round(n) : DEFAULT_REST_SECONDS;
  });
  const [keepAwake, setKeepAwake] = useState(() =>
    readStoredFlag(KEEP_AWAKE_STORAGE_KEY, false)
  );

  /* ── cache-shape shim (see file header) ────────────────────────────── */
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const data = event.query.state.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== "object") return;
      const [root, leaf] = event.query.queryKey as [string, string | undefined];
      const wrapped = data.data as Record<string, unknown> | undefined;
      const isExercises = root === "gym" && leaf === "exercises";
      const isTemplates = root === "gym" && leaf === "templates";
      if (!isExercises && !isTemplates) return;
      const listKey = isExercises ? "exercises" : "templates";
      const cachedList = data[listKey];
      const wrappedList = wrapped?.[listKey];
      if (Array.isArray(wrappedList) && !Array.isArray(cachedList)) {
        qc.setQueryData(event.query.queryKey, {
          ...data,
          [listKey]: wrappedList,
        });
      } else if (Array.isArray(cachedList) && !Array.isArray(wrappedList)) {
        qc.setQueryData(event.query.queryKey, {
          ...data,
          data: { ...wrapped, [listKey]: cachedList },
        });
      }
    });
    return unsub;
  }, [qc]);

  /* ── persistence for session options ───────────────────────────────── */
  useEffect(() => {
    try {
      window.localStorage.setItem(REST_STORAGE_KEY, String(restSeconds));
    } catch {
      /* storage unavailable — options stay in-memory */
    }
  }, [restSeconds]);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEEP_AWAKE_STORAGE_KEY, keepAwake ? "1" : "0");
    } catch {
      /* storage unavailable — options stay in-memory */
    }
  }, [keepAwake]);

  /* ── roster + detail + stats queries ───────────────────────────────── */
  const todayKey = fmt.todayKey();

  // Bare URL + key ["gym","workouts"] — the shell nav badge and the Today
  // workout card share this exact cache entry (one fetch, three consumers).
  const listQuery = useQuery({
    queryKey: ["gym", "workouts"],
    queryFn: () => apiGet<WorkoutsListData>("/api/gym/workouts"),
  });

  const active = listQuery.data?.active ?? null;

  const detailQuery = useQuery({
    queryKey: ["gym", "workout", active?.id ?? "none"],
    enabled: active !== null,
    queryFn: async () => {
      const id = active?.id;
      if (!id) throw new Error("no_active_workout");
      return apiGet<WorkoutDetailData>(`/api/gym/workouts/${id}`);
    },
  });

  const statsQuery = useQuery({
    queryKey: ["gym", "stats"],
    queryFn: () =>
      apiGet<StatsData>(`/api/gym/stats?today=${encodeURIComponent(todayKey)}`),
    staleTime: 30 * 1000,
  });

  /* ── mutations ─────────────────────────────────────────────────────── */
  const startMutation = useMutation({
    mutationFn: (templateId: string | undefined) =>
      apiPost(`/api/gym/workouts?today=${encodeURIComponent(todayKey)}`, {
        templateId: templateId ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gym"] });
    },
    onError: () => toast.error(t("gym.session.startError")),
  });

  /* ── auto-start hand-off from a linked habit (habit → "start workout") ──
   * Consumed ONCE: if the user arrived via a gym-plan habit's start button,
   * fire the session start immediately (only when no session is running). */
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current || !autoStartTemplateId) return;
    autoStartRef.current = true;
    const templateId = autoStartTemplateId;
    useAppStore.setState({ gymAutoStartTemplateId: null });
    if (active) return; // a session is already running — just open the gym
    startMutation.mutate(templateId, {
      onSuccess: () => {
        toast.success(t("gym.templates.started"));
        setTab("session");
      },
    });
     
  }, [autoStartTemplateId, active !== null, startMutation]);

  /* ── rest timer (before mutations: finish wants skipRest) ───────── */
  const restApi = useRestTimer(() => {
    toast(t("gym.rest.done"));
  });
  const { isResting, startRest, skipRest } = restApi;

  const finishMutation = useMutation({
    mutationFn: (durationSec: number) => {
      const id = active?.id;
      if (!id) throw new Error("no_active_workout");
      return apiPatch<{ workout: WorkoutSummary; linkedHabit: { id: string; name: string } | null }>(
        `/api/gym/workouts/${id}`,
        { finish: true, durationSec }
      );
    },
    onSuccess: (res) => {
      skipRest();
      void qc.invalidateQueries({ queryKey: ["gym"] });
      toast.success(t("gym.session.finished"));
      // the session's linked gym-plan habit auto-completed — tell the user
      const linked = res?.linkedHabit ?? null;
      if (linked) {
        void qc.invalidateQueries({ queryKey: ["habits"] });
        window.setTimeout(() => {
          toast.success(t("gym.habitLinked", { name: linked.name }));
        }, 450);
      }
    },
    onError: () => toast.error(t("gym.session.finishError")),
  });

  /* ── PR burst auto-dismiss ─────────────────────────────────────────── */
  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 1800);
    return () => window.clearTimeout(timer);
  }, [burst]);

  /* ── screen wake lock (honest web limits: may be unsupported) ──────── */
  const wakeLockRef = useRef<ScreenWakeLock | null>(null);
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: string) => Promise<ScreenWakeLock> };
    };
    if (active && keepAwake && nav.wakeLock) {
      nav.wakeLock
        .request("screen")
        .then((lock) => {
          if (cancelled) void lock.release().catch(() => undefined);
          else wakeLockRef.current = lock;
        })
        .catch(() => {
          /* unsupported / denied — the keepAwake hint already says so */
        });
    }
    return () => {
      cancelled = true;
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [active !== null, keepAwake]);

  /* ── FAST logger flow ──────────────────────────────────────────────── */
  const openLogger = useCallback(
    (exerciseId: string, name: string) => {
      const detail = detailQuery.data ?? null;
      const sessionSets = (detail?.sets ?? []).filter((s) => s.exerciseId === exerciseId);
      const suggested = suggestNext(
        sessionSets.map((s: SetRow) => ({
          reps: s.reps,
          weightKg: s.weightKg,
          setType: s.setType,
          createdAt: s.createdAt,
        }))
      );
      if (suggested) {
        setLoggerInitial({ ...suggested, fromSuggestion: true });
      } else {
        const lp = detail?.lastPerformance[exerciseId] ?? null;
        setLoggerInitial(
          lp ? { reps: lp.reps, weightKg: lp.weightKg, fromSuggestion: true } : null
        );
      }
      setLogger({ id: exerciseId, name });
    },
    [detailQuery.data]
  );

  /* Raw set-logging path shared by the logger sheet AND the one-tap
   * quick-repeat (v1.17 وضع ذكي): PR detection + rest timer + PR burst live
   * here once — quick-repeat only skips the sheet, not the behavior. */
  const logSetRaw = useCallback(
    async (exerciseId: string, name: string, input: LoggerInput): Promise<string[] | null> => {
      const id = active?.id;
      if (!id) return null;
      setSavingSet(true);
      try {
        const res = await apiPost<{ set: SetRow; prs: PrType[] }>(
          `/api/gym/workouts/${id}/sets`,
          { ...input, exerciseId }
        );
        void qc.invalidateQueries({ queryKey: ["gym"] });
        startRest(restSeconds);
        if (res.prs.length > 0) {
          haptic("pr");
          toast.success(t("gym.pr.toast", { name }));
          setBurst({ prs: res.prs, name, nonce: Date.now() });
        }
        return res.prs;
      } catch {
        toast.error(t("gym.logger.error"));
        return null;
      } finally {
        setSavingSet(false);
      }
    },
    [active?.id, qc, t, startRest, restSeconds]
  );

  const saveSet = useCallback(
    async (input: LoggerInput): Promise<string[] | null> => {
      if (!logger) return null;
      const prs = await logSetRaw(logger.id, logger.name, input);
      if (prs) {
        // v1.17: logging a set fulfills a pending deferral — refresh toast
        // copy stays quiet; the invalidated queries update the badges.
        void qc.invalidateQueries({ queryKey: ["muscles-load"] });
      }
      return prs;
    },
    [logger, logSetRaw, qc]
  );

  /* ── v1.17 تأجيل — defer / undefer a planned exercise to the NEXT session
   * of the same template (PATCH workout {deferExercise|undeferExercise}). */
  const deferMutation = useMutation({
    mutationFn: (vars: { defer: boolean; exerciseId: string; name: string }) => {
      const id = active?.id;
      if (!id) throw new Error("no_active_workout");
      return apiPatch(`/api/gym/workouts/${id}`,
        vars.defer ? { deferExercise: vars.exerciseId } : { undeferExercise: vars.exerciseId });
    },
    onSuccess: (_res, vars) => {
      haptic("light");
      void qc.invalidateQueries({ queryKey: ["gym"] });
      toast.success(
        vars.defer
          ? t("gym.defer.done", { name: vars.name })
          : t("gym.defer.undone", { name: vars.name })
      );
    },
    onError: () => toast.error(t("gym.defer.error")),
  });

  const deferPending = deferMutation.isPending
    ? { id: deferMutation.variables?.exerciseId ?? "", defer: deferMutation.variables?.defer ?? true }
    : null;

  /* ── v1.17 quick-repeat — one tap re-logs the last set of the exercise
   * exactly as performed (the at-the-gym “same again” button). */
  const quickRepeat = useCallback(
    async (exerciseId: string, name: string) => {
      const detail = detailQuery.data;
      if (!detail) return;
      const sessionSets = detail.sets.filter((s) => s.exerciseId === exerciseId);
      const last = sessionSets[sessionSets.length - 1] ?? null;
      if (!last) return;
      const okLogged = await logSetRaw(exerciseId, name, {
        reps: last.reps,
        weightKg: last.weightKg,
        setType: last.setType,
        rpe: last.rpe,
      });
      if (okLogged) {
        haptic("success");
        toast.success(
          t("gym.quickRepeat.done", {
            reps: fmt.number(last.reps),
            weight: fmt.number(Math.round(kgToDisplay(last.weightKg, weightUnit) * 10) / 10),
            unit: weightUnit === "lb" ? t("unit.lb") : t("unit.kg"),
          })
        );
        void qc.invalidateQueries({ queryKey: ["muscles-load"] });
      }
    },
    [detailQuery.data, logSetRaw, t, fmt, weightUnit, qc]
  );

  /* ── set EDIT (PATCH) — works on active + finished sessions alike ── */
  const saveEdit = useCallback(
    async (input: LoggerInput): Promise<string[] | null> => {
      const target = editTarget;
      if (!target) return null;
      setSavingEdit(true);
      try {
        const res = await apiPatch<{ set: SetRow; prs: PrType[] }>(
          `/api/gym/sets/${target.setId}`,
          input
        );
        void qc.invalidateQueries({ queryKey: ["gym"] });
        void qc.invalidateQueries({ queryKey: ["muscles-load"] });
        haptic("success");
        toast.success(t("gym.set.editSaved"));
        if (res.prs.length > 0) {
          setBurst({ prs: res.prs, name: target.name, nonce: Date.now() });
        }
        return res.prs;
      } catch {
        toast.error(t("gym.set.editError"));
        return null;
      } finally {
        setSavingEdit(false);
      }
    },
    [editTarget, qc, t]
  );

  /** open the edit sheet for any logged set (session tab + history tab) */
  const openEditSet = useCallback((set: SetRow, name: string) => {
    setEditValues({
      setId: set.id,
      reps: set.reps,
      weightKg: set.weightKg,
      setType: set.setType,
      rpe: set.rpe,
    });
    setEditTarget({ setId: set.id, exerciseId: set.exerciseId, name });
  }, []);

  const closeEdit = useCallback(() => {
    setEditTarget(null);
    setEditValues(null);
  }, []);

  const deleteSetMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gym/sets/${id}`),
    onSuccess: () => {
      haptic("medium");
      toast.success(t("gym.set.deleted"));
      void qc.invalidateQueries({ queryKey: ["gym"] });
      void qc.invalidateQueries({ queryKey: ["muscles-load"] });
      setDeletingSet(null);
      closeEdit();
    },
    onError: () => toast.error(t("gym.set.deleteError")),
  });

  /* ── picker + library "add exercise" → open the logger ───────────── */
  const recentForPicker = (statsQuery.data?.personalRecords ?? []).map((pr) => ({
    id: pr.exerciseId,
    nameAr: pr.nameAr,
    nameEn: pr.nameEn,
  }));

  const handleAddExercise = useCallback(
    (ex: GymExercise) => {
      if (!active) {
        toast.info(t("gym.library.noSession"));
        return;
      }
      toast.success(t("gym.library.addToast", { name: exerciseName(ex, lang) }));
      openLogger(ex.id, exerciseName(ex, lang));
    },
    [active, openLogger, t, lang]
  );

  /* ── templates → session hand-off ─────────────────────────────────── */
  const startFromTemplate = useCallback(
    (templateId: string) => {
      startMutation.mutate(templateId, {
        onSuccess: () => {
          toast.success(t("gym.templates.started"));
          setTab("session");
        },
      });
    },
    [startMutation, t]
  );

  const startingId = startMutation.isPending
    ? (startMutation.variables ?? null)
    : null;

  /* ── shell FAB contract: on the gym tab the "+" is contextual ────
   * active session → open the exercise picker; no session (roster loaded)
   * → start an empty one. While the roster is still loading, stay honest
   * and do nothing rather than fire a blind POST. */
  const fabTimerRef = useRef(0);
  useEffect(() => {
    const onFab = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab !== "gym") return;
      haptic("light");
      if (active) {
        setPickerOpen(true);
        return;
      }
      if (!listQuery.isSuccess || listQuery.isFetching) return;
      if (fabTimerRef.current) return; // debounce double-taps
      fabTimerRef.current = window.setTimeout(() => (fabTimerRef.current = 0), 400);
      startMutation.mutate(undefined, {
        onSuccess: () => {
          toast.success(t("gym.templates.started"));
          setTab("session");
        },
      });
    };
    window.addEventListener("astnum:fab", onFab);
    return () => window.removeEventListener("astnum:fab", onFab);
  }, [active, listQuery.isSuccess, listQuery.isFetching, startMutation, t]);

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col">
      {/* in-page title — the global shell header (logo + tools) sits above */}
      <header className="px-4 pt-3">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Dumbbell className="h-5 w-5 text-primary" aria-hidden />
          {t("gym.title")}
        </h1>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          haptic("light");
          setTab(v as GymTab);
        }}
        className="flex flex-col"
      >
        {/* sticky right under the global header — long session lists keep
            the switcher reachable (global header is h-14 → top-14) */}
        <div className="sticky top-14 z-20 mt-3 bg-background/85 px-4 pb-2 backdrop-blur-xl">
          <TabsList
            className="grid h-12 w-full grid-cols-4 gap-1 rounded-2xl bg-muted/60 p-1"
            aria-label={t("gym.tabAria")}
          >
            <TabsTrigger
              value="session"
              className="min-h-10 rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary"
            >
              {t("gym.tab.session")}
            </TabsTrigger>
            <TabsTrigger
              value="library"
              className="min-h-10 rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary"
            >
              {t("gym.tab.library")}
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="min-h-10 rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary"
            >
              {t("gym.tab.templates")}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="min-h-10 rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary"
            >
              {t("gym.tab.history")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="session" className="pt-2">
          {listQuery.isError ? (
            <div className="px-4 pt-4">
              <Card className="card-hi flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("gym.error")}</p>
                <Button
                  type="button"
                  className="min-h-11 rounded-2xl"
                  onClick={() => {
                    haptic("light");
                    void listQuery.refetch();
                  }}
                >
                  {t("action.retry")}
                </Button>
              </Card>
            </div>
          ) : (
            <SessionTab
              active={active}
              detail={detailQuery.data ?? null}
              detailLoading={detailQuery.isLoading}
              listLoading={listQuery.isLoading}
              stats={statsQuery.data ?? null}
              sessionsTotal={listQuery.data?.history.length ?? 0}
              todayKey={todayKey}
              weightUnit={weightUnit}
              restSeconds={restSeconds}
              keepAwake={keepAwake}
              onRestSecondsChange={setRestSeconds}
              onKeepAwakeChange={setKeepAwake}
              onStart={(templateId) => startMutation.mutate(templateId)}
              startPending={startMutation.isPending}
              onFinish={(durationSec) => finishMutation.mutate(durationSec)}
              finishPending={finishMutation.isPending}
              onOpenLogger={openLogger}
              onEditSet={openEditSet}
              onOpenPicker={() => setPickerOpen(true)}
              onQuickRepeat={(exerciseId, name) => void quickRepeat(exerciseId, name)}
              quickRepeatBusy={savingSet}
              onDefer={(exerciseId, name, defer) =>
                deferMutation.mutate({ defer, exerciseId, name })
              }
              deferPending={deferPending}
            />
          )}
        </TabsContent>

        <TabsContent value="library">
          <LibraryTab active={active} onAddToSession={handleAddExercise} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab onStart={startFromTemplate} startingId={startingId} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab
            history={listQuery.data?.history ?? []}
            listLoading={listQuery.isLoading}
            today={todayKey}
            weightUnit={weightUnit}
            onEditSet={openEditSet}
          />
        </TabsContent>
      </Tabs>

      {/* exercise picker (session "add exercise") */}
      {pickerOpen && (
        <ExercisePickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={handleAddExercise}
          recent={recentForPicker}
        />
      )}

      {/* FAST set logger (log mode) */}
      <LoggerSheet
        open={logger !== null}
        onOpenChange={(open) => {
          if (!open) setLogger(null);
        }}
        exercise={logger}
        initial={loggerInitial}
        last={
          logger && detailQuery.data
            ? (detailQuery.data.lastPerformance[logger.id] ?? null)
            : null
        }
        weightUnit={weightUnit}
        saving={savingSet}
        onSave={saveSet}
      />

      {/* set EDIT sheet (session + history) — same pro input, PATCH semantics */}
      <LoggerSheet
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
        exercise={
          editTarget ? { id: editTarget.exerciseId, name: editTarget.name } : null
        }
        initial={null}
        last={null}
        editing={editValues}
        weightUnit={weightUnit}
        saving={savingEdit}
        onSave={saveEdit}
        onDelete={() => {
          haptic("light");
          const target = editTarget;
          if (!target) return;
          const fromActive =
            detailQuery.data?.sets.find((s) => s.id === target.setId) ?? null;
          setDeletingSet(
            fromActive ?? {
              id: target.setId,
              workoutId: "",
              exerciseId: target.exerciseId,
              setType: "work",
              reps: 0,
              weightKg: 0,
              rpe: null,
              isPr: false,
              createdAt: "",
            }
          );
        }}
      />

      {/* delete-set confirm (shared by the edit sheet) */}
      <AlertDialog
        open={deletingSet !== null}
        onOpenChange={(open) => !open && setDeletingSet(null)}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gym.set.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gym.set.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-2xl">
              {t("action.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-2xl bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                if (deletingSet) deleteSetMutation.mutate(deletingSet.id);
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PR celebration host */}
      <PrBurst burst={burst} />

      {/* floating rest countdown chip */}
      <AnimatePresence>{isResting && <RestTimerChip api={restApi} />}</AnimatePresence>
    </div>
  );
}
