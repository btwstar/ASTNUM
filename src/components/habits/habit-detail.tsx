"use client";

/**
 * Habit detail — bottom Sheet: stats trio (current / best / week rate),
 * 35-day mini heatmap (done / frozen / missed / unscheduled, weekday-aligned
 * columns), freeze quota, note & reminder, edit + archive actions.
 * Tapping a PAST day retroactively toggles its completion log.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  Flame,
  Pencil,
  Snowflake,
  StickyNote,
  Target,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiGet } from "@/lib/api";
import { addDaysToKey } from "@/lib/logic/streak";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FREEZE_LIMIT,
  HabitIcon,
  hexA,
  isLightHex,
  type DetailHabit,
  type HabitDetailData,
} from "./shared";
import type { TranslateParams } from "@/lib/i18n";

export interface HabitDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitId: string | null;
  todayKey: string;
  onToggleDay: (habit: DetailHabit, date: string, currentDone: boolean) => void;
  onFreezeToday: (
    habit: DetailHabit,
    status: { todayFrozen: boolean; remaining: number }
  ) => void;
  onEdit: (habit: DetailHabit) => void;
  onArchiveToggle: (habit: DetailHabit, archived: boolean) => void;
}

type TFn = (key: string, params?: TranslateParams) => string;
type Fmt = ReturnType<typeof useFormat>;

/** Translated schedule summary, e.g. "Every day" / "Days: Mon, Wed" / "3 times a week". */
function scheduleSummaryText(
  t: TFn,
  fmt: Fmt,
  schedule: DetailHabit["schedule"]
): string {
  if (schedule.type === "daily") return t("habits.scheduleSummary.daily");
  if (schedule.type === "gymPlan") return t("habits.gym.scheduleSummary");
  if (schedule.type === "weekdays") {
    const days = (schedule.days ?? []).map((d) => t(`habits.weekday.${d}`)).join("، ");
    return t("habits.scheduleSummary.weekdays", { days });
  }
  const times = schedule.times ?? 3;
  return t("habits.timesPerWeek", { count: times, n: fmt.number(times) });
}

export function HabitDetailSheet({
  open,
  onOpenChange,
  habitId,
  todayKey,
  onToggleDay,
  onFreezeToday,
  onEdit,
  onArchiveToggle,
}: HabitDetailProps) {
  const { t } = useI18n();
  const fmt = useFormat();

  const { data, isLoading } = useQuery({
    queryKey: ["habits", "detail", habitId, todayKey],
    queryFn: () => apiGet<HabitDetailData>(`/api/habits/${habitId}?today=${todayKey}`),
    enabled: open && Boolean(habitId),
  });

  const habit = data?.habit;
  const summary = habit ? scheduleSummaryText(t, fmt, habit.schedule) : "";
  const isGymPlan = habit?.schedule.type === "gymPlan";

  const weekDayKeys = [0, 1, 2, 3, 4, 5, 6];

  const streakUnit = habit && habit.schedule.type === "timesPerWeek" ? "weeks" : "days";

  // gymPlan: the "week rate" card counts completed workouts in the trailing
  // 7 days instead (there are no scheduled days to form a rate from).
  const trailing7Done = data
    ? data.days.filter(
        (d) => d.done && d.date >= addDaysToKey(todayKey, -6)
      ).length
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92vh] max-w-md rounded-t-3xl border-t-0 px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="pb-0">
          <span aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25" />
          <SheetTitle className="sr-only">{t("habits.detail.title")}</SheetTitle>
          {habit && (
            <div className="flex items-center gap-3 px-1 pt-1 text-start">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: hexA(habit.color, 0.14), color: habit.color }}
              >
                <HabitIcon icon={habit.icon} size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold leading-tight">{habit.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("habits.detail.schedule")}: {summary}
                </span>
              </span>
            </div>
          )}
        </SheetHeader>

        {isLoading || !habit || !data ? (
          <div className="space-y-4 px-5 pb-8 pt-4">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : (
          <div className="slim-scroll flex-1 overflow-y-auto px-5 pb-6 pt-4">
            {/* stats trio */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-muted/40 p-3">
                <Flame className="h-5 w-5 text-warning" aria-hidden />
                <span className="tnum text-xl font-extrabold leading-none">
                  {fmt.number(data.streaks.current)}
                </span>
                <span className="text-center text-[10px] leading-tight text-muted-foreground">
                  {isGymPlan
                    ? t("habits.gym.completions")
                    : t("habits.streak.currentLabel")}
                  {!isGymPlan && streakUnit === "weeks"
                    ? ` · ${t("habits.streak.weeks", {
                        count: data.streaks.current,
                        n: fmt.number(data.streaks.current),
                      })}`
                    : ""}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-muted/40 p-3">
                <Trophy className="h-5 w-5 text-warning" aria-hidden />
                <span className="tnum text-xl font-extrabold leading-none">
                  {fmt.number(data.streaks.best)}
                </span>
                <span className="text-center text-[10px] leading-tight text-muted-foreground">
                  {t("habits.streak.bestLabel")}
                  {streakUnit === "weeks"
                    ? ` · ${t("habits.streak.weeks", {
                        count: data.streaks.best,
                        n: fmt.number(data.streaks.best),
                      })}`
                    : ""}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-muted/40 p-3">
                <Target className="h-5 w-5 text-primary" aria-hidden />
                <span className="tnum text-xl font-extrabold leading-none">
                  {isGymPlan
                    ? fmt.number(trailing7Done)
                    : fmt.number(data.weeklyRate, { style: "percent", maximumFractionDigits: 0 })}
                </span>
                <span className="text-center text-[10px] leading-tight text-muted-foreground">
                  {isGymPlan ? t("habits.gym.weekDone") : t("habits.detail.weekRate")}
                </span>
              </div>
            </div>

            {/* 35-day mini heatmap */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-3">
              <div className="mb-1.5 grid grid-cols-7 gap-1 text-center">
                {weekDayKeys.map((d) => (
                  <span key={d} className="text-[9px] font-medium text-muted-foreground/70">
                    {t(`habits.weekday.${d}`)}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {data.days.map((d) => {
                  const future = d.date > todayKey;
                  const isToday = d.date === todayKey;
                  // gymPlan: any PAST day may hold a retroactive completion log
                  // ("I did this workout that day") — the rotation then uses it.
                  const canToggle =
                    !future &&
                    d.date < todayKey &&
                    !habit.archived &&
                    (isGymPlan || d.scheduled || d.done);
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={!canToggle}
                      aria-label={`${fmt.date(`${d.date}T12:00:00`)} — ${
                        d.done
                          ? t("habits.detail.legend.done")
                          : d.frozen
                            ? t("habits.detail.legend.frozen")
                            : d.scheduled
                              ? t("habits.detail.legend.missed")
                              : t("habits.detail.legend.unscheduled")
                      }`}
                      onClick={() => {
                        if (!canToggle) return;
                        haptic("light");
                        onToggleDay(habit, d.date, d.done);
                      }}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg border transition-transform duration-100",
                        future && "invisible",
                        !future && canToggle && "active:scale-90",
                        isToday && "ring-2 ring-primary/70",
                        !d.done &&
                          !d.frozen &&
                          (d.scheduled
                            ? d.date < todayKey
                              ? "border-danger/25 bg-danger/15"
                              : "border-primary/40 bg-primary/10"
                            : "border-transparent bg-muted-foreground/10"),
                        d.frozen && "border-info/50 bg-info/20"
                      )}
                      style={
                        d.done ? { backgroundColor: habit.color, borderColor: habit.color } : undefined
                      }
                    >
                      {d.frozen && !d.done && <Snowflake className="h-4 w-4 text-info" aria-hidden />}
                      {d.done && (
                        <Check
                          className="h-4 w-4"
                          style={{ color: isLightHex(habit.color) ? "#0b1020" : "#f8fafc" }}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* legend */}
              <div
                aria-label={t("habits.detail.legend.aria")}
                className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                {(
                  [
                    ["done", "habits.detail.legend.done"],
                    ["frozen", "habits.detail.legend.frozen"],
                    ["missed", "habits.detail.legend.missed"],
                    ["unscheduled", "habits.detail.legend.unscheduled"],
                  ] as Array<["done" | "frozen" | "missed" | "unscheduled", string]>
                ).map(([kind, key]) => (
                  <span key={kind} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        kind === "frozen" && "bg-info/60",
                        kind === "missed" && "bg-danger/40",
                        kind === "unscheduled" && "bg-muted-foreground/15"
                      )}
                      style={kind === "done" ? { backgroundColor: habit.color } : undefined}
                    />
                    <span className="text-[10px] text-muted-foreground">{t(key)}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground/80">
                {t("habits.detail.tapHint")}
              </p>
            </div>

            {/* freeze status — meaningless for gymPlan habits (an unfinished
                workout is postponed, nothing can ever be "missed" or broken) */}
            {!isGymPlan && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
                <Snowflake className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {t("habits.detail.freezes")}{" "}
                  <span className="tnum text-muted-foreground">
                    {t("habits.freeze.used", {
                      n: fmt.number(data.freezesUsedThisMonth),
                      max: fmt.number(FREEZE_LIMIT),
                    })}
                  </span>
                </p>
              </div>
              {!habit.archived && !data.todayFrozen && !data.todayDone && data.freezesRemainingThisMonth > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl text-info"
                  onClick={() =>
                    onFreezeToday(habit, {
                      todayFrozen: data.todayFrozen,
                      remaining: data.freezesRemainingThisMonth,
                    })
                  }
                >
                  <Snowflake className="h-4 w-4" aria-hidden />
                  {t("habits.freeze.action")}
                </Button>
              )}
              {data.todayFrozen && (
                <span className="rounded-full bg-info/15 px-2 py-1 text-[10px] font-semibold text-info">
                  {t("habits.freeze.todayFrozen")}
                </span>
              )}
            </div>
            )}

            {/* reminder + note */}
            {(habit.reminderTime || habit.note) && (
              <div className="mt-3 space-y-2">
                {habit.reminderTime && (
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Bell className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="text-sm">
                      {t("habits.editor.reminder")}{" "}
                      <span className="tnum font-bold">{habit.reminderTime}</span>
                    </p>
                  </div>
                )}
                {habit.note && (
                  <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <StickyNote className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {habit.note}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* actions */}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-2xl"
                onClick={() => onEdit(habit)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("action.edit")}
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-2xl"
                onClick={() => onArchiveToggle(habit, habit.archived)}
              >
                {habit.archived ? (
                  <ArchiveRestore className="h-4 w-4" aria-hidden />
                ) : (
                  <Archive className="h-4 w-4" aria-hidden />
                )}
                {habit.archived ? t("action.unarchive") : t("action.archive")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
