"use client";

/**
 * Templates tab — workout template roster.
 *
 * Cards open a bottom sheet with the prescription (targetSets × targetReps per
 * exercise) and three actions: start (POST /api/gym/workouts {templateId} via
 * the parent, then the parent switches to the session tab), edit (sheet with
 * the shared exercise picker + steppers, PATCH), delete (AlertDialog confirm,
 * soft DELETE). "+ new template" opens the same editor in create mode.
 */
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarCheck2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Flame,
  Loader2,
  Minus,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  exerciseName,
  templateDisplayName,
  type GymExercise,
  type TemplateRow,
} from "./shared";
import { ExercisePickerSheet } from "./exercise-picker-sheet";

interface EditorRow {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: number;
}

export interface TemplatesTabProps {
  /** parent POSTs /api/gym/workouts and switches to the session tab */
  onStart: (templateId: string) => void;
  /** id of the template currently starting (disables its start button) */
  startingId: string | null;
}

const MIN_SETS = 1;
const MAX_SETS = 12;
const MIN_REPS = 1;
const MAX_REPS = 100;

export function TemplatesTab({ onStart, startingId }: TemplatesTabProps) {
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const qc = useQueryClient();

  const tplQuery = useQuery({
    queryKey: ["gym", "templates"],
    queryFn: () => apiGet<{ templates: TemplateRow[] }>("/api/gym/templates"),
    staleTime: 60 * 1000,
  });
  const templates = tplQuery.data?.templates ?? [];

  /* ── view sheet ─────────────────────────────────────────────────────── */
  const [viewTpl, setViewTpl] = useState<TemplateRow | null>(null);

  /* ── editor sheet ──────────────────────────────────────────────────── */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [formName, setFormName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [formDesc, setFormDesc] = useState("");
  // v1.17: dedicated weekdays (0=Sunday..6=Saturday); [] = any day
  const [formDays, setFormDays] = useState<number[]>([]);
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [rowsError, setRowsError] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setNameDirty(false);
    setFormDesc("");
    setFormDays([]);
    setRows([]);
    setNameError(false);
    setRowsError(false);
    setEditorOpen(true);
  };

  const openEdit = (tpl: TemplateRow) => {
    setEditing(tpl);
    // prefill with the language-appropriate side; PATCH only sends the name
    // when the user edits it (bilingual "AR | EN" storage stays intact).
    setFormName(templateDisplayName(tpl.name, lang));
    setNameDirty(false);
    setFormDesc(tpl.description ?? "");
    setFormDays([...tpl.days]);
    setRows(
      tpl.exercises.map((te) => ({
        exerciseId: te.exerciseId,
        name: te.exercise ? exerciseName(te.exercise, lang) : te.exerciseId,
        targetSets: te.targetSets,
        targetReps: te.targetReps,
      }))
    );
    setNameError(false);
    setRowsError(false);
    setViewTpl(null);
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const exercises = rows.map((r) => ({
        exerciseId: r.exerciseId,
        targetSets: r.targetSets,
        targetReps: r.targetReps,
      }));
      if (editing) {
        return apiPatch(`/api/gym/templates/${editing.id}`, {
          name: nameDirty ? formName.trim() : undefined,
          description: formDesc.trim() || null,
          days: formDays, // [] clears — explicit send keeps editor + DB in sync
          exercises,
        });
      }
      return apiPost("/api/gym/templates", {
        name: formName.trim(),
        description: formDesc.trim() || null,
        days: formDays,
        exercises,
      });
    },
    onSuccess: () => {
      toast.success(t("gym.templates.saved"));
      void qc.invalidateQueries({ queryKey: ["gym"] });
      setEditorOpen(false);
      setPickerOpen(false);
    },
    onError: () => toast.error(t("gym.templates.saveError")),
  });

  const submitEditor = () => {
    const nameMissing = !editing && formName.trim().length === 0;
    setNameError(nameMissing);
    setRowsError(rows.length === 0);
    if (nameMissing) {
      toast.error(t("gym.templates.needName"));
      return;
    }
    if (rows.length === 0) {
      toast.error(t("gym.templates.needExercises"));
      return;
    }
    saveMutation.mutate();
  };

  const handleEditorPick = (ex: GymExercise) => {
    if (rows.some((r) => r.exerciseId === ex.id)) {
      toast.info(t("gym.templates.alreadyAdded"));
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        exerciseId: ex.id,
        name: exerciseName(ex, lang),
        targetSets: 3,
        targetReps: 10,
      },
    ]);
    setRowsError(false);
  };

  const changeTarget = (index: number, field: "targetSets" | "targetReps", delta: number) => {
    haptic("light");
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (field === "targetSets") {
          return { ...row, targetSets: Math.min(MAX_SETS, Math.max(MIN_SETS, row.targetSets + delta)) };
        }
        return { ...row, targetReps: Math.min(MAX_REPS, Math.max(MIN_REPS, row.targetReps + delta)) };
      })
    );
  };

  const moveRow = (index: number, delta: -1 | 1) => {
    haptic("light");
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const removeRow = (index: number) => {
    haptic("medium");
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  /* ── delete confirm ────────────────────────────────────────────────── */
  const [deleteTpl, setDeleteTpl] = useState<TemplateRow | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gym/templates/${id}`),
    onSuccess: () => {
      toast.success(t("gym.templates.deleted"));
      void qc.invalidateQueries({ queryKey: ["gym"] });
      setDeleteTpl(null);
      setViewTpl(null);
      setEditorOpen(false);
    },
    onError: () => toast.error(t("gym.templates.deleteError")),
  });

  /* ── customize this template onto the habits list (gym-plan habit) ────
   * The linked workouts ROTATE in the habits list: the least-recently-done
   * one is "due today" and an unfinished workout keeps postponing itself
   * to the next day until it is completed — then the next one takes over. */
  const toHabitMutation = useMutation({
    mutationFn: (tpl: TemplateRow) =>
      apiPost<{ habit: { id: string }; created: boolean }>("/api/habits/from-template", {
        templateId: tpl.id,
        lang,
      }),
    onSuccess: (res, tpl) => {
      void qc.invalidateQueries({ queryKey: ["habits"] });
      if (res?.created) {
        toast.success(
          t("gym.templates.toHabitDone", { name: templateDisplayName(tpl.name, lang) })
        );
      } else {
        toast.info(t("gym.templates.alreadyHabit"));
      }
    },
    onError: () => toast.error(t("gym.templates.toHabitError")),
  });

  const countLabel = (n: number) =>
    t("gym.templates.exerciseCount", { count: n, n: fmt.number(n) });

  const viewName = viewTpl ? templateDisplayName(viewTpl.name, lang) : "";

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-3 px-4 pt-4">
      {/* new template */}
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-2xl border-dashed border-border text-sm font-semibold text-muted-foreground"
        onClick={() => {
          haptic("light");
          openCreate();
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("gym.templates.new")}
      </Button>

      {/* list */}
      {tplQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("gym.loading.aria")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center" role="status">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("gym.templates.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((tpl) => {
            const name = templateDisplayName(tpl.name, lang);
            return (
              <motion.li
                key={tpl.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setViewTpl(tpl);
                  }}
                  aria-label={name}
                  className="flex min-h-24 w-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {tpl.builtin && (
                        <Badge className="bg-primary/10 text-[9px] text-primary">
                          {t("gym.templates.builtin")}
                        </Badge>
                      )}
                      <ChevronDown
                        className="h-4 w-4 text-muted-foreground rtl:-scale-x-100"
                        aria-hidden
                      />
                    </span>
                  </span>
                  {tpl.description && (
                    <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {tpl.description}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {countLabel(tpl.exercises.length)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {tpl.days.length > 0 ? (
                      tpl.days.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary"
                        >
                          <CalendarCheck2 className="h-2.5 w-2.5" aria-hidden />
                          {t(`gym.dayShort.${d}`)}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        {t("gym.templates.daysAny")}
                      </span>
                    )}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
      <div className="h-24" aria-hidden />

      {/* template detail sheet */}
      <Sheet open={viewTpl !== null} onOpenChange={(open) => !open && setViewTpl(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
        >
          <SheetHeader className="pb-1">
            <SheetTitle className="text-start">{viewName}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1 text-start">
              {viewTpl?.days.length ? (
                viewTpl.days.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                  >
                    <CalendarCheck2 className="h-3 w-3" aria-hidden />
                    {t(`gym.day.${d}`)}
                  </span>
                ))
              ) : (
                <span className="text-xs">{countLabel(viewTpl?.exercises.length ?? 0)}</span>
              )}
              {viewTpl?.days.length ? (
                <span className="ms-1 text-xs">{countLabel(viewTpl.exercises.length)}</span>
              ) : null}
            </SheetDescription>
          </SheetHeader>

          <div className="slim-scroll flex-1 space-y-1.5 overflow-y-auto px-4 pb-4">
            <h3 className="pb-1 text-xs font-semibold text-muted-foreground">
              {t("gym.templates.exercises")}
            </h3>
            {viewTpl?.exercises.map((te) => (
              <div
                key={te.id}
                className="flex min-h-14 items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {te.exercise ? exerciseName(te.exercise, lang) : te.exerciseId}
                  </span>
                  {te.exercise && (
                    <span className="text-xs text-muted-foreground">
                      {t(`gym.equipment.${te.exercise.equipment}`)}
                    </span>
                  )}
                </span>
                <span className="tnum shrink-0 text-sm font-bold text-primary">
                  {fmt.number(te.targetSets)}×{fmt.number(te.targetReps)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 px-4 pb-4">
            <Button
              type="button"
              className="min-h-12 w-full rounded-2xl bg-gradient-accent text-base font-bold text-background shadow-lg shadow-primary/25"
              disabled={startingId !== null}
              aria-label={t("gym.templates.startAria", { name: viewName })}
              onClick={() => {
                if (!viewTpl) return;
                haptic("medium");
                onStart(viewTpl.id);
              }}
            >
              {startingId === viewTpl?.id ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  {t("state.loading")}
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" aria-hidden />
                  {t("gym.templates.start")}
                </>
              )}
            </Button>
            {/* customize onto the habits list → rotating gym program */}
            <Button
              type="button"
              variant="outline"
              disabled={toHabitMutation.isPending}
              aria-label={t("gym.templates.toHabit")}
              onClick={() => {
                if (!viewTpl) return;
                haptic("medium");
                toHabitMutation.mutate(viewTpl);
              }}
              className="min-h-11 w-full gap-1.5 rounded-2xl border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              {toHabitMutation.isPending && toHabitMutation.variables?.id === viewTpl?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Flame className="h-4 w-4" aria-hidden />
              )}
              {t("gym.templates.toHabit")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1.5 rounded-2xl text-sm font-semibold"
                aria-label={t("gym.templates.editAria", { name: viewName })}
                onClick={() => {
                  if (!viewTpl) return;
                  haptic("light");
                  openEdit(viewTpl);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("gym.templates.edit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1.5 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10"
                onClick={() => {
                  if (!viewTpl) return;
                  haptic("light");
                  setDeleteTpl(viewTpl);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("action.delete")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* template editor sheet (create / edit) */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
        >
          <SheetHeader className="pb-1">
            <SheetTitle className="text-start">
              {editing ? t("gym.templates.edit") : t("gym.templates.new")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {editing ? t("gym.templates.edit") : t("gym.templates.new")}
            </SheetDescription>
          </SheetHeader>

          <div className="slim-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-5">
            <div>
              <Label
                htmlFor="tpl-name"
                className="pb-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("gym.templates.namePlaceholder")}
              </Label>
              <Input
                id="tpl-name"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  setNameDirty(true);
                  setNameError(false);
                }}
                aria-invalid={nameError}
                maxLength={80}
                className={cn("min-h-11 rounded-2xl bg-muted/50", nameError && "border-danger")}
              />
              {nameError && (
                <p className="pt-1 text-xs text-danger" role="alert">
                  {t("gym.templates.needName")}
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="tpl-desc"
                className="pb-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("gym.templates.descPlaceholder")}
              </Label>
              <Input
                id="tpl-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                maxLength={300}
                className="min-h-11 rounded-2xl bg-muted/50"
              />
            </div>

            {/* v1.17 dedicated weekdays — the smart جدول اليوم source */}
            <div>
              <Label className="pb-1.5 text-xs font-medium text-muted-foreground">
                {t("gym.templates.days")}
              </Label>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t("gym.templates.days")}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const active = formDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      aria-label={t(`gym.day.${d}`)}
                      onClick={() => {
                        haptic("light");
                        setFormDays((prev) =>
                          prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
                        );
                      }}
                      className={cn(
                        "min-h-9 min-w-11 rounded-full border px-2 text-[11px] font-bold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t(`gym.dayShort.${d}`)}
                    </button>
                  );
                })}
              </div>
              <p className="pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {formDays.length > 0
                  ? t("gym.templates.daysHintNamed")
                  : t("gym.templates.daysHintAny")}
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {t("gym.templates.exercises")}
              </h3>
              {rows.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground" role="status">
                  {t("gym.templates.needExercises")}
                </p>
              )}
              <ul className="space-y-2">
                {rows.map((row, index) => (
                  <li
                    key={row.exerciseId}
                    className="space-y-2 rounded-2xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="tnum shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground"
                        >
                          {fmt.number(index + 1)}
                        </Badge>
                        <span className="truncate text-sm font-bold text-foreground">
                          {row.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted"
                          aria-label={t("gym.templates.moveUp")}
                          disabled={index === 0}
                          onClick={() => moveRow(index, -1)}
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted"
                          aria-label={t("gym.templates.moveDown")}
                          disabled={index === rows.length - 1}
                          onClick={() => moveRow(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-9 w-9 rounded-xl text-danger hover:bg-danger/10"
                          aria-label={t("gym.templates.remove")}
                          onClick={() => removeRow(index)}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </Button>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {t("gym.templates.targetSets")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="min-h-9 w-9 rounded-xl"
                            aria-label={t("gym.templates.targetSets")}
                            disabled={row.targetSets <= MIN_SETS}
                            onClick={() => changeTarget(index, "targetSets", -1)}
                          >
                            <Minus className="h-4 w-4" aria-hidden />
                          </Button>
                          <span className="tnum w-8 text-center text-sm font-bold tabular-nums text-foreground">
                            {fmt.number(row.targetSets)}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="min-h-9 w-9 rounded-xl"
                            aria-label={t("gym.templates.targetSets")}
                            disabled={row.targetSets >= MAX_SETS}
                            onClick={() => changeTarget(index, "targetSets", 1)}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </Button>
                        </span>
                      </div>
                      <div className="flex flex-1 items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {t("gym.templates.targetReps")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="min-h-9 w-9 rounded-xl"
                            aria-label={t("gym.templates.targetReps")}
                            disabled={row.targetReps <= MIN_REPS}
                            onClick={() => changeTarget(index, "targetReps", -1)}
                          >
                            <Minus className="h-4 w-4" aria-hidden />
                          </Button>
                          <span className="tnum w-8 text-center text-sm font-bold tabular-nums text-foreground">
                            {fmt.number(row.targetReps)}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="min-h-9 w-9 rounded-xl"
                            aria-label={t("gym.templates.targetReps")}
                            disabled={row.targetReps >= MAX_REPS}
                            onClick={() => changeTarget(index, "targetReps", 1)}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </Button>
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full rounded-2xl border-dashed border-border text-sm font-semibold text-muted-foreground"
                onClick={() => {
                  haptic("light");
                  setPickerOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t("gym.templates.addExercise")}
              </Button>
            </div>

            {rowsError && (
              <p className="text-xs text-danger" role="alert">
                {t("gym.templates.needExercises")}
              </p>
            )}

            <Button
              type="button"
              className="min-h-12 w-full rounded-2xl bg-gradient-accent text-base font-bold text-background shadow-lg shadow-primary/25"
              onClick={() => {
                haptic("medium");
                submitEditor();
              }}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  {t("state.loading")}
                </>
              ) : (
                t("action.save")
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* embedded exercise picker for the editor */}
      {editorOpen && (
        <ExercisePickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={handleEditorPick}
          showRecent={false}
        />
      )}

      {/* delete confirm */}
      <AlertDialog open={deleteTpl !== null} onOpenChange={(open) => !open && setDeleteTpl(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gym.templates.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gym.templates.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-2xl">
              {t("action.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-2xl bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                if (deleteTpl) deleteMutation.mutate(deleteTpl.id);
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
