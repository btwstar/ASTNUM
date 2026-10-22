"use client";

/**
 * Habits screen (default export) — the Habits tab.
 *
 * Sections: title + achievement chips (week/month from /api/habits/stats),
 * drag-to-reorder active habit list (dnd-kit, persisted via PATCH), collapsed
 * archived section, rich empty state, skeleton loading, inline error retry.
 * Sheets: add/edit (also opened by the shell FAB via the `astnum:fab`
 * contract) and habit detail with the 35-day heatmap.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Repeat2, Target } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { addDaysToKey } from "@/lib/logic/streak";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { HabitDTO, HabitsListData, StatsData } from "./shared";
import { SortableHabitCard, ArchivedHabitCard } from "./habit-card";
import { HabitEditorSheet, type HabitEditorProps } from "./habit-editor";
import { HabitDetailSheet } from "./habit-detail";

export default function HabitsScreen() {
  const { t, isRtl } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();

  const todayKey = fmt.todayKey();
  const statsFrom = useMemo(() => addDaysToKey(todayKey, -29), [todayKey]);

  /* ── server state ─────────────────────────────────────────────── */

  const listQuery = useQuery({
    queryKey: ["habits", "list", todayKey],
    queryFn: () => apiGet<HabitsListData>(`/api/habits?today=${todayKey}`),
  });

  const statsQuery = useQuery({
    queryKey: ["habits", "stats", statsFrom, todayKey],
    queryFn: () => apiGet<StatsData>(`/api/habits/stats?from=${statsFrom}&to=${todayKey}`),
    enabled: (listQuery.data?.habits.length ?? 0) > 0,
  });

  const habits = listQuery.data?.habits ?? [];
  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);

  /* ── local ui state ───────────────────────────────────────────── */

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitEditorProps["habit"]>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<{ id: string; nonce: number } | null>(null);

  const openAddSheet = useCallback(() => {
    haptic("light");
    setEditingHabit(null);
    setEditorOpen(true);
  }, []);

  // FAB contract: the shell FAB broadcasts `astnum:fab` — open the add sheet.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      if (!detail || detail.tab === "habits" || detail.tab === undefined) {
        openAddSheet();
      }
    };
    window.addEventListener("astnum:fab", handler);
    return () => window.removeEventListener("astnum:fab", handler);
  }, [openAddSheet]);

  // «إضافة سريعة» + «عنصر مثبّت» deep links: bridge the EXTERNAL store
  // (zustand) into this screen's local sheet state. Subscription covers
  // warm taps (screen already mounted); the mount-time microtask covers
  // cold taps (the intent fired before this screen's first render —
  // getLaunchUrl resolves after boot). Both consumers are idempotent.
  useEffect(() => {
    const consumeIntents = () => {
      const s = useAppStore.getState();
      if (s.habitsAddIntent) {
        useAppStore.setState({ habitsAddIntent: false });
        openAddSheet();
      }
      const detailId = s.habitDetailIntent;
      if (detailId) {
        useAppStore.setState({ habitDetailIntent: null });
        haptic("light");
        setDetailId(detailId);
        setDetailOpen(true);
      }
    };
    const unsub = useAppStore.subscribe(consumeIntents);
    const t = window.setTimeout(consumeIntents, 0);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [openAddSheet]);

  /* ── mutations ────────────────────────────────────────────────── */

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; name: string; date: string; done: boolean; gymPlan: boolean }) =>
      apiPost(`/api/habits/${vars.id}/log?today=${todayKey}`, {
        date: vars.date,
        done: vars.done,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["habits"] });
      const prev = qc.getQueryData<HabitsListData>(["habits", "list", todayKey]);
      // Optimistic flip only for today's cell (the retroactive heatmap waits
      // for the refetch — it's cheap on local SQLite).
      if (prev && vars.date === todayKey) {
        qc.setQueryData(["habits", "list", todayKey], {
          ...prev,
          habits: prev.habits.map((h) =>
            h.id === vars.id
              ? {
                  ...h,
                  todayDone: vars.done,
                  last7: h.last7.map((d) => (d.date === vars.date ? { ...d, done: vars.done } : d)),
                }
              : h
          ),
        });
      }
      return { prev };
    },
    onSuccess: (res, vars) => {
      const milestone = (res as { milestone?: number | null }).milestone ?? null;
      if (vars.done && milestone) {
        haptic("success");
        setCelebrate({ id: vars.id, nonce: Date.now() });
        toast.success(
          vars.gymPlan
            ? t("habits.gym.milestone", {
                name: vars.name,
                count: milestone,
                n: fmt.number(milestone),
              })
            : t("habits.milestone.toast", {
                name: vars.name,
                count: milestone,
                n: fmt.number(milestone),
              })
        );
      } else if (!vars.done && vars.date === todayKey) {
        haptic("light");
        toast(t("habits.undo.toast"));
      } else {
        haptic("light");
      }
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["habits", "list", todayKey], ctx.prev);
      haptic("heavy");
      toast.error(t("state.errorGeneric"));
    },
  });

  const freezeMutation = useMutation({
    mutationFn: (vars: { id: string }) =>
      apiPost(`/api/habits/${vars.id}/freeze?today=${todayKey}`, { date: todayKey }),
    onSuccess: () => {
      haptic("medium");
      toast(t("habits.freeze.toast"));
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "FREEZE_LIMIT") {
        haptic("heavy");
        toast.error(t("habits.freeze.limitToast"));
      } else if (err instanceof ApiError && err.message.includes("date_already_done")) {
        toast.error(t("habits.freeze.cannotDone"));
      } else {
        toast.error(t("state.errorGeneric"));
      }
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (vars: { id: string; archived: boolean }) =>
      apiPatch(`/api/habits/${vars.id}`, { archived: vars.archived }),
    onSuccess: (_res, vars) => {
      haptic("medium");
      toast(vars.archived ? t("state.updated") : t("state.updated"));
      qc.invalidateQueries({ queryKey: ["habits"] });
      if (detailOpen && detailId === vars.id && vars.archived) {
        setDetailOpen(false);
      }
    },
    onError: () => toast.error(t("state.errorGeneric")),
  });

  /* ── handlers ─────────────────────────────────────────────────── */

  const handleToggleToday = useCallback(
    (habit: HabitDTO) => {
      toggleMutation.mutate({
        id: habit.id,
        name: habit.name,
        date: todayKey,
        done: !habit.todayDone,
        gymPlan: habit.schedule.type === "gymPlan",
      });
    },
    [toggleMutation, todayKey]
  );

  const handleToggleDay = useCallback(
    (
      habit: { id: string; name: string; schedule?: { type: string } },
      date: string,
      currentDone: boolean
    ) => {
      toggleMutation.mutate({
        id: habit.id,
        name: habit.name,
        date,
        done: !currentDone,
        gymPlan: habit.schedule?.type === "gymPlan",
      });
    },
    [toggleMutation]
  );

  /* ── gym-plan habits: jump straight into the linked workout ──────── */
  const openGymWithTemplate = useAppStore((s) => s.openGymWithTemplate);
  const handleGymStart = useCallback(
    (habit: HabitDTO) => {
      if (!habit.gymTemplateId) return;
      haptic("medium");
      openGymWithTemplate(habit.gymTemplateId);
    },
    [openGymWithTemplate]
  );

  const handleFreezeToday = useCallback(
    (
      habit: { id: string; name: string },
      status: { todayFrozen: boolean; remaining: number }
    ) => {
      if (status.todayFrozen) {
        haptic("light");
        toast(t("habits.freeze.todayFrozen"));
        return;
      }
      if (status.remaining <= 0) {
        haptic("heavy");
        toast.error(t("habits.freeze.limitToast"));
        return;
      }
      freezeMutation.mutate({ id: habit.id });
    },
    [freezeMutation, t]
  );

  const handleEdit = useCallback((habit: { id: string; name: string; icon: string; color: string; schedule: HabitDTO["schedule"]; reminderTime: string | null; note: string | null }) => {
    haptic("light");
    setDetailOpen(false);
    setEditingHabit(habit);
    setEditorOpen(true);
  }, []);

  const handleArchiveToggle = useCallback(
    (habit: { id: string; archived: boolean }) => {
      archiveMutation.mutate({ id: habit.id, archived: !habit.archived });
    },
    [archiveMutation]
  );

  /* ── drag-to-reorder (dnd-kit, persisted via PATCH) ────────────── */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = qc.getQueryData<HabitsListData>(["habits", "list", todayKey]);
    if (!current) return;
    const oldIndex = current.habits.findIndex((h) => h.id === active.id);
    const newIndex = current.habits.findIndex((h) => h.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(current.habits, oldIndex, newIndex);
    qc.setQueryData(["habits", "list", todayKey], {
      ...current,
      habits: reordered.map((h, i) => ({ ...h, sortOrder: i })),
    });

    const changed = reordered
      .map((h, i) => ({ id: h.id, sortOrder: i, prev: h.sortOrder }))
      .filter((c) => c.sortOrder !== c.prev);
    if (changed.length === 0) return;

    Promise.all(changed.map((c) => apiPatch(`/api/habits/${c.id}`, { sortOrder: c.sortOrder })))
      .then(() => {
        qc.invalidateQueries({ queryKey: ["habits"] });
      })
      .catch(() => {
        toast.error(t("state.errorGeneric"));
        qc.invalidateQueries({ queryKey: ["habits"] });
      });
  };

  /* ── achievement chips ─────────────────────────────────────────── */

  const { weekRate, monthRate } = useMemo(() => {
    const days = statsQuery.data?.days;
    if (!days || days.length === 0) return { weekRate: null, monthRate: null };
    const sum = (list: StatsData["days"]) =>
      list.reduce(
        (acc, d) => ({ scheduled: acc.scheduled + d.scheduled, done: acc.done + d.done }),
        { scheduled: 0, done: 0 }
      );
    const rate = (list: StatsData["days"]) => {
      const { scheduled, done } = sum(list);
      return scheduled > 0 ? Math.min(1, done / scheduled) : null;
    };
    return { weekRate: rate(days.slice(-7)), monthRate: rate(days) };
  }, [statsQuery.data]);

  /* ── render ───────────────────────────────────────────────────── */

  const activeIds = active.map((h) => h.id);

  return (
    <section aria-label={t("habits.title")} className="mx-auto w-full max-w-md px-4 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold leading-snug">{t("habits.title")}</h1>
      </div>

      {/* loading */}
      {listQuery.isLoading && (
        <div aria-busy="true" aria-label={t("habits.loading.aria")} className="space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      )}

      {/* error */}
      {listQuery.isError && !listQuery.isLoading && (
        <div className="card-hi rounded-2xl border border-border bg-card p-6 text-center">
          <p className="font-semibold">{t("state.error")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("state.errorGeneric")}</p>
          <Button
            variant="outline"
            className="mt-4 h-11 rounded-2xl"
            onClick={() => listQuery.refetch()}
          >
            {t("action.retry")}
          </Button>
        </div>
      )}

      {/* empty */}
      {!listQuery.isLoading && !listQuery.isError && habits.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col items-center px-2 py-12 text-center"
        >
          <span className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-accent p-[3px]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-card">
              <Repeat2 className="h-12 w-12 text-primary" aria-hidden />
            </span>
          </span>
          <h2 className="text-xl font-bold">{t("habits.empty.title")}</h2>
          <Button
            onClick={openAddSheet}
            className="mt-7 h-12 rounded-2xl bg-gradient-accent px-8 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25"
          >
            <Plus className="h-5 w-5" aria-hidden />
            {t("habits.empty.cta")}
          </Button>
        </motion.div>
      )}

      {/* list */}
      {!listQuery.isLoading && !listQuery.isError && habits.length > 0 && (
        <>
          {/* achievement chips */}
          <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t("habits.chip.sr")}>
            {statsQuery.isLoading ? (
              <>
                <Skeleton className="h-9 w-32 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </>
            ) : (
              <>
                {weekRate !== null && (
                  <RateChip label={t("habits.chip.week")} rate={weekRate} value={fmt.number(weekRate, { style: "percent", maximumFractionDigits: 0 })} />
                )}
                {monthRate !== null && (
                  <RateChip label={t("habits.chip.month")} rate={monthRate} value={fmt.number(monthRate, { style: "percent", maximumFractionDigits: 0 })} />
                )}
              </>
            )}
          </div>

          {/* active empty hint (only archived habits left) */}
          {active.length === 0 && archived.length > 0 && (
            <div className="mb-4 rounded-2xl border border-border bg-card p-5 text-center">
              <p className="text-sm font-semibold">{t("habits.empty.activeTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("habits.empty.activeSubtitle")}</p>
              <Button variant="outline" className="mt-3 h-11 rounded-2xl" onClick={openAddSheet}>
                <Plus className="h-4 w-4" aria-hidden />
                {t("action.new")}
              </Button>
            </div>
          )}

          {/* draggable active list */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => haptic("light")}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={activeIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {active.map((habit) => (
                    <motion.div
                      key={habit.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <SortableHabitCard
                        habit={habit}
                        isRtl={isRtl}
                        celebrateNonce={celebrate?.id === habit.id ? celebrate.nonce : 0}
                        onToggleToday={handleToggleToday}
                        onGymStart={handleGymStart}
                        onFreezeToday={(h) =>
                          handleFreezeToday(h, {
                            todayFrozen: h.todayFrozen,
                            remaining: h.freezesRemainingThisMonth,
                          })
                        }
                        onOpenDetail={(h) => {
                          haptic("light");
                          setDetailId(h.id);
                          setDetailOpen(true);
                        }}
                        onEdit={handleEdit}
                        onArchiveToggle={handleArchiveToggle}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
          </DndContext>

          {/* archived (collapsed) */}
          {archived.length > 0 && (
            <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen} className="mt-5">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={t("habits.archived.toggle")}
                  className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-2 text-start transition-colors hover:bg-card"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    {t("habits.archived.title")}
                    <span className="tnum rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {t("habits.archived.count", {
                        count: archived.length,
                        n: fmt.number(archived.length),
                      })}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform duration-200",
                      archivedOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                {archived.map((habit) => (
                  <ArchivedHabitCard
                    key={habit.id}
                    habit={habit}
                    celebrateNonce={0}
                    onToggleToday={() => undefined}
                    onFreezeToday={() => undefined}
                    onOpenDetail={(h) => {
                      haptic("light");
                      setDetailId(h.id);
                      setDetailOpen(true);
                    }}
                    onEdit={handleEdit}
                    onArchiveToggle={handleArchiveToggle}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {/* sheets */}
      <HabitEditorSheet open={editorOpen} onOpenChange={setEditorOpen} habit={editingHabit} />
      <HabitDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        habitId={detailId}
        todayKey={todayKey}
        onToggleDay={handleToggleDay}
        onFreezeToday={(habit, status) => handleFreezeToday(habit, status)}
        onEdit={handleEdit}
        onArchiveToggle={handleArchiveToggle}
      />
    </section>
  );
}

function RateChip({ label, rate, value }: { label: string; rate: number; value: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2"
      aria-label={`${label}: ${value}`}
    >
      <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tnum text-sm font-bold",
          rate >= 0.8 ? "text-success" : rate >= 0.5 ? "text-warning" : "text-danger"
        )}
      >
        {value}
      </span>
    </div>
  );
}
