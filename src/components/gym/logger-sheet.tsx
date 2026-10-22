"use client";

/**
 * FAST set logger bottom sheet — v1.8 professional input redesign.
 * v1.9: EDIT MODE — the same pro steppers now fix any logged set (active
 * session OR history): pass `editing` and the sheet hydrates from the set's
 * own values, saves via the parent's PATCH (closes on success — no
 * keep-open), and offers the delete action inline.
 *
 * Log flow target: open ("+ مجموعة") → ONE tap on the big save button. The
 * sheet arrives autofilled from the last work set of this session (suggestNext)
 * or the exercise's last performance (server-provided lastPerformance, shown
 * as a reference chip); steppers + numeric override adjust; setType segmented;
 * optional RPE. Enter-to-save works from both steppers. After a successful
 * save the sheet STAYS OPEN with the saved values as the new baseline (fast
 * consecutive sets) — the parent starts the rest timer + PR celebration.
 *
 * Layout: reps | weight side-by-side in boxed columns (Strong/Hevy-style),
 * halving the sheet height vs the old vertical stack.
 */
import React, { useEffect, useState } from "react";
import { Check, History, Minus, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import type { WeightUnit } from "@/lib/store/app-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  kgToDisplay,
  displayToKg,
  formatWeight,
  weightStep,
} from "./shared";

export interface LoggerInput {
  reps: number;
  weightKg: number;
  setType: string;
  rpe: number | null;
}

/** last performance of this exercise (previous session) — reference chip */
export interface LoggerLast {
  reps: number;
  weightKg: number;
  date: string;
}

/** an existing set being edited (edit mode) — hydrates ALL fields from it */
export interface LoggerEditing {
  setId: string;
  reps: number;
  weightKg: number;
  setType: string;
  rpe: number | null;
}

export interface LoggerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** exercise being logged — sheet is keyed by it */
  exercise: { id: string; name: string } | null;
  /** autofill computed by the parent at open time (session set → lastPerformance → default) */
  initial: { reps: number; weightKg: number; fromSuggestion: boolean } | null;
  /** last performance chip (server-provided); null → hidden */
  last: LoggerLast | null;
  /** edit mode: pass the set to fix — title, save label, close-on-save and the delete action all switch to edit semantics */
  editing?: LoggerEditing | null;
  weightUnit: WeightUnit;
  saving: boolean;
  /** parent performs the mutation; resolves with broken PR types or null on error */
  onSave: (input: LoggerInput) => Promise<string[] | null>;
  /** edit mode only — opens the parent's delete confirm for this set */
  onDelete?: () => void;
}

const SET_TYPES: Array<{ value: string; key: string }> = [
  { value: "warmup", key: "gym.setType.warmup" },
  { value: "work", key: "gym.setType.work" },
  { value: "failure", key: "gym.setType.failure" },
];

export function LoggerSheet({
  open,
  onOpenChange,
  exercise,
  initial,
  last,
  editing = null,
  weightUnit,
  saving,
  onSave,
  onDelete,
}: LoggerSheetProps) {
  const { t } = useI18n();
  const fmt = useFormat();
  const unitLabel = weightUnit === "lb" ? t("unit.lb") : t("unit.kg");
  const step = weightStep(weightUnit);
  const isEditing = editing !== null;

  const [reps, setReps] = useState(10);
  const [weightKg, setWeightKg] = useState(0);
  const [setType, setSetType] = useState("work");
  const [rpe, setRpe] = useState<number | null>(null);
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [flash, setFlash] = useState(0);

  // (Re)hydrate the form every time the sheet opens. EDIT mode hydrates
  // every field (setType + RPE included) from the set being fixed; log mode
  // keeps the autofill baseline. Deferred via microtask so we don't setState
  // synchronously inside the effect.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      if (editing) {
        setReps(editing.reps);
        setWeightKg(editing.weightKg);
        setSetType(editing.setType);
        setRpe(editing.rpe);
        setFromSuggestion(false);
      } else {
        setReps(Math.round(initial?.reps ?? 10));
        setWeightKg(initial?.weightKg ?? 0);
        setSetType("work");
        setRpe(null);
        setFromSuggestion(Boolean(initial?.fromSuggestion));
      }
      setFlash(0);
    });
  }, [open, initial, editing]);

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const displayWeight = kgToDisplay(weightKg, weightUnit);

  // clear the "saved" flash after a beat
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(0), 1400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const bumpWeight = (delta: number) => {
    haptic("light");
    setWeightKg((w) => Math.max(0, round3(w + displayToKg(delta, weightUnit))));
  };

  const handleSave = async () => {
    const prs = await onSave({ reps, weightKg, setType, rpe });
    if (prs !== null) {
      if (isEditing) {
        onOpenChange(false); // edit is done — close (no keep-open)
        return;
      }
      setFlash(Date.now()); // keep values — user logs the next set fast
    }
  };

  const saveOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !saving) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
      >
        <SheetHeader className="pb-1">
          <SheetTitle className="flex flex-col text-start">
            <span className="text-base">
              {isEditing ? t("gym.logger.editTitle") : t("gym.logger.title")}
            </span>
            {exercise && (
              <span className="truncate text-sm font-medium text-primary">
                {exercise.name}
              </span>
            )}
          </SheetTitle>
          {/* reference chip: this exercise's last performance (prev session) —
              hidden in edit mode (the set's own values are the baseline) */}
          {!isEditing && last ? (
            <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
              <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
              <span className="tnum">
                {t("gym.logger.lastChip", {
                  reps: fmt.number(last.reps),
                  weight: fmt.number(kgToDisplay(last.weightKg, weightUnit)),
                  unit: unitLabel,
                })}
              </span>
            </p>
          ) : (
            fromSuggestion && (
              <p className="pt-0.5 text-xs text-muted-foreground">
                {t("gym.logger.suggestion")}
              </p>
            )
          )}
        </SheetHeader>

        <div className="space-y-4 px-4 pb-5">
          {/* reps | weight — side-by-side boxed steppers */}
          <div className="grid grid-cols-2 gap-3">
            {/* reps column */}
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <Label
                htmlFor="logger-reps"
                className="flex w-full items-center justify-center gap-1 pb-2 text-[11px] font-medium text-muted-foreground"
              >
                {t("gym.logger.reps")}
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="min-h-11 w-11 shrink-0 rounded-xl"
                  aria-label={t("gym.logger.decReps")}
                  onClick={() => {
                    haptic("light");
                    setReps((r) => Math.max(0, r - 1));
                  }}
                  disabled={reps <= 0}
                >
                  <Minus className="h-5 w-5" aria-hidden />
                </Button>
                <Input
                  id="logger-reps"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  value={reps}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    setReps(Number.isFinite(n) && e.target.value !== "" ? Math.min(1000, Math.max(0, n)) : 0);
                  }}
                  onKeyDown={saveOnEnter}
                  className="tnum min-h-11 min-w-0 flex-1 rounded-xl border-0 bg-card text-center text-xl font-bold tabular-nums focus-visible:ring-1"
                  aria-label={t("gym.logger.reps")}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="min-h-11 w-11 shrink-0 rounded-xl"
                  aria-label={t("gym.logger.incReps")}
                  onClick={() => {
                    haptic("light");
                    setReps((r) => Math.min(1000, r + 1));
                  }}
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            </div>

            {/* weight column (display units; stored kg) */}
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <Label
                htmlFor="logger-weight"
                className="flex w-full items-center justify-center gap-1 pb-2 text-[11px] font-medium text-muted-foreground"
              >
                {t("gym.logger.weight")}
                <span className="text-[10px] opacity-70">({unitLabel})</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="min-h-11 w-11 shrink-0 rounded-xl"
                  aria-label={t("gym.logger.decWeight")}
                  onClick={() => bumpWeight(-step)}
                  disabled={weightKg <= 0}
                >
                  <Minus className="h-5 w-5" aria-hidden />
                </Button>
                <Input
                  id="logger-weight"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={step}
                  value={formatWeight(displayWeight)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value === "" || !Number.isFinite(n) || n < 0) {
                      setWeightKg(0);
                      return;
                    }
                    setWeightKg(round3(displayToKg(n, weightUnit)));
                  }}
                  onKeyDown={saveOnEnter}
                  className="tnum min-h-11 min-w-0 flex-1 rounded-xl border-0 bg-card text-center text-xl font-bold tabular-nums focus-visible:ring-1"
                  aria-label={t("gym.logger.weight")}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="min-h-11 w-11 shrink-0 rounded-xl"
                  aria-label={t("gym.logger.incWeight")}
                  onClick={() => bumpWeight(step)}
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            </div>
          </div>

          {/* setType segmented */}
          <div role="radiogroup" aria-label={t("gym.logger.setType")} className="grid grid-cols-3 gap-1.5">
            {SET_TYPES.map(({ value, key }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={setType === value}
                onClick={() => {
                  haptic("light");
                  setSetType(value);
                }}
                className={cn(
                  "min-h-11 rounded-2xl border text-sm font-semibold transition-colors",
                  setType === value
                    ? value === "warmup"
                      ? "border-warning/60 bg-warning/15 text-warning"
                      : value === "failure"
                        ? "border-danger/60 bg-danger/15 text-danger"
                        : "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>

          {/* optional RPE — compact inline row */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">{t("gym.logger.rpe")}</span>
              <span className="text-[10px] text-muted-foreground/70">{t("gym.logger.rpeHint")}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 w-10 rounded-xl text-muted-foreground"
                aria-label={t("gym.logger.decRpe")}
                disabled={rpe === null || rpe <= 1}
                onClick={() => {
                  haptic("light");
                  setRpe((v) => (v === null ? null : Math.max(1, Math.round((v - 0.5) * 2) / 2)));
                }}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <span className="tnum w-10 text-center text-base font-bold tabular-nums text-foreground">
                {rpe === null ? "—" : fmt.number(rpe, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 w-10 rounded-xl text-muted-foreground"
                aria-label={t("gym.logger.incRpe")}
                disabled={rpe !== null && rpe >= 10}
                onClick={() => {
                  haptic("light");
                  setRpe((v) => (v === null ? 7 : Math.min(10, Math.round((v + 0.5) * 2) / 2)));
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
              {rpe !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-11 w-9 rounded-xl text-muted-foreground"
                  aria-label={t("action.reset")}
                  onClick={() => {
                    haptic("light");
                    setRpe(null);
                  }}
                >
                  <span className="text-sm font-semibold" aria-hidden>
                    ✕
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* ONE-tap save (edit mode: save the fix instead) */}
          <div className="relative">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-13 w-full rounded-2xl bg-gradient-accent text-base font-bold text-background shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]"
            >
              {saving
                ? t("state.loading")
                : isEditing
                  ? t("gym.logger.editSave")
                  : t("gym.logger.save")}
            </Button>
            <AnimatePresence>
              {flash > 0 && (
                <motion.span
                  key={flash}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="absolute -top-7 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {t("gym.logger.saved")}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* edit mode only — remove the set entirely (confirm handled by parent) */}
          {isEditing && onDelete && (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              className="min-h-11 w-full gap-1.5 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("gym.set.deleteTitle")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
