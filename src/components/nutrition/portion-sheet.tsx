"use client";

/**
 * Portion sheet — pick how much of a selected food (from the local DB or a
 * barcode lookup) to log. Convention shown clearly:
 *   servingG != null → values are per 100 g (portion = grams)
 *   servingG == null → values are per piece/portion (portion = count)
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiPost } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MealSegmented } from "@/components/nutrition/meal-segmented";
import type { FoodRow, MealType } from "@/components/nutrition/shared";

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
  food: FoodRow | null;
  meal: MealType;
  onMealChange: (meal: MealType) => void;
  onSaved: () => void;
}

export function PortionSheet(props: Props) {
  const { t } = useI18n();
  const fmt = useFormat();
  const { open, onOpenChange, date, food, meal, onMealChange, onSaved } = props;

  const per100g = food?.servingG != null;
  const [grams, setGrams] = useState(100);
  const [gramsText, setGramsText] = useState("100");
  const [count, setCount] = useState(1);
  const [countText, setCountText] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && food) {
      if (food.servingG != null) {
        setGrams(food.servingG);
        setGramsText(String(food.servingG));
      } else {
        setGrams(100);
        setGramsText("100");
      }
      setCount(1);
      setCountText("1");
    }
  }, [open, food]);

  const preview = useMemo(() => {
    if (!food) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    if (per100g) {
      const factor = grams / 100;
      return {
        kcal: food.kcal * factor,
        protein: food.protein * factor,
        carbs: food.carbs * factor,
        fat: food.fat * factor,
      };
    }
    return {
      kcal: food.kcal * count,
      protein: food.protein * count,
      carbs: food.carbs * count,
      fat: food.fat * count,
    };
  }, [food, per100g, grams, count]);

  if (!food) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const save = async () => {
    if (!food) return;
    if (per100g && (grams < 1 || grams > 5000)) {
      haptic("heavy");
      return;
    }
    if (!per100g && (count < 0.1 || count > 100)) {
      haptic("heavy");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/nutrition/logs", {
        date,
        mealType: meal,
        foodId: food.id,
        name: food.nameAr,
        quantity: per100g ? grams / 100 : count, // units of 100g, or piece count
        grams: per100g ? grams : null,
        kcal: round2(preview.kcal),
        protein: round2(preview.protein),
        carbs: round2(preview.carbs),
        fat: round2(preview.fat),
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="slim-scroll max-h-[90vh] overflow-y-auto rounded-t-3xl px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-1">
          {food.imageThumb ? (
            <div className="mx-auto h-20 w-20 overflow-hidden rounded-2xl border border-border/50 shadow-sm">
              <img
                src={food.imageThumb}
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
              />
            </div>
          ) : null}
          <SheetTitle className="text-start">{food.nameAr}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-start">
            <span className="text-foreground">{food.nameEn}</span>
            {food.brand && <Badge variant="outline" className="rounded-full text-[10px]">{food.brand}</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-5 pb-6">
          {/* convention badge */}
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("nutrition.portion")}</span>
              <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/15">
                {per100g ? t("nutrition.per100g") : t("nutrition.perPiece")}
              </Badge>
            </p>
            <p className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {fmt.number(food.kcal, { maximumFractionDigits: 1 })} {t("unit.kcal")}
              </span>
              <span>
                {t("nutrition.protein")} {fmt.number(food.protein, { maximumFractionDigits: 1 })}
              </span>
              <span>
                {t("nutrition.carbs")} {fmt.number(food.carbs, { maximumFractionDigits: 1 })}
              </span>
              <span>
                {t("nutrition.fat")} {fmt.number(food.fat, { maximumFractionDigits: 1 })}
              </span>
            </p>
          </div>

          {per100g ? (
            /* grams-based food */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  aria-label={t("nutrition.grams")}
                  onClick={() => {
                    haptic("light");
                    const next = Math.max(1, grams - 10);
                    setGrams(next);
                    setGramsText(String(next));
                  }}
                  className="h-11 w-11 shrink-0 rounded-xl"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
                <Input
                  aria-label={`${t("nutrition.grams")} (${t("unit.gram")})`}
                  inputMode="decimal"
                  dir="ltr"
                  value={gramsText}
                  onChange={(e) => {
                    setGramsText(e.target.value);
                    const n = parseNum(e.target.value);
                    if (n !== null && n > 0) setGrams(n);
                  }}
                  className="tnum h-11 rounded-xl text-center"
                />
                <Button
                  variant="outline"
                  aria-label={t("nutrition.grams")}
                  onClick={() => {
                    haptic("light");
                    const next = Math.min(5000, grams + 10);
                    setGrams(next);
                    setGramsText(String(next));
                  }}
                  className="h-11 w-11 shrink-0 rounded-xl"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="flex gap-2">
                {[food.servingG, 50, 100, 200]
                  .filter((g): g is number => g !== null)
                  .filter((g, i, arr) => arr.indexOf(g) === i)
                  .map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        haptic("light");
                        setGrams(g);
                        setGramsText(String(g));
                      }}
                      aria-pressed={grams === g}
                      className={`tnum min-h-9 flex-1 rounded-full px-2 text-sm font-semibold transition-colors ${
                        grams === g
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/50 text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {fmt.number(g)}
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            /* piece-based food */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  aria-label={t("nutrition.quantity")}
                  onClick={() => {
                    haptic("light");
                    const next = Math.max(0.1, Math.round((count - 0.5) * 10) / 10);
                    setCount(next);
                    setCountText(String(next));
                  }}
                  className="h-11 w-11 shrink-0 rounded-xl"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
                <Input
                  aria-label={t("nutrition.quantity")}
                  inputMode="decimal"
                  dir="ltr"
                  value={countText}
                  onChange={(e) => {
                    setCountText(e.target.value);
                    const n = parseNum(e.target.value);
                    if (n !== null && n > 0) setCount(n);
                  }}
                  className="tnum h-11 rounded-xl text-center"
                />
                <Button
                  variant="outline"
                  aria-label={t("nutrition.quantity")}
                  onClick={() => {
                    haptic("light");
                    const next = Math.round((count + 0.5) * 10) / 10;
                    setCount(next);
                    setCountText(String(next));
                  }}
                  className="h-11 w-11 shrink-0 rounded-xl"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="flex gap-2">
                {[0.5, 1, 2].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setCount(q);
                      setCountText(String(q));
                    }}
                    aria-pressed={count === q}
                    className={`tnum min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors ${
                      count === q
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/50 text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    ×{fmt.number(q)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* live computed preview */}
          <div className="tnum grid grid-cols-4 gap-2 rounded-2xl bg-primary/10 p-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">{t("unit.kcal")}</p>
              <p className="text-sm font-bold text-primary">
                {fmt.number(Math.round(preview.kcal))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{t("nutrition.protein")}</p>
              <p className="text-sm font-bold">{fmt.number(preview.protein, { maximumFractionDigits: 1 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{t("nutrition.carbs")}</p>
              <p className="text-sm font-bold">{fmt.number(preview.carbs, { maximumFractionDigits: 1 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{t("nutrition.fat")}</p>
              <p className="text-sm font-bold">{fmt.number(preview.fat, { maximumFractionDigits: 1 })}</p>
            </div>
          </div>

          <MealSegmented value={meal} onChange={onMealChange} label={t("nutrition.meals")} />

          <p className="text-center text-[11px] text-muted-foreground">{t("nutrition.approx")}</p>

          <Button
            size="lg"
            disabled={saving}
            onClick={save}
            className="h-12 w-full rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {saving ? t("state.loading") : t("nutrition.savePortion")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
