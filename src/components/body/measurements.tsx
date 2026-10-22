"use client";

/**
 * قياسات / Measurements .
 * Latest snapshot + add/edit sheet, Recharts trends with 7-day moving average,
 * before/after compare, history list, CSV export/import, progress photos (PIN-gated).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartGate } from "@/components/ui/chart-gate";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  Database,
  Download,
  History as HistoryIcon,
  Loader2,
  Plus,
  Ruler,
  Scale,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { useAppStore } from "@/lib/store/app-store";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProgressPhotos } from "@/components/body/photos";
import {
  displayToLength,
  displayToWeight,
  lengthRangeToDisplay,
  lengthToDisplay,
  weightRangeToDisplay,
  weightToDisplay,
} from "@/components/body/units";

// ─────────────────────────── types ───────────────────────────

interface MeasurementRow {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number | null;
  bodyFatPct: number | null;
  muscleMass: number | null;
  water: number | null;
  visceralFat: number | null;
  notes: string | null;
  circumferences: Record<string, number>;
}

const STORAGE_RANGES = {
  weight: { min: 20, max: 400 },
  bodyFat: { min: 2, max: 70 },
  muscleMass: { min: 5, max: 200 },
  water: { min: 20, max: 80 },
  visceralFat: { min: 1, max: 59 },
  circumference: { min: 20, max: 250 },
} as const;

const CIRC_PARTS = ["chest", "waist", "arm", "thigh", "hip"] as const;
type CircPart = (typeof CIRC_PARTS)[number];

interface FormState {
  date: string;
  weight: string;
  bodyFat: string;
  muscle: string;
  water: string;
  visceral: string;
  chest: string;
  waist: string;
  arm: string;
  thigh: string;
  hip: string;
  notes: string;
}

// ─────────────────────────── helpers ───────────────────────────

/** tolerant numeric parse: "" / "٬" safe, accepts dot or comma decimals */
function parseNum(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function fmtDayShort(dateKey: string): string {
  return dateKey.slice(5).replace("-", "/"); // MM/DD
}

// ─────────────────────────── main ───────────────────────────

export function MeasurementsScreen({ openSignal }: { openSignal: number }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const weightUnit = useAppStore((s) => s.weightUnit);
  const lengthUnit = useAppStore((s) => s.lengthUnit);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["body-measurements"],
    queryFn: () => apiGet<{ measurements: MeasurementRow[] }>("/api/body/measurements"),
  });

  const rows = data?.measurements ?? [];

  // sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MeasurementRow | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    date: "",
    weight: "",
    bodyFat: "",
    muscle: "",
    water: "",
    visceral: "",
    chest: "",
    waist: "",
    arm: "",
    thigh: "",
    hip: "",
    notes: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setField = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const startAdd = React.useCallback(() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const existing = rows.find((r) => r.date === today);
    setEditing(existing ?? null);
    setForm({
      date: today,
      weight:
        existing?.weight != null
          ? String(Math.round(weightToDisplay(existing.weight, weightUnit) * 10) / 10)
          : "",
      bodyFat: existing?.bodyFatPct != null ? String(existing.bodyFatPct) : "",
      muscle:
        existing?.muscleMass != null
          ? String(Math.round(weightToDisplay(existing.muscleMass, weightUnit) * 10) / 10)
          : "",
      water: existing?.water != null ? String(existing.water) : "",
      visceral: existing?.visceralFat != null ? String(existing.visceralFat) : "",
      chest:
        existing?.circumferences.chest != null
          ? String(Math.round(lengthToDisplay(existing.circumferences.chest, lengthUnit) * 10) / 10)
          : "",
      waist:
        existing?.circumferences.waist != null
          ? String(Math.round(lengthToDisplay(existing.circumferences.waist, lengthUnit) * 10) / 10)
          : "",
      arm:
        existing?.circumferences.arm != null
          ? String(Math.round(lengthToDisplay(existing.circumferences.arm, lengthUnit) * 10) / 10)
          : "",
      thigh:
        existing?.circumferences.thigh != null
          ? String(Math.round(lengthToDisplay(existing.circumferences.thigh, lengthUnit) * 10) / 10)
          : "",
      hip:
        existing?.circumferences.hip != null
          ? String(Math.round(lengthToDisplay(existing.circumferences.hip, lengthUnit) * 10) / 10)
          : "",
      notes: existing?.notes ?? "",
    });
    setErrors({});
    setSheetOpen(true);
  }, [rows, weightUnit, lengthUnit]);

  const openEdit = (row: MeasurementRow) => {
    haptic("light");
    startAddFromRow(row);
  };

  const startAddFromRow = (row: MeasurementRow) => {
    setEditing(row);
    setForm({
      date: row.date,
      weight: row.weight != null ? String(Math.round(weightToDisplay(row.weight, weightUnit) * 10) / 10) : "",
      bodyFat: row.bodyFatPct != null ? String(row.bodyFatPct) : "",
      muscle: row.muscleMass != null ? String(Math.round(weightToDisplay(row.muscleMass, weightUnit) * 10) / 10) : "",
      water: row.water != null ? String(row.water) : "",
      visceral: row.visceralFat != null ? String(row.visceralFat) : "",
      chest: row.circumferences.chest != null ? String(Math.round(lengthToDisplay(row.circumferences.chest, lengthUnit) * 10) / 10) : "",
      waist: row.circumferences.waist != null ? String(Math.round(lengthToDisplay(row.circumferences.waist, lengthUnit) * 10) / 10) : "",
      arm: row.circumferences.arm != null ? String(Math.round(lengthToDisplay(row.circumferences.arm, lengthUnit) * 10) / 10) : "",
      thigh: row.circumferences.thigh != null ? String(Math.round(lengthToDisplay(row.circumferences.thigh, lengthUnit) * 10) / 10) : "",
      hip: row.circumferences.hip != null ? String(Math.round(lengthToDisplay(row.circumferences.hip, lengthUnit) * 10) / 10) : "",
      notes: row.notes ?? "",
    });
    setErrors({});
    setSheetOpen(true);
  };

  // FAB / external open signal
  useEffect(() => {
    if (openSignal > 0) startAdd();
  }, [openSignal]);

  const validateAndBuild = (): Record<string, unknown> | null => {
    const next: Record<string, string> = {};
    const wRange = weightRangeToDisplay(STORAGE_RANGES.weight, weightUnit);
    const mRange = weightRangeToDisplay(STORAGE_RANGES.muscleMass, weightUnit);
    const cRange = lengthRangeToDisplay(STORAGE_RANGES.circumference, lengthUnit);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      next.date = t("body.validation.date");
    }

    const weight = parseNum(form.weight);
    if (weight !== null && (weight < wRange.min || weight > wRange.max)) {
      next.weight = t("body.validation.weight", {
        min: fmt.number(wRange.min),
        max: fmt.number(wRange.max),
      });
    }

    const bodyFat = parseNum(form.bodyFat);
    if (bodyFat !== null && (bodyFat < STORAGE_RANGES.bodyFat.min || bodyFat > STORAGE_RANGES.bodyFat.max)) {
      next.bodyFat = t("body.validation.bodyFat", {
        min: fmt.number(STORAGE_RANGES.bodyFat.min),
        max: fmt.number(STORAGE_RANGES.bodyFat.max),
      });
    }

    const muscle = parseNum(form.muscle);
    if (muscle !== null && (muscle < mRange.min || muscle > mRange.max)) {
      next.muscle = t("body.validation.muscleMass", {
        min: fmt.number(mRange.min),
        max: fmt.number(mRange.max),
      });
    }

    const water = parseNum(form.water);
    if (water !== null && (water < STORAGE_RANGES.water.min || water > STORAGE_RANGES.water.max)) {
      next.water = t("body.validation.water", {
        min: fmt.number(STORAGE_RANGES.water.min),
        max: fmt.number(STORAGE_RANGES.water.max),
      });
    }

    const visceral = parseNum(form.visceral);
    if (visceral !== null && (visceral < STORAGE_RANGES.visceralFat.min || visceral > STORAGE_RANGES.visceralFat.max)) {
      next.visceral = t("body.validation.visceral", {
        min: fmt.number(STORAGE_RANGES.visceralFat.min),
        max: fmt.number(STORAGE_RANGES.visceralFat.max),
      });
    }

    for (const part of CIRC_PARTS) {
      const value = parseNum(form[part]);
      if (value !== null && (value < cRange.min || value > cRange.max)) {
        next[part] = t("body.validation.circ", {
          part: t(`body.part.${part}`),
          min: fmt.number(cRange.min),
          max: fmt.number(cRange.max),
        });
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      haptic("heavy");
      return null;
    }

    const hasAny =
      [form.weight, form.bodyFat, form.muscle, form.water, form.visceral].some((v) => parseNum(v) !== null) ||
      CIRC_PARTS.some((p) => parseNum(form[p]) !== null) ||
      form.notes.trim().length > 0;
    if (!hasAny) {
      setErrors({ required: t("body.validation.required") });
      haptic("heavy");
      return null;
    }

    const circ: Record<string, number | null> = {};
    for (const part of CIRC_PARTS) {
      const value = parseNum(form[part]);
      circ[part] = value === null ? null : Math.round(displayToLength(value, lengthUnit) * 100) / 100;
    }

    return {
      date: form.date,
      weight: weight === null ? null : Math.round(displayToWeight(weight, weightUnit) * 100) / 100,
      bodyFatPct: bodyFat,
      muscleMass: muscle === null ? null : Math.round(displayToWeight(muscle, weightUnit) * 100) / 100,
      water,
      visceralFat: visceral,
      notes: form.notes.trim() || null,
      circumferences: circ,
    };
  };

  const save = async () => {
    const payload = validateAndBuild();
    if (!payload) return;
    setSaving(true);
    try {
      await apiPost("/api/body/measurements", payload);
      await queryClient.invalidateQueries({ queryKey: ["body-measurements"] });
      haptic("success");
      setSheetOpen(false);
      toast.success(t("state.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await apiDelete(`/api/body/measurements?id=${encodeURIComponent(editing.id)}`);
      await queryClient.invalidateQueries({ queryKey: ["body-measurements"] });
      haptic("heavy");
      setDeleteOpen(false);
      setSheetOpen(false);
      toast.success(t("state.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    }
  };

  const existsForDate = rows.some((r) => r.date === form.date);

  return (
    <div className="space-y-4 px-4">
      {/* snapshot */}
      {isLoading ? (
        <SnapshotSkeleton />
      ) : isError ? (
        <Card className="card-hi p-5">
          <p className="text-sm text-muted-foreground">{t("state.errorGeneric")}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => refetch()}>
            {t("action.retry")}
          </Button>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : (
        <SnapshotCard rows={rows} />
      )}

      {/* trends */}
      {rows.length >= 2 && <TrendsCard rows={rows} />}

      {/* before / after */}
      {rows.length >= 2 && <CompareCard rows={rows} />}

      {/* history */}
      {isLoading ? (
        <Card className="card-hi space-y-3 p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </Card>
      ) : rows.length > 0 ? (
        <HistoryList rows={rows} onEdit={openEdit} />
      ) : null}

      {/* data (CSV) */}
      <DataSection rows={rows} />

      {/* progress photos (PIN-gated) */}
      <ProgressPhotos />

      <p className="pb-2 text-center text-xs leading-relaxed text-muted-foreground">
        {t("body.disclaimer")}
      </p>

      {/* add / edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="slim-scroll max-h-[90vh] overflow-y-auto rounded-t-3xl px-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="px-5 pb-1">
            <SheetTitle className="text-start">
              {editing ? t("body.editMeasurement") : t("body.addMeasurement")}
            </SheetTitle>
            <SheetDescription className="text-start">{t("body.addHint")}</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 pb-6">
            {existsForDate && !editing && (
              <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning">
                {t("body.existsNote")}
              </p>
            )}

            {/* date */}
            <div className="space-y-1.5">
              <Label htmlFor="m-date" className="text-xs font-medium">
                {t("misc.date")}
              </Label>
              <Input
                id="m-date"
                type="date"
                dir="ltr"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="h-12 rounded-xl"
                aria-invalid={!!errors.date}
              />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>

            {/* metrics */}
            <div className="grid grid-cols-2 gap-3">
              <NumField
                id="m-weight"
                label={t("body.weight")}
                unitKey={`unit.${weightUnit}`}
                value={form.weight}
                onChange={(v) => setField("weight", v)}
                error={errors.weight}
              />
              <NumField
                id="m-bodyfat"
                label={t("body.bodyFat")}
                unitKey="unit.gram"
                value={form.bodyFat}
                onChange={(v) => setField("bodyFat", v)}
                error={errors.bodyFat}
                placeholder="%"
              />
              <NumField
                id="m-muscle"
                label={t("body.muscleMass")}
                unitKey={`unit.${weightUnit}`}
                value={form.muscle}
                onChange={(v) => setField("muscle", v)}
                error={errors.muscle}
              />
              <NumField
                id="m-water"
                label={t("body.water")}
                unitKey="unit.gram"
                value={form.water}
                onChange={(v) => setField("water", v)}
                error={errors.water}
                placeholder="%"
              />
              <NumField
                id="m-visceral"
                label={t("body.visceral")}
                value={form.visceral}
                onChange={(v) => setField("visceral", v)}
                error={errors.visceral}
              />
            </div>

            {/* circumferences */}
            <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Ruler className="h-4 w-4 text-primary" aria-hidden />
                {t("body.circumferences")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CIRC_PARTS.map((part) => (
                  <NumField
                    key={part}
                    id={`m-${part}`}
                    label={t(`body.part.${part}`)}
                    unitKey={`unit.${lengthUnit}`}
                    value={form[part]}
                    onChange={(v) => setField(part, v)}
                    error={errors[part]}
                  />
                ))}
              </div>
            </div>

            {/* notes */}
            <div className="space-y-1.5">
              <Label htmlFor="m-notes" className="text-xs font-medium">
                {t("body.notes")}
              </Label>
              <Textarea
                id="m-notes"
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder={t("body.notesPlaceholder")}
                className="min-h-20 rounded-xl"
              />
            </div>

            {errors.required && (
              <p className="text-xs text-destructive" role="alert">
                {errors.required}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              {editing && (
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-2xl border-destructive/40 text-destructive"
                  onClick={() => {
                    haptic("light");
                    setDeleteOpen(true);
                  }}
                  aria-label={t("action.delete")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
              <Button
                size="lg"
                disabled={saving}
                onClick={save}
                className="h-12 flex-1 rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
              >
                {saving ? t("state.loading") : t("action.save")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent dir="auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("body.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("body.deleteConfirm.desc", { date: editing ? fmt.date(editing.date + "T00:00:00") : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => haptic("light")}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────── pieces ───────────────────────────

function NumField(props: {
  id: string;
  label: string;
  unitKey?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const { id, label, unitKey, value, onChange, error, placeholder } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {unitKey ? ` (${t(unitKey)})` : ""}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        aria-invalid={!!error}
        className="h-12 rounded-xl tabular-nums"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Delta({
  diff,
  unitKey,
  invertGood,
  className,
}: {
  diff: number | null;
  unitKey?: string;
  invertGood?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  if (diff === null || Math.abs(diff) < 0.001) {
    return <span className={`text-xs text-muted-foreground ${className ?? ""}`}>—</span>;
  }
  const up = diff > 0;
  const good = invertGood ? up : !up;
  const signed = fmt.number(diff, { signDisplay: "always", maximumFractionDigits: 1 });
  const unit = unitKey ? ` ${t(unitKey)}` : "";
  return (
    <span className={`tnum flex items-center gap-1 text-xs font-semibold ${good ? "text-success" : "text-warning"} ${className ?? ""}`}>
      {up ? (
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
      )}
      <span>
        {signed}
        {unit}
      </span>
      <span className="sr-only">{up ? t("body.delta.up") : t("body.delta.down")}</span>
    </span>
  );
}

function SnapshotSkeleton() {
  return (
    <Card className="card-hi space-y-4 p-5" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-14 w-44" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </Card>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="card-hi flex flex-col items-center gap-3 p-8 text-center">
        <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/12">
          <Scale className="h-8 w-8 text-primary" />
        </span>
        <p className="text-lg font-semibold">{t("body.snapshot.empty")}</p>
        <Button
          onClick={() => {
            haptic("medium");
            onAdd();
          }}
          className="mt-1 h-12 min-w-44 rounded-2xl bg-gradient-accent font-semibold text-primary-foreground shadow-lg shadow-primary/25"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("body.addMeasurement")}
        </Button>
      </Card>
    </motion.div>
  );
}

function SnapshotCard({ rows }: { rows: MeasurementRow[] }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const weightUnit = useAppStore((s) => s.weightUnit);

  const latest = rows[0];
  const previous = rows[1] ?? null;

  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    diff: number | null;
    unitKey?: string;
    invertGood?: boolean;
  }> = [];

  if (latest.weight != null) {
    metrics.push({
      key: "weight",
      label: t("body.weight"),
      value: fmt.number(weightToDisplay(latest.weight, weightUnit), { maximumFractionDigits: 1 }),
      diff:
        previous?.weight != null
          ? weightToDisplay(latest.weight - previous.weight, weightUnit)
          : null,
      unitKey: `unit.${weightUnit}`,
    });
  }
  if (latest.bodyFatPct != null) {
    metrics.push({
      key: "bodyFat",
      label: t("body.bodyFat"),
      value: `${fmt.number(latest.bodyFatPct, { maximumFractionDigits: 1 })}%`,
      diff: previous?.bodyFatPct != null ? latest.bodyFatPct - previous.bodyFatPct : null,
    });
  }
  if (latest.muscleMass != null) {
    metrics.push({
      key: "muscle",
      label: t("body.muscleMass"),
      value: fmt.number(weightToDisplay(latest.muscleMass, weightUnit), { maximumFractionDigits: 1 }),
      diff:
        previous?.muscleMass != null
          ? weightToDisplay(latest.muscleMass - previous.muscleMass, weightUnit)
          : null,
      unitKey: `unit.${weightUnit}`,
      invertGood: true,
    });
  }
  if (latest.water != null) {
    metrics.push({
      key: "water",
      label: t("body.water"),
      value: `${fmt.number(latest.water, { maximumFractionDigits: 1 })}%`,
      diff: previous?.water != null ? latest.water - previous.water : null,
    });
  }
  if (latest.visceralFat != null) {
    metrics.push({
      key: "visceral",
      label: t("body.visceral"),
      value: fmt.number(latest.visceralFat, { maximumFractionDigits: 1 }),
      diff: previous?.visceralFat != null ? latest.visceralFat - previous.visceralFat : null,
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="card-hi p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{t("body.snapshot.title")}</p>
          <Badge variant="outline" className="rounded-full border-border/70 text-[11px] font-normal">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {fmt.date(latest.date + "T00:00:00", { day: "numeric", month: "short" })}
          </Badge>
        </div>

        {metrics.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">{t("body.snapshot.empty")}</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metrics.map((m) => (
              <div
                key={m.key}
                className="rounded-2xl bg-muted/40 px-4 py-3"
              >
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="tnum mt-0.5 flex items-baseline gap-1 text-2xl font-bold">
                  {m.value}
                  {m.unitKey && (
                    <span className="text-sm font-medium text-muted-foreground">{t(m.unitKey)}</span>
                  )}
                </p>
                <div className="mt-1">
                  <Delta diff={m.diff} unitKey={m.unitKey} invertGood={m.invertGood} />
                </div>
              </div>
            ))}
          </div>
        )}

        {previous && metrics.length > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">{t("body.snapshot.vs")}</p>
        )}
      </Card>
    </motion.div>
  );
}

// ─────────────────────────── trends ───────────────────────────

type TrendMetric = "weight" | "bodyFat" | "muscle" | "water";

const TREND_DEFS: Array<{
  id: TrendMetric;
  labelKey: string;
  rowKey: keyof MeasurementRow;
  kind: "weight" | "pct";
}> = [
  { id: "weight", labelKey: "body.trends.metric.weight", rowKey: "weight", kind: "weight" },
  { id: "bodyFat", labelKey: "body.trends.metric.bodyFat", rowKey: "bodyFatPct", kind: "pct" },
  { id: "muscle", labelKey: "body.trends.metric.muscle", rowKey: "muscleMass", kind: "weight" },
  { id: "water", labelKey: "body.trends.metric.water", rowKey: "water", kind: "pct" },
];

interface TrendPoint {
  date: string;
  label: string;
  value: number;
  ma: number;
}

function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function TrendsCard({ rows }: { rows: MeasurementRow[] }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const weightUnit = useAppStore((s) => s.weightUnit);
  const [metric, setMetric] = useState<TrendMetric>("weight");

  const def = TREND_DEFS.find((d) => d.id === metric)!;

  const points = useMemo<TrendPoint[]>(() => {
    const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
    const raw = asc
      .map((r) => ({ date: r.date, value: r[def.rowKey] }))
      .filter((p): p is { date: string; value: number } => typeof p.value === "number")
      .map((p) => ({
        date: p.date,
        value: def.kind === "weight" ? weightToDisplay(p.value, weightUnit) : p.value,
      }));
    if (raw.length < 2) return [];
    const ma = movingAverage(raw.map((p) => p.value));
    return raw.map((p, i) => ({ date: p.date, label: fmtDayShort(p.date), value: p.value, ma: ma[i] }));
  }, [rows, def, weightUnit]);

  const unitLabel = def.kind === "weight" ? t(`unit.${weightUnit}`) : "%";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="card-hi p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("body.trends.title")}</p>
          <ToggleGroup
            type="single"
            value={metric}
            onValueChange={(v) => {
              if (v) {
                haptic("light");
                setMetric(v as TrendMetric);
              }
            }}
            aria-label={t("body.trends.title")}
            className="gap-1 rounded-full bg-muted/60 p-1"
          >
            {TREND_DEFS.map((d) => (
              <ToggleGroupItem
                key={d.id}
                value={d.id}
                aria-label={t(d.labelKey)}
                className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
              >
                {t(d.labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {points.length < 2 ? (
          <p className="pt-6 pb-2 text-center text-sm text-muted-foreground">{t("body.trends.empty")}</p>
        ) : (
          <>
            <div dir="ltr" className="mt-3 h-56 w-full">
              {/* v1.15: ChartGate waits for real layout size — no more
                  "width(0) and height(0)" recharts dev warning on mount */}
              <ChartGate>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    hide
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={<TrendTip unitLabel={unitLabel} maLabel={t("body.trends.movingAverage")} rawLabel={t("body.trends.raw")} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="ma"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#trendFill)"
                    dot={false}
                    activeDot={false}
                    name={t("body.trends.movingAverage")}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--foreground)"
                    strokeOpacity={0.9}
                    strokeWidth={0}
                    dot={{ r: 2.6, fill: "var(--primary)", strokeWidth: 0 }}
                    activeDot={{ r: 4.5, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
                    name={t("body.trends.raw")}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </ChartGate>
            </div>
            <div className="mt-2 flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
                {t("body.trends.raw")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded-full bg-primary" />
                {t("body.trends.movingAverage")} (7)
              </span>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}

function TrendTip(props: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
    name?: string;
    payload?: unknown;
  }>;
  unitLabel: string;
  maLabel: string;
  rawLabel: string;
}) {
  const fmt = useFormat();
  const { active, payload, unitLabel } = props;
  if (!active || !payload || payload.length === 0) return null;
  const point = (payload[0] as { payload?: unknown } | undefined)?.payload as TrendPoint | undefined;
  if (!point) return null;
  const num = (v: number) => fmt.number(v, { maximumFractionDigits: 1 });
  return (
    <div dir="ltr" className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
      <p className="mb-1 font-semibold">{point.date}</p>
      <p className="tnum text-muted-foreground">
        {props.rawLabel}: <span className="font-semibold text-foreground">{num(point.value)} {unitLabel}</span>
      </p>
      <p className="tnum text-muted-foreground">
        {props.maLabel}: <span className="font-semibold text-foreground">{num(point.ma)} {unitLabel}</span>
      </p>
    </div>
  );
}

// ─────────────────────────── compare ───────────────────────────

function CompareCard({ rows }: { rows: MeasurementRow[] }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const weightUnit = useAppStore((s) => s.weightUnit);
  const lengthUnit = useAppStore((s) => s.lengthUnit);

  const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = asc[0];
  const latest = asc[asc.length - 1];

  const weightDiff = first.weight != null && latest.weight != null ? latest.weight - first.weight : null;
  const weightPct =
    weightDiff !== null && first.weight ? (weightDiff / first.weight) * 100 : null;
  const waistDiff =
    first.circumferences.waist != null && latest.circumferences.waist != null
      ? latest.circumferences.waist - first.circumferences.waist
      : null;
  const waistPct =
    waistDiff !== null && first.circumferences.waist
      ? (waistDiff / first.circumferences.waist) * 100
      : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="card-hi p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden />
          {t("body.compare.title")}
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="rounded-2xl bg-muted/40 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{t("body.compare.first")}</p>
            <p className="mt-0.5 text-xs">{fmt.date(first.date + "T00:00:00", { day: "numeric", month: "short" })}</p>
            <p className="tnum mt-1.5 text-xl font-bold">
              {first.weight != null
                ? fmt.number(weightToDisplay(first.weight, weightUnit), { maximumFractionDigits: 1 })
                : "—"}
              <span className="text-xs font-medium text-muted-foreground"> {first.weight != null ? t(`unit.${weightUnit}`) : ""}</span>
            </p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {t("body.compare.waist")}:{" "}
              {first.circumferences.waist != null
                ? fmt.number(lengthToDisplay(first.circumferences.waist, lengthUnit), { maximumFractionDigits: 1 })
                : "—"}
            </p>
          </div>

          <div className="flex h-full flex-col items-center justify-center gap-1 self-center px-1">
            <span aria-hidden className="text-lg text-primary">→</span>
          </div>

          <div className="rounded-2xl bg-primary/10 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{t("body.compare.latest")}</p>
            <p className="mt-0.5 text-xs">{fmt.date(latest.date + "T00:00:00", { day: "numeric", month: "short" })}</p>
            <p className="tnum mt-1.5 text-xl font-bold text-primary">
              {latest.weight != null
                ? fmt.number(weightToDisplay(latest.weight, weightUnit), { maximumFractionDigits: 1 })
                : "—"}
              <span className="text-xs font-medium text-muted-foreground"> {latest.weight != null ? t(`unit.${weightUnit}`) : ""}</span>
            </p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {t("body.compare.waist")}:{" "}
              {latest.circumferences.waist != null
                ? fmt.number(lengthToDisplay(latest.circumferences.waist, lengthUnit), { maximumFractionDigits: 1 })
                : "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          {weightDiff !== null && (
            <span className="flex items-center gap-1.5">
              <Delta diff={weightToDisplay(weightDiff, weightUnit)} unitKey={`unit.${weightUnit}`} />
              {weightPct !== null && (
                <span className="tnum text-muted-foreground">
                  ({fmt.number(weightPct, { signDisplay: "always", maximumFractionDigits: 1 })}%)
                </span>
              )}
            </span>
          )}
          {waistDiff !== null && (
            <span className="flex items-center gap-1.5">
              <Delta diff={lengthToDisplay(waistDiff, lengthUnit)} />
              {waistPct !== null && (
                <span className="tnum text-muted-foreground">
                  ({fmt.number(waistPct, { signDisplay: "always", maximumFractionDigits: 1 })}%)
                </span>
              )}
            </span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────── history ───────────────────────────

function HistoryList({ rows, onEdit }: { rows: MeasurementRow[]; onEdit: (row: MeasurementRow) => void }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const weightUnit = useAppStore((s) => s.weightUnit);

  return (
    <Card className="card-hi p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <HistoryIcon className="h-4 w-4 text-primary" aria-hidden />
        {t("body.history.title")}
        <span className="tnum text-xs font-normal text-muted-foreground">
          ({fmt.number(rows.length)})
        </span>
      </p>

      <ul className="slim-scroll mt-3 max-h-80 divide-y divide-border/60 overflow-y-auto" role="list">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onEdit(row)}
              aria-label={t("body.editMeasurement")}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 py-2.5 text-start transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <span className="text-sm">{fmt.date(row.date + "T00:00:00", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="tnum flex items-center gap-3 text-sm">
                {row.weight != null && (
                  <span>
                    {fmt.number(weightToDisplay(row.weight, weightUnit), { maximumFractionDigits: 1 })}
                    <span className="text-xs text-muted-foreground"> {t(`unit.${weightUnit}`)}</span>
                  </span>
                )}
                {row.bodyFatPct != null && (
                  <span className="text-muted-foreground">
                    {fmt.number(row.bodyFatPct, { maximumFractionDigits: 1 })}%
                  </span>
                )}
                <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground rtl:rotate-90" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────────── data (CSV) ───────────────────────────

const CSV_HEADERS = [
  "date",
  "weight_kg",
  "body_fat_pct",
  "muscle_mass_kg",
  "water_pct",
  "visceral_fat",
  "chest_cm",
  "waist_cm",
  "arm_cm",
  "thigh_cm",
  "hip_cm",
  "notes",
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** tolerant CSV parser (handles quoted fields with commas/escaped quotes) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  "التاريخ": "date",
  weight: "weight",
  weight_kg: "weight",
  "الوزن": "weight",
  body_fat: "bodyFat",
  body_fat_pct: "bodyFat",
  bf: "bodyFat",
  "الدهون": "bodyFat",
  muscle: "muscle",
  muscle_mass: "muscle",
  muscle_mass_kg: "muscle",
  "العضلات": "muscle",
  water: "water",
  water_pct: "water",
  "الماء": "water",
  visceral: "visceral",
  visceral_fat: "visceral",
  "الدهون_الحشوية": "visceral",
  chest: "chest",
  chest_cm: "chest",
  "الصدر": "chest",
  waist: "waist",
  waist_cm: "waist",
  "الخصر": "waist",
  arm: "arm",
  arm_cm: "arm",
  "الذراع": "arm",
  thigh: "thigh",
  thigh_cm: "thigh",
  "الفخذ": "thigh",
  hip: "hip",
  hip_cm: "hip",
  "الورك": "hip",
  notes: "notes",
  "ملاحظات": "notes",
};

function DataSection({ rows }: { rows: MeasurementRow[] }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error(t("body.export.empty"));
      return;
    }
    haptic("light");
    const lines = [CSV_HEADERS.join(",")];
    for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      lines.push(
        [
          r.date,
          r.weight ?? "",
          r.bodyFatPct ?? "",
          r.muscleMass ?? "",
          r.water ?? "",
          r.visceralFat ?? "",
          r.circumferences.chest ?? "",
          r.circumferences.waist ?? "",
          r.circumferences.arm ?? "",
          r.circumferences.thigh ?? "",
          r.circumferences.hip ?? "",
          csvEscape(r.notes ?? ""),
        ].join(",")
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astnum-measurements-${fmt.todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const pickFile = () => {
    haptic("light");
    fileRef.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const table = parseCsv(text);
      if (table.length < 2) {
        setPreviewRows(null);
        toast.error(t("body.import.none"));
        return;
      }
      const header = table[0].map((h) => h.trim().toLowerCase());
      const colIndex: Record<string, number> = {};
      header.forEach((h, i) => {
        const mapped = HEADER_ALIASES[h];
        if (mapped && colIndex[mapped] === undefined) colIndex[mapped] = i;
      });

      const out: Array<Record<string, unknown>> = [];
      for (const cells of table.slice(1)) {
        const get = (key: string) => {
          const i = colIndex[key];
          return i === undefined ? "" : (cells[i] ?? "").trim();
        };
        const date = get("date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const row: Record<string, unknown> = { date };
        const assign = (key: string, value: string) => {
          if (!value) return;
          const n = Number(value.replace(",", "."));
          if (Number.isFinite(n)) row[key] = n;
        };
        assign("weight", get("weight"));
        assign("bodyFatPct", get("bodyFat"));
        assign("muscleMass", get("muscle"));
        assign("water", get("water"));
        assign("visceralFat", get("visceral"));
        assign("chest", get("chest"));
        assign("waist", get("waist"));
        assign("arm", get("arm"));
        assign("thigh", get("thigh"));
        assign("hip", get("hip"));
        const notes = get("notes");
        if (notes) row.notes = notes.slice(0, 500);
        out.push(row);
      }

      if (out.length === 0) {
        setPreviewRows(null);
        toast.error(t("body.import.none"));
        return;
      }
      setPreviewRows(out);
    } catch {
      toast.error(t("state.errorGeneric"));
    } finally {
      setImporting(false);
    }
  };

  const doImport = async () => {
    if (!previewRows) return;
    setBusy(true);
    try {
      const result = await apiPost<{ imported: number; skipped: number }>("/api/body/import", {
        rows: previewRows,
      });
      await queryClient.invalidateQueries({ queryKey: ["body-measurements"] });
      haptic("success");
      const skipped =
        result.skipped > 0 ? t("body.import.skipped", { count: result.skipped }) : "";
      toast.success(t("body.import.imported", { count: result.imported }) + skipped);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setBusy(false);
      setPreviewRows(null);
    }
  };

  return (
    <Card className="card-hi p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Database className="h-4 w-4 text-primary" aria-hidden />
        {t("body.data.title")}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={exportCsv}
          className="h-11 min-w-11 rounded-2xl"
          aria-label={t("body.exportCsv")}
        >
          <Download className="h-4 w-4" aria-hidden />
          {t("body.exportCsv")}
        </Button>
        <Button
          variant="outline"
          onClick={pickFile}
          disabled={importing}
          className="h-11 min-w-11 rounded-2xl"
          aria-label={t("body.importCsv")}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {t("body.importCsv")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={onFile}
          aria-hidden
          tabIndex={-1}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("unit.kg")} / {t("unit.cm")} — CSV
      </p>

      <AlertDialog open={previewRows !== null} onOpenChange={(open) => !open && setPreviewRows(null)}>
        <AlertDialogContent dir="auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("body.import.previewTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("body.import.preview", { count: previewRows?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => haptic("light")}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-gradient-accent text-primary-foreground"
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the request finishes
                void doImport();
              }}
            >
              {busy ? t("state.loading") : t("action.import")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
