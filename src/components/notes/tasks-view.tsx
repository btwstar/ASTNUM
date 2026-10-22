"use client";

/**
 * TasksView — "مهامي" segment.
 * Inline add bar (quick due/priority/repeat menu) + progress + Today/Overdue
 * sections + collapsible completed-today. Rows: 44px checkbox, priority dot,
 * due chip, repeat icon. Swipe: end→complete, start→postpone to tomorrow.
 * Checklist items inside notes only surface here when explicitly scheduled.
 *
 * v1.14 — add bar unified with the other segments' search-bar shape language
 * (rounded-full, same border/bg) and the options control is a labeled pill
 * (sliders icon + "خيارات" + count badge) instead of a bare icon tile — the
 * user found the icon-only square "ناقص/غير واضح" next to the bar.
 */
import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Plus,
  Repeat2,
  SlidersHorizontal,
  SquareCheckBig,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useCreateTask, useTasksTodayQuery, useUpdateTask } from "./api-hooks";
import { SwipeRow } from "./swipe-row";
import { EmptyState, InlineError, ListSkeleton } from "./empty-state";
import { TaskCheckbox, DueChip, PriorityDot, FromNoteBadge, StrikeText } from "./task-bits";
import { TaskMenu } from "./task-menu";
import {
  dueNextWeekISO,
  dueTodayISO,
  dueTomorrowISO,
  postponedISO,
  type RepeatType,
  type TaskDTO,
} from "./types";

const PRIORITY_OPTIONS: Array<{ value: number; key: string; dot: string }> = [
  { value: 0, key: "tasks.priority.high", dot: "bg-danger" },
  { value: 1, key: "tasks.priority.medium", dot: "bg-warning" },
  { value: 2, key: "tasks.priority.low", dot: "bg-muted-foreground" },
  { value: 3, key: "tasks.priority.none", dot: "bg-transparent border border-border" },
];
const REPEAT_OPTIONS: RepeatType[] = ["none", "daily", "weekly", "weekdays"];

export function TasksView() {
  const { t } = useI18n();
  const fmt = useFormat();
  const dateKey = useMemo(() => fmt.todayKey(), [fmt]);
  const query = useTasksTodayQuery(dateKey);
  const [showCompleted, setShowCompleted] = useState(false);

  const data = query.data;
  const total =
    (data?.today.length ?? 0) + (data?.overdue.length ?? 0) + (data?.completedToday.length ?? 0);
  const completed = data?.completedToday.length ?? 0;
  // upcoming tasks live OUTSIDE today's progress (they are not due today)
  const upcoming = data?.upcoming ?? [];
  const hasAny = total + upcoming.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <AddTaskBar />

      {total > 0 && (
        <div className="flex items-center gap-3 px-1" aria-live="polite">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-accent"
              initial={false}
              animate={{ width: `${Math.round((completed / total) * 100)}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
          <span className="tnum shrink-0 text-[11px] text-muted-foreground">
            {t("tasks.progress", { done: completed, total })}
          </span>
        </div>
      )}

      {query.isLoading ? (
        <ListSkeleton rows={4} height="h-16" />
      ) : query.isError ? (
        <InlineError onRetry={() => void query.refetch()} />
      ) : !hasAny ? (
        <EmptyState icon={SquareCheckBig} title={t("tasks.empty.title")} />
      ) : (
        <>
          {(data?.overdue.length ?? 0) > 0 && (
            <Section
              icon={AlertTriangle}
              titleKey="tasks.section.overdue"
              count={data?.overdue.length ?? 0}
              tone="danger"
            >
              {data?.overdue.map((task) => <TaskRow key={task.id} task={task} />)}
            </Section>
          )}

          <Section
            icon={SquareCheckBig}
            titleKey="tasks.section.today"
            count={data?.today.length ?? 0}
          >
            {data?.today.length === 0 ? (
              <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
                {t("tasks.empty.completed")}
              </p>
            ) : (
              data?.today.map((task) => <TaskRow key={task.id} task={task} />)
            )}
          </Section>

          {/* v1.15 (review finding 5): future-dated tasks finally have a home —
              they used to be invisible in مهامي until their day arrived */}
          {upcoming.length > 0 && (
            <Section
              icon={CalendarClock}
              titleKey="tasks.section.upcoming"
              count={upcoming.length}
            >
              {upcoming.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </Section>
          )}

          {(data?.completedToday.length ?? 0) > 0 && (
            <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl px-1 py-2 text-start transition-colors hover:bg-muted/50">
                <motion.span
                  animate={{ rotate: showCompleted ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex h-6 w-6 items-center justify-center"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                </motion.span>
                <h2 className="text-sm font-bold">{t("tasks.section.completed")}</h2>
                <Badge variant="secondary" className="tnum rounded-full">
                  {fmt.number(data?.completedToday.length ?? 0)}
                </Badge>
                <span className="ms-auto text-xs text-muted-foreground">
                  {t(showCompleted ? "tasks.hideCompleted" : "tasks.showCompleted")}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 flex flex-col gap-2 opacity-75">
                  {data?.completedToday.map((task) => <TaskRow key={task.id} task={task} />)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  titleKey,
  count,
  tone,
  children,
}: {
  icon: React.ElementType;
  titleKey: string;
  count: number;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <section aria-label={t(titleKey)}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon
          className={`h-4 w-4 ${tone === "danger" ? "text-danger" : "text-primary"}`}
          aria-hidden
        />
        <h2 className="text-sm font-bold">{t(titleKey)}</h2>
        <Badge variant="secondary" className="tnum rounded-full">
          {fmt.number(count)}
        </Badge>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function TaskRow({ task }: { task: TaskDTO }) {
  const { t } = useI18n();
  const updateTask = useUpdateTask();

  const toggle = () => {
    haptic("light");
    updateTask.mutate({ id: task.id, patch: { done: !task.doneToday } });
  };
  const postpone = () => {
    updateTask.mutate({ id: task.id, patch: { dueAt: postponedISO(task.dueAt) } });
    toast.success(t("tasks.postponedToast"));
  };

  return (
    <SwipeRow
      startAction={{
        icon: CalendarClock,
        label: t("tasks.postpone"),
        paneClass: "bg-warning/15 text-warning",
      }}
      endAction={{
        icon: Check,
        label: t("tasks.complete"),
        paneClass: "bg-success/15 text-success",
      }}
      onStart={postpone}
      onEnd={toggle}
    >
      <div className="card-hi flex items-center gap-1 rounded-2xl border border-border/50 bg-card py-1 pe-1 ps-0">
        <TaskCheckbox done={task.doneToday} onToggle={toggle} />
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-center gap-1.5">
            <PriorityDot priority={task.priority} />
            <StrikeText done={task.doneToday}>
              <span className="truncate text-sm font-medium leading-snug">{task.title}</span>
            </StrikeText>
            {task.repeating && (
              <Repeat2
                className="h-3.5 w-3.5 shrink-0 text-primary/80"
                aria-label={t("tasks.repeatingAria")}
              />
            )}
            {task.noteId && <FromNoteBadge />}
          </div>
          {task.dueAt && (
            <div className="mt-1 ps-0.5">
              <DueChip dueAt={task.dueAt} overdue={task.overdue} />
            </div>
          )}
        </div>
        <TaskMenu
          task={task}
          onDone={(done) => updateTask.mutate({ id: task.id, patch: { done } })}
        />
      </div>
    </SwipeRow>
  );
}

/* ── inline add bar ────────────────────────────────────────────── */

function AddTaskBar() {
  const { t } = useI18n();
  const fmt = useFormat();
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [repeat, setRepeat] = useState<RepeatType | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const text = title.trim();
    if (!text) return;
    haptic("medium");
    createTask.mutate({
      title: text,
      dueAt: due,
      priority: priority ?? 2,
      repeatRule: { type: repeat ?? "none" },
    });
    setTitle("");
    setDue(null);
    setPriority(null);
    setRepeat(null);
    inputRef.current?.focus();
  };

  const hasOptions = due !== null || priority !== null || repeat !== null;
  // how many options are set (drives the filter-count badge on the options button)
  const activeCount = [due !== null, priority !== null, repeat !== null].filter(
    Boolean
  ).length;
  const pill = (active: boolean) =>
    `min-h-9 rounded-full px-3 text-xs font-medium transition-colors ${
      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-accent"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="card-hi flex items-center gap-1.5 rounded-full border border-border/70 bg-card p-1.5 ps-4"
      >
        <SquareCheckBig className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("tasks.addPlaceholder")}
          aria-label={t("tasks.addAria")}
          maxLength={500}
          enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={t("tasks.optionsAria")}
              data-active={activeCount > 0 || undefined}
              className={
                "relative h-10 shrink-0 gap-1.5 rounded-full bg-muted/70 px-3 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 " +
                "data-[state=open]:bg-primary/15 data-[state=open]:text-primary " +
                "data-[active]:bg-primary/15 data-[active]:text-primary"
              }
            >
              <motion.span
                initial={false}
                animate={{ rotate: menuOpen ? 90 : 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
              </motion.span>
              <span className="whitespace-nowrap">{t("tasks.optionsLabel")}</span>
              {activeCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-accent px-1 text-[9px] font-bold leading-none text-primary-foreground shadow-sm ring-2 ring-card"
                >
                  {fmt.number(activeCount)}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 rounded-2xl p-3">
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                  {t("tasks.dueLabel")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "tasks.due.today", value: dueTodayISO() },
                    { key: "tasks.due.tomorrow", value: dueTomorrowISO() },
                    { key: "tasks.due.nextWeek", value: dueNextWeekISO() },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={pill(due === o.value)}
                      onClick={() => {
                        haptic("light");
                        setDue(due === o.value ? null : o.value);
                      }}
                    >
                      {t(o.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                  {t("tasks.priorityLabel")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`flex items-center gap-1.5 ${pill(priority === o.value)}`}
                      onClick={() => {
                        haptic("light");
                        setPriority(priority === o.value ? null : o.value);
                      }}
                    >
                      <span className={`h-2 w-2 rounded-full ${o.dot}`} aria-hidden />
                      {t(o.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                  {t("tasks.repeatLabel")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {REPEAT_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={pill(repeat === r)}
                      onClick={() => {
                        haptic("light");
                        setRepeat(repeat === r ? null : r);
                      }}
                    >
                      {t(`tasks.repeat.${r}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="submit"
          size="icon"
          disabled={!title.trim()}
          aria-label={t("tasks.addAria")}
          className="h-11 w-11 shrink-0 rounded-full bg-gradient-accent text-primary-foreground shadow-md shadow-primary/20 hover:bg-gradient-accent"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </form>

      {hasOptions && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {due && (
            <button
              type="button"
              onClick={() => setDue(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary"
            >
              {fmt.relative(due)}
              <span aria-hidden className="font-bold">
                ×
              </span>
            </button>
          )}
          {priority !== null && (
            <button
              type="button"
              onClick={() => setPriority(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary"
            >
              {t(`tasks.priority.${["high", "medium", "low", "none"][priority]}`)}
              <span aria-hidden className="font-bold">
                ×
              </span>
            </button>
          )}
          {repeat && (
            <button
              type="button"
              onClick={() => setRepeat(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary"
            >
              {t(`tasks.repeat.${repeat}`)}
              <span aria-hidden className="font-bold">
                ×
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
