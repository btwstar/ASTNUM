"use client";

/**
 * Quick add — the PRIMARY food entry path (direct numbers, no search).
 * Values are per-portion; the client multiplies by quantity before POSTing.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Barcode, Database, Info, Minus, Plus } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MealSegmented } from "@/components/nutrition/meal-segmented";
import type { MealType } from "@/components/nutrition/shared";

function parseNum(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  meal: MealType;
  onMealChange: (meal: MealType) => void;
  onSaved: () => void;
  onOpenFoodSearch: () => void;
  onOpenBarcode: () => void;
}

export function QuickAddSheet(props: Props) {
  const { t } = useI18n();
  const fmt = useFormat();
  const { open, onOpenChange, date, meal, onMealChange, onSaved, onOpenFoodSearch, onOpenBarcode } = props;

  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [grams, setGrams] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [qtyText, setQtyText] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset on open
  useEffect(() => {
    if (open) {
      setName("");
      setKcal("");
      setProtein("");
      setCarbs("");
      setFat("");
      setGrams("");
      setQuantity(1);
      setQtyText("1");
      setError(null);
    }
  }, [open]);

  const total = useMemo(() => {
    const k = parseNum(kcal) ?? 0;
    const p = parseNum(protein) ?? 0;
    const c = parseNum(carbs) ?? 0;
    const f = parseNum(fat) ?? 0;
    return { kcal: k * quantity, protein: p * quantity, carbs: c * quantity, fat: f * quantity };
  }, [kcal, protein, carbs, fat, quantity]);

  const save = async () => {
    const k = parseNum(kcal);
    if (k === null || k <= 0 || k >= 5000) {
      setError(t("nutrition.validation.kcal"));
      haptic("heavy");
      return;
    }
    const p = parseNum(protein) ?? 0;
    const c = parseNum(carbs) ?? 0;
    const f = parseNum(fat) ?? 0;
    if (p < 0 || c < 0 || f < 0) {
      setError(t("nutrition.validation.negative"));
      haptic("heavy");
      return;
    }
    if (quantity < 0.1 || quantity > 100) {
      setError(t("nutrition.validation.quantity"));
      haptic("heavy");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await apiPost("/api/nutrition/logs", {
        date,
        mealType: meal,
        name: name.trim() || t("nutrition.mealDefault"),
        quantity,
        grams: parseNum(grams),
        kcal: Math.round(total.kcal * 100) / 100,
        protein: Math.round(total.protein * 100) / 100,
        carbs: Math.round(total.carbs * 100) / 100,
        fat: Math.round(total.fat * 100) / 100,
      });
      haptic("light");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const setQty = (value: number) => {
    haptic("light");
    setQuantity(value);
    setQtyText(String(value));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="slim-scroll max-h-[90vh] overflow-y-auto rounded-t-3xl px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-1">
          <SheetTitle className="text-start">{t("nutrition.quickAdd")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-5 pb-6">
          <MealSegmented value={meal} onChange={onMealChange} label={t("nutrition.meals")} />

          <div className="space-y-1.5">
            <Label htmlFor="q-name" className="text-xs font-medium text-muted-foreground">
              {t("nutrition.namePlaceholder")}
            </Label>
            <Input
              id="q-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("nutrition.namePlaceholder")}
              className="h-12 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-kcal" className="text-xs font-medium text-muted-foreground">
                {t("nutrition.kcal")} *
              </Label>
              <Input
                id="q-kcal"
                inputMode="decimal"
                dir="ltr"
                required
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="0"
                aria-required="true"
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-grams" className="text-xs font-medium text-muted-foreground">
                {t("nutrition.grams")} — {t("misc.optional")}
              </Label>
              <Input
                id="q-grams"
                inputMode="decimal"
                dir="ltr"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-protein" className="text-xs font-medium text-muted-foreground">
                {t("nutrition.protein")} ({t("unit.gram")}) — {t("misc.optional")}
              </Label>
              <Input
                id="q-protein"
                inputMode="decimal"
                dir="ltr"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-carbs" className="text-xs font-medium text-muted-foreground">
                {t("nutrition.carbs")} ({t("unit.gram")}) — {t("misc.optional")}
              </Label>
              <Input
                id="q-carbs"
                inputMode="decimal"
                dir="ltr"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-fat" className="text-xs font-medium text-muted-foreground">
                {t("nutrition.fat")} ({t("unit.gram")}) — {t("misc.optional")}
              </Label>
              <Input
                id="q-fat"
                inputMode="decimal"
                dir="ltr"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl tabular-nums"
              />
            </div>
          </div>

          {/* quantity stepper */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("nutrition.quantity")}</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                aria-label={t("nutrition.quantity")}
                onClick={() => setQty(Math.max(0.1, Math.round((quantity - 0.5) * 10) / 10))}
                className="h-11 w-11 shrink-0 rounded-xl"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <Input
                aria-label={t("nutrition.quantity")}
                inputMode="decimal"
                dir="ltr"
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value);
                  const n = parseNum(e.target.value);
                  if (n !== null && n > 0) setQuantity(n);
                }}
                className="tnum h-11 rounded-xl text-center"
              />
              <Button
                variant="outline"
                aria-label={t("nutrition.quantity")}
                onClick={() => setQty(Math.round((quantity + 0.5) * 10) / 10)}
                className="h-11 w-11 shrink-0 rounded-xl"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="flex gap-2 pt-1">
              {[0.5, 1, 2].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQty(q)}
                  aria-pressed={quantity === q}
                  className={`tnum min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors ${
                    quantity === q
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/50 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  ×{fmt.number(q)}
                </button>
              ))}
            </div>
          </div>

          {/* live total preview */}
          <p className="tnum rounded-xl bg-primary/10 px-3 py-2.5 text-center text-sm font-semibold text-primary">
            {t("nutrition.totalPreview", { kcal: fmt.number(Math.round(total.kcal)) })}
          </p>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5" aria-hidden />
            {t("nutrition.approx")}
          </p>

          <Button
            size="lg"
            disabled={saving}
            onClick={save}
            className="h-12 w-full rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {saving ? t("state.loading") : t("action.save")}
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onOpenFoodSearch}
              className="h-11 flex-1 rounded-2xl text-xs"
            >
              <Database className="h-4 w-4" aria-hidden />
              {t("nutrition.foodSearch")}
            </Button>
            <Button
              variant="outline"
              onClick={onOpenBarcode}
              className="h-11 flex-1 rounded-2xl text-xs"
            >
              <Barcode className="h-4 w-4" aria-hidden />
              {t("nutrition.barcode.title")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
