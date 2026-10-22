"use client";

/**
 * CalendarSheet (v1.23) — the in-app month calendar the «التقويم» widget
 * deep-links into (astnum://open?tab=today&cal=YYYY-MM-DD) and the Today
 * tab's date button opens. Like the stock Android calendar:
 *
 *   • 6×7 month grid with month navigation, honoring the user's chosen
 *     first weekday (Settings → Calendar — same config as the month widget);
 *   • per-day marks (each toggleable in settings): scheduled sessions
 *     (primary), dated tasks (rose), completed habits (lime);
 *   • the selected day's panel: its workout sessions, its due tasks
 *     (occurrence-aware per date), its completed-habit count;
 *   • «add a task for this day» — an inline composer that creates the task
 *     with dueAt = that day (18:00 local, or +1h when already past);
 *   • «new note» — jumps to the notes quick-capture.
 *
 * Every mutation also pushes the widget snapshot so the home-screen
 * calendar, events and task widgets stay in lock-step with the sheet.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Dumbbell, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n, useFormat } from "@/lib/i18n";
import { translateKey } from "@/lib/i18n";
import { addDaysToKey, dayKeyToWeekday } from "@/lib/i18n/format";
import { haptic } from "@/lib/haptics";
import { useAppStore } from "@/lib/store/app-store";
import { useCreateTask, useUpdateTask } from "@/components/notes/api-hooks";
import { templateDisplayName } from "@/components/gym/shared";
import { pushWidgetSnapshot } from "@/lib/widgets/bridge";

/* ── API row subsets (only what this sheet reads) ───────────────────── */

interface TemplateRow {
  id: string;
  name: string | null;
  days: number[];
  exercises: Array<{ targetSets: number }>;
}

interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  doneToday: boolean;
  overdue: boolean;
  dueAt: string | null;
  repeating: boolean;
  noteId: string | null;
}

/* ── date-key helpers (mirror the widget snapshot builder) ─────────── */

function daysInMonthOf(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function firstOfMonth(key: string): string {
  return `${key.slice(0, 8)}01`;
}

/** Same day-of-month in the shifted month (clamped to that month's end). */
function shiftMonth(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const anchor = new Date(y, m - 1 + delta, 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const nextY = anchor.getFullYear();
  const nextM = String(anchor.getMonth() + 1).padStart(2, "0");
  return `${nextY}-${nextM}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** dueAt convention shared with the tasks view: 18:00 local of that day,
 *  or one hour from now when that moment already passed. */
function dueForDateKeyISO(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(y, m - 1, d, 18, 0, 0, 0);
  if (target.getTime() <= Date.now()) return new Date(Date.now() + 3_600_000).toISOString();
  return target.toISOString();
}

/* ── the sheet ─────────────────────────────────────────────────────── */

export default function CalendarSheet() {
  const { t, lang } = useI18n();
  const fmt = useFormat();

  const calendarDate = useAppStore((s) => s.calendarDate);
  const setCalendarDate = useAppStore((s) => s.setCalendarDate);
  const openGymWithTemplate = useAppStore((s) => s.openGymWithTemplate);
  const openNotesWithCompose = useAppStore((s) => s.openNotesWithCompose);
  // v2.4 calendar editor preferences (mirrored in the month widget)
  const calendarWeekStart = useAppStore((s) => s.calendarWeekStart);
  const calendarMarks = useAppStore((s) => s.calendarMarks);
  const open = calendarDate !== null;

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  // reset the composer on every (re)open — the established external-subscription
  // pattern (warm re-opens via subscribe, cold open via the mount microtask)
  useEffect(() => {
    const reset = () => {
      if (useAppStore.getState().calendarDate === null) return;
      setTitle("");
      setBusy(false);
    };
    const unsub = useAppStore.subscribe(reset);
    const timer = window.setTimeout(reset, 0);
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  const close = () => setCalendarDate(null);

  /* ── month grid data (only while open) ─────────────────────────── */

  const monthFirst = calendarDate ? firstOfMonth(calendarDate) : "";
  const monthLast = calendarDate
    ? `${monthFirst.slice(0, 8)}${String(daysInMonthOf(calendarDate)).padStart(2, "0")}`
    : "";

  const statsQuery = useQuery({
    queryKey: ["habits", "stats", "cal", monthFirst, monthLast],
    queryFn: () =>
      apiGet<{ days: Array<{ date: string; done: number }> }>(
        `/api/habits/stats?from=${monthFirst}&to=${monthLast}`
      ),
    enabled: open && !!monthFirst,
    staleTime: 0,
  });
  const tasksAllQuery = useQuery({
    queryKey: ["tasks", "all", "cal"],
    queryFn: () => apiGet<TaskRow[]>("/api/tasks?scope=all"),
    enabled: open,
    staleTime: 0,
  });
  const templatesQuery = useQuery({
    queryKey: ["gym", "templates", "cal"],
    queryFn: () => apiGet<{ templates: TemplateRow[] }>("/api/gym/templates"),
    enabled: open,
    staleTime: 0,
  });
  // occurrence-aware per-date view (repeating tasks land on their days)
  const dayTasksQuery = useQuery({
    queryKey: ["tasks", "day", calendarDate],
    queryFn: () =>
      apiGet<{ today: TaskRow[]; overdue: TaskRow[]; completedToday: TaskRow[] }>(
        `/api/tasks?scope=today&date=${calendarDate}`
      ),
    enabled: open && !!calendarDate,
    staleTime: 0,
  });

  const todayKey = fmt.todayKey();

  /* marks per day of the viewed month */
  const marks = useMemo(() => {
    const sessions = new Set<number>();
    for (const tpl of templatesQuery.data?.templates ?? []) {
      for (const d of tpl.days) sessions.add(d);
    }
    const prefix = monthFirst.slice(0, 8);
    const taskDays = new Set<string>();
    for (const task of tasksAllQuery.data ?? []) {
      if (task.done || task.repeating || !task.dueAt) continue;
      const key = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(task.dueAt));
      if (key.startsWith(prefix)) taskDays.add(key);
    }
    const habitDays = new Set<string>();
    for (const d of statsQuery.data?.days ?? []) {
      if (d.done > 0) habitDays.add(d.date);
    }
    return { sessions, taskDays, habitDays };
  }, [templatesQuery.data, tasksAllQuery.data, statsQuery.data, monthFirst]);

  const cells = useMemo(() => {
    if (!calendarDate) return [];
    const first = firstOfMonth(calendarDate);
    // v2.4 calendar editor: the grid starts on the user's chosen weekday
    // (same math as the widget snapshot builder)
    const start = addDaysToKey(first, -((dayKeyToWeekday(first) - calendarWeekStart + 7) % 7));
    const prefix = first.slice(0, 8);
    return Array.from({ length: 42 }, (_, i) => {
      const key = addDaysToKey(start, i);
      return {
        key,
        day: key.slice(8, 10),
        inMonth: key.startsWith(prefix),
        isToday: key === todayKey,
        isSel: key === calendarDate,
        hasSession: calendarMarks.session && marks.sessions.has(dayKeyToWeekday(key)),
        hasTask: calendarMarks.task && marks.taskDays.has(key),
        hasHabit: calendarMarks.habit && marks.habitDays.has(key),
      };
    });
  }, [calendarDate, marks, todayKey, calendarWeekStart, calendarMarks]);

  const monthLabel = calendarDate
    ? fmt.date(new Date(`${firstOfMonth(calendarDate)}T12:00:00`), { month: "long", year: "numeric" })
    : "";
  const dayLabel = calendarDate
    ? fmt.date(new Date(`${calendarDate}T12:00:00`), { weekday: "long", day: "numeric", month: "long" })
    : "";

  // weekday headers rotate so the user-chosen week start is the first column
  const dowLabels = useMemo(
    () =>
      Array.from(
        { length: 7 },
        (_, i) => translateKey(lang, `gym.dayShort.${(i + calendarWeekStart) % 7}`)
      ),
    [lang, calendarWeekStart]
  );

  const templates = templatesQuery.data?.templates ?? [];
  const daySessions = useMemo(() => {
    if (!calendarDate) return [];
    const wd = dayKeyToWeekday(calendarDate);
    return templates.filter((tpl) => tpl.days.includes(wd));
  }, [templates, calendarDate]);

  const dayTasks = useMemo(() => {
    const res = dayTasksQuery.data;
    if (!res) return [] as TaskRow[];
    const pending = [...(res.today ?? []), ...(res.overdue ?? [])];
    return pending.slice(0, 8);
  }, [dayTasksQuery.data]);

  const habitsDone = useMemo(() => {
    const found = (statsQuery.data?.days ?? []).find((d) => d.date === calendarDate);
    return found?.done ?? 0;
  }, [statsQuery.data, calendarDate]);

  /* ── actions ───────────────────────────────────────────────────── */

  const pickDay = (key: string) => {
    haptic("light");
    setCalendarDate(key);
  };

  const addTask = async () => {
    const text = title.trim();
    if (!calendarDate || !text || busy) return;
    setBusy(true);
    try {
      await createTask.mutateAsync({
        title: text,
        dueAt: dueForDateKeyISO(calendarDate),
        priority: 2,
        repeatRule: { type: "none" },
      });
      void pushWidgetSnapshot();
      haptic("success");
      toast.success(
        t("calendar.taskSaved", {
          date: fmt.date(new Date(`${calendarDate}T12:00:00`), { day: "numeric", month: "short" }),
        })
      );
      setTitle("");
    } catch {
      toast.error(t("state.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task: TaskRow) => {
    const done = !task.done;
    try {
      await updateTask.mutateAsync({ id: task.id, patch: { done } });
      void pushWidgetSnapshot();
      haptic(done ? "success" : "light");
    } catch {
      toast.error(t("state.errorGeneric"));
    }
  };

  const startSession = (templateId: string) => {
    haptic("medium");
    close();
    openGymWithTemplate(templateId);
  };

  const addNote = () => {
    haptic("light");
    close();
    openNotesWithCompose("note");
  };

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[86dvh] w-full max-w-lg flex-col gap-0 rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="border-b border-border/40 px-4 pt-4 pb-3 text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4.5 w-4.5 text-primary" aria-hidden />
            {t("calendar.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {/* month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("calendar.prevMonth")}
              onClick={() => {
                haptic("light");
                setCalendarDate(calendarDate ? shiftMonth(calendarDate, -1) : todayKey);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted transition-colors hover:bg-accent active:scale-95"
            >
              <ChevronLeft className="h-4.5 w-4.5" aria-hidden />
            </button>
            <p className="text-base font-bold">{monthLabel}</p>
            <button
              type="button"
              aria-label={t("calendar.nextMonth")}
              onClick={() => {
                haptic("light");
                setCalendarDate(calendarDate ? shiftMonth(calendarDate, 1) : todayKey);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted transition-colors hover:bg-accent active:scale-95"
            >
              <ChevronRight className="h-4.5 w-4.5" aria-hidden />
            </button>
          </div>

          {/* weekday headers */}
          <div className="grid grid-cols-7 gap-0.5" aria-hidden>
            {dowLabels.map((d) => (
              <span key={d} className="py-1 text-center text-[10px] font-bold text-muted-foreground">
                {d}
              </span>
            ))}
          </div>

          {/* month grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell) => (
              <button
                key={cell.key}
                type="button"
                disabled={!cell.inMonth}
                onClick={() => pickDay(cell.key)}
                aria-label={fmt.date(new Date(`${cell.key}T12:00:00`), { day: "numeric", month: "long" })}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-medium transition-colors",
                  cell.inMonth ? "hover:bg-muted/70 active:scale-95" : "opacity-0",
                  cell.isToday && "bg-primary font-bold text-primary-foreground",
                  !cell.isToday && cell.isSel && "bg-primary/15 font-bold text-primary",
                  !cell.isToday && !cell.isSel && cell.inMonth && "text-foreground"
                )}
              >
                <span className={cn("leading-none", cell.isToday && "font-bold")}>
                  {fmt.number(Number(cell.day))}
                </span>
                {(cell.hasSession || cell.hasTask || cell.hasHabit) && cell.inMonth && (
                  <span className="mt-0.5 flex h-1.5 items-center gap-0.5" aria-hidden>
                    {cell.hasSession && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    {cell.hasTask && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                    {cell.hasHabit && <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* legend — only the marks enabled in settings */}
          {(calendarMarks.session || calendarMarks.task || calendarMarks.habit) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
              {calendarMarks.session && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  {t("calendar.legendSession")}
                </span>
              )}
              {calendarMarks.task && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                  {t("calendar.legendTask")}
                </span>
              )}
              {calendarMarks.habit && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime-500" aria-hidden />
                  {t("calendar.legendHabit")}
                </span>
              )}
            </div>
          )}

          {/* the selected day panel */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{dayLabel}</p>
              {calendarDate === todayKey && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {t("calendar.today")}
                </span>
              )}
            </div>

            {dayTasksQuery.isLoading ? (
              <div className="mt-2 flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {/* sessions scheduled that weekday */}
                {daySessions.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="mt-2 flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Dumbbell className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">
                      {templateDisplayName(tpl.name, lang) || t("gym.templates.new")}
                    </span>
                    {calendarDate === todayKey && (
                      <button
                        type="button"
                        onClick={() => startSession(tpl.id)}
                        className="flex min-h-9 items-center rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
                      >
                        {t("widgets.s.pinStart")}
                      </button>
                    )}
                  </div>
                ))}

                {/* tasks due that day (occurrence-aware) */}
                {dayTasks.map((task) => {
                  const done = !!(task.doneToday || task.done);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => void toggleTask(task)}
                      className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-start transition-colors hover:bg-muted/60"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                          done ? "bg-primary text-primary-foreground" : "bg-muted text-transparent"
                        )}
                        aria-hidden
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs font-bold",
                          done && "text-muted-foreground line-through"
                        )}
                      >
                        {task.title}
                      </span>
                    </button>
                  );
                })}

                {/* habits completed that day */}
                {habitsDone > 0 && (
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/15 text-lime-600 dark:text-lime-400">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">
                      {t("calendar.habitsLabel")} · {fmt.number(habitsDone)}
                    </span>
                  </div>
                )}

                {daySessions.length === 0 && dayTasks.length === 0 && habitsDone === 0 && (
                  <p className="px-1 pt-3 pb-1 text-center text-xs text-muted-foreground">
                    {t("calendar.emptyDay")}
                  </p>
                )}

                {/* add a task for this day */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addTask();
                  }}
                  className="mt-3 flex items-center gap-2 rounded-full border border-border/70 bg-card p-1.5 ps-3"
                >
                  <Plus className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("calendar.addTaskPlaceholder")}
                    aria-label={t("calendar.addTaskAria")}
                    maxLength={500}
                    disabled={busy}
                    enterKeyHint="done"
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={busy || !title.trim()}
                    aria-label={t("calendar.addTaskAria")}
                    className="flex min-h-10 shrink-0 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
                  >
                    {t("action.save")}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={addNote}
                  className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground active:scale-[0.99]"
                >
                  <StickyNote className="h-4 w-4" aria-hidden />
                  {t("calendar.addNote")}
                </button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
