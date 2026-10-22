"use client";

/**
 * حاسبة السعرات / Goals calculator sheet .
 * Mifflin-St Jeor (src/lib/logic/calories.ts) live preview + manual override.
 * Weight is prefilled from the latest body measurement (storage kg → display unit).
 * The form is a child component keyed by `open` so state resets on every open
 * without setState-in-effect (React "reset state with a key" pattern).
 * v2.4 (agent W-a): the same body profile now also previews + saves the daily
 * WATER goal (src/lib/logic/water.ts — weight × 35 ml + activity + goal extra,
 * clamped 1200..5000, rounded to 50). Manual mode gets a 5th ml input; formula
 * mode keeps water following the formula (formulaMeta.waterAuto).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Droplets, Loader2 } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { useAppStore } from "@/lib/store/app-store";
import { haptic } from "@/lib/haptics";
import { apiGet, apiPut } from "@/lib/api";
import {
  MIN_SAFE_KCAL,
  mifflinStJeor,
  roundTargets,
  type ActivityLevel,
  type FitnessGoal,
  type NutritionTargets,
  type Sex,
} from "@/lib/logic/calories";
import { waterTargetMl } from "@/lib/logic/water";
import {
  displayToLength,
  displayToWeight,
  lengthToDisplay,
  weightToDisplay,
} from "@/components/body/units";
import type { FormulaMeta, Goals } from "@/components/nutrition/shared";
import { parseFormulaMeta } from "@/components/nutrition/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ACTIVITY_STEPS: Array<{ value: ActivityLevel; key: string }> = [
  { value: 1.2, key: "sedentary" },
  { value: 1.375, key: "light" },
  { value: 1.55, key: "moderate" },
  { value: 1.725, key: "active" },
  { value: 1.9, key: "athlete" },
];

const GOAL_STEPS: Array<{ value: FitnessGoal; key: string }> = [
  { value: "cut", key: "cut" },
  { value: "maintain", key: "maintain" },
  { value: "bulk", key: "bulk" },
];

function parseNum(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Unified save shape for targets (goals API + manual inputs). */
interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ─────────────────────────── sheet shell ───────────────────────────

export function GoalsSheet({
  open,
  onOpenChange,
  focusWater = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** v2.4: scroll the water preview row into view once after mount
   * (set by the hydration card's goal chip → opened "with water focus"). */
  focusWater?: boolean;
}) {
  const { t } = useI18n();

  const goalsQuery = useQuery({
    queryKey: ["nutrition-goals"],
    queryFn: () => apiGet<{ goals: Goals }>("/api/nutrition/goals"),
    enabled: open,
  });
  const measureQuery = useQuery({
    queryKey: ["body-measurements"],
    queryFn: () =>
      apiGet<{ measurements: Array<{ id: string; date: string; weight: number | null }> }>(
        "/api/body/measurements"
      ),
    enabled: open,
  });

  const latestWeightKg = useMemo(() => {
    const rows = measureQuery.data?.measurements ?? [];
    const firstWithWeight = rows.find((r) => r.weight != null);
    return firstWithWeight?.weight ?? null;
  }, [measureQuery.data]);

  const loading = goalsQuery.isLoading || measureQuery.isLoading;
  const failed = goalsQuery.isError || measureQuery.isError;
  const goals = goalsQuery.data?.goals;

  const retry = () => {
    haptic("light");
    void goalsQuery.refetch();
    void measureQuery.refetch();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="slim-scroll max-h-[92vh] overflow-y-auto rounded-t-3xl px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-1">
          <SheetTitle className="text-start">{t("nutrition.calc.title")}</SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-6">
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-11 rounded-2xl" />
              <Skeleton className="h-11 rounded-2xl" />
              <Skeleton className="h-12 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
            </div>
          ) : failed || !goals ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{t("nutrition.loadError")}</p>
              <Button onClick={retry} variant="outline" className="h-11 rounded-2xl">
                {t("action.retry")}
              </Button>
            </div>
          ) : (
            open && (
              <CalcForm
                key={`calc-${open}`}
                goals={goals}
                latestWeightKg={latestWeightKg}
                focusWater={focusWater}
                onDone={() => onOpenChange(false)}
              />
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────── calculator form ───────────────────────────

function CalcForm({
  goals,
  latestWeightKg,
  focusWater,
  onDone,
}: {
  goals: Goals;
  latestWeightKg: number | null;
  focusWater: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const weightUnit = useAppStore((s) => s.weightUnit);
  const lengthUnit = useAppStore((s) => s.lengthUnit);

  const meta = parseFormulaMeta(goals);
  const weightUnitLabel = weightUnit === "lb" ? t("unit.lb") : t("unit.kg");
  const lengthUnitLabel = lengthUnit === "in" ? t("unit.in") : t("unit.cm");

  const [sex, setSex] = useState<Sex>(meta?.sex === "female" ? "female" : "male");
  const [goal, setGoal] = useState<FitnessGoal>(
    meta?.goal === "cut" || meta?.goal === "bulk" ? meta.goal : "maintain"
  );
  const [activity, setActivity] = useState<ActivityLevel>(
    ACTIVITY_STEPS.some((a) => a.value === meta?.activity)
      ? (meta?.activity as ActivityLevel)
      : 1.55
  );
  const [ageText, setAgeText] = useState(meta?.age != null ? String(meta.age) : "");
  const [heightText, setHeightText] = useState(
    meta?.heightCm != null
      ? String(Math.round(lengthToDisplay(meta.heightCm, lengthUnit) * 10) / 10)
      : ""
  );
  const [weightText, setWeightText] = useState(
    meta?.weightKg != null
      ? String(Math.round(weightToDisplay(meta.weightKg, weightUnit) * 10) / 10)
      : latestWeightKg != null
        ? String(Math.round(weightToDisplay(latestWeightKg, weightUnit) * 10) / 10)
        : ""
  );

  const [manual, setManual] = useState(false);
  const [kcalText, setKcalText] = useState(String(Math.round(goals.kcal)));
  const [proteinText, setProteinText] = useState(String(Math.round(goals.protein)));
  const [carbsText, setCarbsText] = useState(String(Math.round(goals.carbs)));
  const [fatText, setFatText] = useState(String(Math.round(goals.fat)));
  // v2.4: manual water goal (ml) — prefilled from the stored goal; toggleManual
  // refreshes it from the live formula preview when the manual grid appears.
  const [waterText, setWaterText] = useState(
    goals.waterMl > 0 ? String(Math.round(goals.waterMl)) : ""
  );
  const [saving, setSaving] = useState(false);

  // v2.4: scroll the water preview row into view once (hydration-card entry).
  // The sheet's slide-up CSS animation cancels smooth scrolls fired mid-open,
  // so we try right after mount AND again once the ~300ms animation is done —
  // the second call retargets the same position (harmless if the first landed).
  const waterScrollDone = useRef(false);
  useEffect(() => {
    if (!focusWater || waterScrollDone.current) return;
    waterScrollDone.current = true;
    const scrollWaterRow = () => {
      document
        .getElementById("calc-water-row")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    const t1 = window.setTimeout(scrollWaterRow, 120);
    const t2 = window.setTimeout(scrollWaterRow, 450);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focusWater]);

  /** Live Mifflin preview in STORAGE units (kg/cm) — recomputed on every keystroke. */
  const storageWeightKg = useMemo(() => {
    const parsed = parseNum(weightText);
    return weightText.trim() && parsed !== null ? displayToWeight(parsed, weightUnit) : null;
  }, [weightText, weightUnit]);

  const preview: NutritionTargets | null = useMemo(() => {
    const age = parseNum(ageText);
    const heightCm = heightText.trim() ? displayToLength(parseNum(heightText) ?? 0, lengthUnit) : null;
    if (age === null || age < 10 || age > 120) return null;
    if (heightCm === null || heightCm < 80 || heightCm > 250) return null;
    if (storageWeightKg === null || storageWeightKg < 20 || storageWeightKg > 400) return null;
    return roundTargets(
      mifflinStJeor({
        sex,
        weightKg: storageWeightKg,
        heightCm,
        age,
        activity,
        goal,
      })
    );
  }, [ageText, heightText, lengthUnit, storageWeightKg, sex, activity, goal]);

  /** v2.4: live hydration preview (ml, already rounded to the 50 step + clamped). */
  const waterPreview: number | null = useMemo(
    () =>
      preview && storageWeightKg !== null
        ? waterTargetMl({ weightKg: storageWeightKg, activity, goal }).waterMl
        : null,
    [preview, storageWeightKg, activity, goal]
  );

  /** Preview normalized to the save shape ({kcal, protein, carbs, fat}). */
  const formulaTargets: MacroTargets | null = useMemo(
    () =>
      preview
        ? { kcal: preview.kcal, protein: preview.proteinG, carbs: preview.carbsG, fat: preview.fatG }
        : null,
    [preview]
  );

  const manualTargets: MacroTargets | null = useMemo(() => {
    const kcal = parseNum(kcalText);
    const protein = parseNum(proteinText);
    const carbs = parseNum(carbsText);
    const fat = parseNum(fatText);
    if (kcal === null || protein === null || carbs === null || fat === null) return null;
    // server sanity ranges (800..10000 / 10..500 / 0..1500 / 5..400)
    if (kcal < 800 || kcal > 10000) return null;
    if (protein < 10 || protein > 500) return null;
    if (carbs < 0 || carbs > 1500) return null;
    if (fat < 5 || fat > 400) return null;
    return { kcal, protein, carbs, fat };
  }, [kcalText, proteinText, carbsText, fatText]);

  /** v2.4: manual water goal in ml — empty → 0 ("no water goal"), invalid → null
   * (blocks save exactly like an invalid macro field does). */
  const manualWaterMl: number | null = useMemo(() => {
    if (!manual) return 0;
    const trimmed = waterText.trim();
    if (!trimmed) return 0;
    const n = parseNum(trimmed);
    if (n === null || n < 0 || n > 8000) return null;
    return Math.round(n);
  }, [manual, waterText]);

  const effective = manual ? manualTargets : formulaTargets;
  const canSave =
    !saving && effective !== null && (manual ? manualWaterMl !== null : true);

  const save = async () => {
    if (!effective || (manual && manualWaterMl === null)) {
      haptic("heavy");
      return;
    }
    setSaving(true);
    try {
      const kcal = Math.round(effective.kcal);
      const protein = Math.round(effective.protein);
      const carbs = Math.round(effective.carbs);
      const fat = Math.round(effective.fat);
      // v2.4: formula mode → water follows the live preview; manual → the ml input.
      const waterMl = manual ? (manualWaterMl ?? 0) : (waterPreview ?? 0);

      const formulaMeta: FormulaMeta = manual
        ? { formula: "manual", manual: true, waterAuto: false }
        : {
            formula: "mifflin",
            sex,
            age: parseNum(ageText) ?? undefined,
            heightCm: heightText.trim() ? displayToLength(parseNum(heightText) ?? 0, lengthUnit) : undefined,
            weightKg: weightText.trim() ? displayToWeight(parseNum(weightText) ?? 0, weightUnit) : undefined,
            activity,
            goal,
            waterAuto: true,
          };

      await apiPut("/api/nutrition/goals", { kcal, protein, carbs, fat, waterMl, formulaMeta });
      haptic("medium");
      toast.success(t("nutrition.goalsSaved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["nutrition-goals"] }),
        queryClient.invalidateQueries({ queryKey: ["nutrition-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["nutrition-water"] }),
      ]);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const toggleManual = (next: boolean) => {
    haptic("light");
    // Prefill manual fields with the current preview (or existing goals) on first switch.
    if (next && formulaTargets) {
      setKcalText(String(Math.round(formulaTargets.kcal)));
      setProteinText(String(Math.round(formulaTargets.protein)));
      setCarbsText(String(Math.round(formulaTargets.carbs)));
      setFatText(String(Math.round(formulaTargets.fat)));
    }
    // v2.4: same prefill contract for water — live formula value, else the stored goal.
    if (next) {
      const waterPrefill = waterPreview != null ? waterPreview : goals.waterMl;
      setWaterText(waterPrefill > 0 ? String(Math.round(waterPrefill)) : "");
    }
    setManual(next);
  };

  return (
    <div className="space-y-4">
      {/* sex */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{t("nutrition.calc.sex")}</Label>
        <ToggleGroup
          type="single"
          value={sex}
          onValueChange={(v) => {
            if (v) {
              haptic("light");
              setSex(v as Sex);
            }
          }}
          aria-label={t("nutrition.calc.sex")}
          className="w-full rounded-2xl bg-muted/50 p-1"
        >
          <ToggleGroupItem value="male" className="h-10 flex-1 rounded-xl text-sm font-medium data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            {t("nutrition.calc.male")}
          </ToggleGroupItem>
          <ToggleGroupItem value="female" className="h-10 flex-1 rounded-xl text-sm font-medium data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            {t("nutrition.calc.female")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* goal */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{t("nutrition.calc.goal")}</Label>
        <ToggleGroup
          type="single"
          value={goal}
          onValueChange={(v) => {
            if (v) {
              haptic("light");
              setGoal(v as FitnessGoal);
            }
          }}
          aria-label={t("nutrition.calc.goal")}
          className="w-full rounded-2xl bg-muted/50 p-1"
        >
          {GOAL_STEPS.map(({ value, key }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-10 flex-1 rounded-xl text-xs font-medium data-[state=on]:bg-primary/15 data-[state=on]:text-primary sm:text-sm"
            >
              {t(`nutrition.calc.goal.${key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* activity */}
      <div className="space-y-1.5">
        <Label htmlFor="calc-activity" className="text-xs font-medium text-muted-foreground">
          {t("nutrition.calc.activity")}
        </Label>
        <Select
          value={String(activity)}
          onValueChange={(v) => {
            haptic("light");
            const next = Number(v);
            const step = ACTIVITY_STEPS.find((a) => a.value === next);
            if (step) setActivity(step.value);
          }}
        >
          <SelectTrigger id="calc-activity" className="h-12 w-full rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_STEPS.map(({ value, key }) => (
              <SelectItem key={key} value={String(value)} className="text-sm">
                {t(`nutrition.calc.activity.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* age / height / weight */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["calc-age", t("nutrition.calc.age"), ageText, setAgeText, "10"],
            ["calc-height", `${t("nutrition.calc.height")} (${lengthUnitLabel})`, heightText, setHeightText, "170"],
            ["calc-weight", `${t("nutrition.calc.weight")} (${weightUnitLabel})`, weightText, setWeightText, "70"],
          ] as const
        ).map(([id, label, value, setter, placeholder]) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id} className="block truncate text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <Input
              id={id}
              inputMode="decimal"
              dir="ltr"
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
              className="h-12 rounded-xl tabular-nums"
            />
          </div>
        ))}
      </div>

      {/* live preview */}
      <div className="rounded-2xl bg-muted/40 p-4">
        <p className="text-xs font-semibold">{t("nutrition.calc.preview")}</p>
        {preview ? (
          <>
            <div className="tnum mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("nutrition.calc.bmr")}: <b className="text-foreground">{fmt.number(preview.bmr)}</b>
              </span>
              <span>
                {t("nutrition.calc.tdee")}: <b className="text-foreground">{fmt.number(preview.tdee)}</b>
              </span>
            </div>
            <div className="tnum mt-3 grid grid-cols-4 gap-2 rounded-xl bg-primary/10 p-3 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">{t("nutrition.kcal")}</p>
                <p className="text-sm font-bold text-primary">{fmt.number(preview.kcal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t("nutrition.protein")}</p>
                <p className="text-sm font-bold">{fmt.number(preview.proteinG)} {t("unit.gram")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t("nutrition.carbs")}</p>
                <p className="text-sm font-bold">{fmt.number(preview.carbsG)} {t("unit.gram")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t("nutrition.fat")}</p>
                <p className="text-sm font-bold">{fmt.number(preview.fatG)} {t("unit.gram")}</p>
              </div>
            </div>
            {preview.capped && (
              <p
                className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 p-2.5 text-[11px] font-medium text-warning"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {t("nutrition.safeWarning", { value: fmt.number(MIN_SAFE_KCAL[sex]) })}
                  <Badge className="ms-1.5 rounded-full bg-warning/15 text-[9px] text-warning hover:bg-warning/15">
                    {t("nutrition.cappedBadge")}
                  </Badge>
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("nutrition.calc.validation")}</p>
        )}

        {/* v2.4: hydration target row — always mounted (focus-scroll target).
            Shows the live formula preview, or the currently stored goal while
            the form is still incomplete. */}
        <div
          id="calc-water-row"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-sky-500/10 px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Droplets className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold">{t("nutrition.water")}</p>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                {t("nutrition.water.autoHint")}
              </p>
            </div>
          </div>
          <p className="tnum shrink-0 text-sm font-bold text-sky-700 dark:text-sky-400">
            {waterPreview != null
              ? `≈ ${fmt.number(waterPreview)} ${t("nutrition.water.unit")}`
              : `${fmt.number(goals.waterMl)} ${t("nutrition.water.unit")}`}
          </p>
        </div>
      </div>

      {/* manual override */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("nutrition.calc.manualOverride")}</p>
        </div>
        <Switch
          checked={manual}
          onCheckedChange={toggleManual}
          aria-label={t("nutrition.calc.manualOverride")}
        />
      </div>

      {manual && (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["calc-m-kcal", t("nutrition.kcal"), kcalText, setKcalText],
              ["calc-m-protein", `${t("nutrition.protein")} (${t("unit.gram")})`, proteinText, setProteinText],
              ["calc-m-carbs", `${t("nutrition.carbs")} (${t("unit.gram")})`, carbsText, setCarbsText],
              ["calc-m-fat", `${t("nutrition.fat")} (${t("unit.gram")})`, fatText, setFatText],
              ["calc-m-water", `${t("nutrition.water")} (${t("nutrition.water.unit")})`, waterText, setWaterText],
            ] as const
          ).map(([id, label, value, setter]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                {label}
              </Label>
              <Input
                id={id}
                inputMode="decimal"
                dir="ltr"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
          ))}
        </div>
      )}

      <Button
        size="lg"
        disabled={!canSave}
        onClick={save}
        className="h-12 w-full rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("state.loading")}
          </>
        ) : (
          t("action.save")
        )}
      </Button>
    </div>
  );
}
