"use client";

/**
 * Add / edit habit — bottom Sheet with name, icon picker (24 lucide + emoji
 * row), color palette (8), schedule editor (daily / weekday chips / X-times
 * stepper), reminder time (+ honest web-build hint), optional note, save and
 * delete (with confirm).
 */
import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Dumbbell, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import type { HabitSchedule } from "@/lib/logic/streak";
import {
  COLOR_PALETTE,
  DEFAULT_HABIT_COLOR,
  EMOJI_CHOICES,
  ICON_CHOICES,
  HabitIcon,
  hexA,
  isLightHex,
  type EditorHabit,
} from "./shared";

type SchedType = HabitSchedule["type"];

export interface HabitEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit: EditorHabit | null;
}

const DEFAULT_TIME = "09:00";

export function HabitEditorSheet({ open, onOpenChange, habit }: HabitEditorProps) {
  const { t } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("lucide:Repeat2");
  const [color, setColor] = useState(DEFAULT_HABIT_COLOR);
  const [schedType, setSchedType] = useState<SchedType>("daily");
  const [days, setDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [times, setTimes] = useState(3);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const [note, setNote] = useState("");
  const [nameError, setNameError] = useState(false);
  const [daysError, setDaysError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // (Re)hydrate the form each time the sheet opens.
  // Deferred via microtask so we don't setState synchronously inside the effect.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      if (habit) {
        setName(habit.name);
        setIcon(habit.icon);
        setColor(habit.color);
        setSchedType(habit.schedule.type);
        const schedDays = habit.schedule.days;
        setDays([0, 1, 2, 3, 4, 5, 6].map((d) => schedDays?.includes(d) ?? false));
        setTimes(habit.schedule.times ?? 3);
        setReminderOn(Boolean(habit.reminderTime));
        setReminderTime(habit.reminderTime ?? DEFAULT_TIME);
        setNote(habit.note ?? "");
      } else {
        setName("");
        setIcon("lucide:Repeat2");
        setColor(DEFAULT_HABIT_COLOR);
        setSchedType("daily");
        setDays([true, true, true, true, true, false, false]);
        setTimes(3);
        setReminderOn(false);
        setReminderTime(DEFAULT_TIME);
        setNote("");
      }
      setNameError(false);
      setDaysError(false);
      setDeleteOpen(false);
    });
  }, [open, habit]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isGymPlan = habit?.schedule.type === "gymPlan";
      const schedule: HabitSchedule =
        schedType === "daily"
          ? { type: "daily" }
          : schedType === "weekdays"
            ? { type: "weekdays", days: days.flatMap((on, d) => (on ? [d] : [])) }
            : { type: "timesPerWeek", times };
      const body: Record<string, unknown> = {
        name: name.trim(),
        icon,
        color,
        reminderTime: reminderOn && reminderTime ? reminderTime : null,
        note: note.trim() || null,
      };
      // gymPlan schedule is linked to a workout template — it is NEVER edited
      // here (rotation semantics), so the field is simply not sent.
      if (!isGymPlan) body.schedule = schedule;
      if (habit) {
        return apiPatch(`/api/habits/${habit.id}`, body);
      }
      return apiPost("/api/habits", { ...body, schedule });
    },
    onSuccess: () => {
      haptic("medium");
      toast.success(t("state.saved"));
      qc.invalidateQueries({ queryKey: ["habits"] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t("state.errorGeneric"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/api/habits/${habit?.id}`),
    onSuccess: () => {
      haptic("medium");
      toast(t("state.deleted"));
      qc.invalidateQueries({ queryKey: ["habits"] });
      setDeleteOpen(false);
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t("state.errorGeneric"));
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(true);
      haptic("heavy");
      return;
    }
    if (schedType === "weekdays" && !days.some(Boolean)) {
      setDaysError(true);
      haptic("heavy");
      return;
    }
    haptic("light");
    saveMutation.mutate();
  };

  const toggleDay = (d: number) => {
    haptic("light");
    setDaysError(false);
    setDays((prev) => prev.map((on, i) => (i === d ? !on : on)));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90vh] max-w-md rounded-t-3xl border-t-0 px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="pb-0">
          <span
            aria-hidden
            className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25"
          />
          <SheetTitle className="text-center text-lg font-bold">
            {habit ? t("habits.editor.editTitle") : t("habits.editor.addTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="slim-scroll flex-1 overflow-y-auto px-5 pb-5">
          {/* name */}
          <div className="mt-3">
            <Label htmlFor="habit-name" className="text-xs font-medium text-muted-foreground">
              {t("habits.editor.name")}
            </Label>
            <Input
              id="habit-name"
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(false);
              }}
              placeholder={t("habits.editor.namePlaceholder")}
              aria-invalid={nameError}
              className="mt-1.5 h-12 rounded-xl text-base"
            />
            {nameError && (
              <p className="mt-1 text-xs text-danger">{t("habits.editor.nameRequired")}</p>
            )}
          </div>

          {/* icon */}
          <div className="mt-5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("habits.editor.icon")}
            </Label>
            <div
              role="radiogroup"
              aria-label={t("habits.editor.iconAria")}
              className="mt-2 grid grid-cols-8 gap-1.5"
            >
              {ICON_CHOICES.map(({ value, icon: Ic, key: iconKey }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={icon === value}
                  aria-label={t(iconKey)}
                  onClick={() => {
                    haptic("light");
                    setIcon(value);
                  }}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-xl border transition-all duration-150",
                    icon === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-foreground/70 hover:bg-muted"
                  )}
                >
                  <Ic className="h-5 w-5" aria-hidden />
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label={t("habits.editor.iconAria")} className="mt-1.5 grid grid-cols-10 gap-1.5">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={icon === e}
                  aria-label={e}
                  onClick={() => {
                    haptic("light");
                    setIcon(e);
                  }}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-xl border text-xl transition-all duration-150",
                    icon === e
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/40 hover:bg-muted"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* color */}
          <div className="mt-5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("habits.editor.color")}
            </Label>
            <div
              role="radiogroup"
              aria-label={t("habits.editor.colorAria")}
              className="mt-2 flex flex-wrap gap-2.5"
            >
              {COLOR_PALETTE.map(({ value: c, key: colorKey }) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t(colorKey)}
                  onClick={() => {
                    haptic("light");
                    setColor(c);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-150 active:scale-90"
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <Check
                      className="h-5 w-5"
                      style={{ color: isLightHex(c) ? "#0b1020" : "#f8fafc" }}
                      aria-hidden
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* schedule — locked to the workout rotation for gym-plan habits */}
          <div className="mt-5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("habits.editor.schedule")}
            </Label>
            {habit?.schedule.type === "gymPlan" ? (
              <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 p-3">
                <Dumbbell className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {t("habits.gym.locked")}
                </p>
              </div>
            ) : (
            <>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup">
              {(
                [
                  ["daily", "habits.editor.schedule.daily"],
                  ["weekdays", "habits.editor.schedule.weekdays"],
                  ["timesPerWeek", "habits.editor.schedule.timesPerWeek"],
                ] as Array<[SchedType, string]>
              ).map(([value, key]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={schedType === value}
                  onClick={() => {
                    haptic("light");
                    setSchedType(value);
                    if (value === "weekdays" && !days.some(Boolean)) setDays([true, false, true, false, true, false, false]);
                  }}
                  className={cn(
                    "min-h-11 rounded-lg px-2 text-[13px] font-semibold transition-all duration-150",
                    schedType === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            {schedType === "weekdays" && (
              <div className="mt-2.5">
                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((on, d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-xl border text-[11px] font-semibold transition-all duration-150",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t(`habits.weekday.${d}`)}
                    </button>
                  ))}
                </div>
                {daysError && (
                  <p className="mt-1 text-xs text-danger">{t("habits.editor.weekdaysRequired")}</p>
                )}
              </div>
            )}

            {schedType === "timesPerWeek" && (
              <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-2">
                <button
                  type="button"
                  aria-label={t("habits.editor.timesDec")}
                  onClick={() => {
                    haptic("light");
                    setTimes((n) => Math.max(1, n - 1));
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-card text-foreground transition-colors hover:bg-accent"
                >
                  <Minus className="h-5 w-5" aria-hidden />
                </button>
                <span className="tnum flex-1 text-center text-[15px] font-bold">
                  {t("habits.timesPerWeek", { count: times, n: fmt.number(times) })}
                </span>
                <button
                  type="button"
                  aria-label={t("habits.editor.timesInc")}
                  onClick={() => {
                    haptic("light");
                    setTimes((n) => Math.min(7, n + 1));
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-card text-foreground transition-colors hover:bg-accent"
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </button>
              </div>
            )}
            </>
            )}
          </div>

          {/* reminder */}
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="min-w-0">
                <Label htmlFor="habit-reminder" className="text-sm font-semibold">
                  {t("habits.editor.reminderEnable")}
                </Label>
              </div>
              <Switch
                id="habit-reminder"
                checked={reminderOn}
                onCheckedChange={(v) => {
                  haptic("light");
                  setReminderOn(v);
                }}
              />
            </div>
            {reminderOn && (
              <Input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value || DEFAULT_TIME)}
                className="mt-2 h-12 rounded-xl text-base"
                aria-label={t("habits.editor.reminder")}
              />
            )}
          </div>

          {/* note */}
          <div className="mt-5">
            <Label htmlFor="habit-note" className="text-xs font-medium text-muted-foreground">
              {t("habits.editor.note")}
            </Label>
            <Textarea
              id="habit-note"
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("habits.editor.notePlaceholder")}
              className="mt-1.5 rounded-xl"
            />
          </div>

          {/* preview */}
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: hexA(color, 0.14), color }}
            >
              <HabitIcon icon={icon} size={22} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {name.trim() || t("habits.editor.namePlaceholder")}
            </span>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-border px-5 pb-6 pt-4">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="h-12 w-full rounded-2xl bg-gradient-accent text-base font-bold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {t("habits.editor.save")}
          </Button>
          {habit && (
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="mt-2 h-11 w-full rounded-2xl text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("action.delete")}
            </Button>
          )}
        </div>

        {/* delete confirm */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="max-w-sm rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("habits.editor.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("habits.editor.deleteBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel className="mt-0 flex-1 rounded-2xl">
                {t("action.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault(); // keep the dialog open until the mutation settles
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-2xl bg-danger text-white hover:bg-danger/90"
              >
                {t("habits.editor.deleteConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
