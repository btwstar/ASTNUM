"use client";

/** Meal type segmented control (breakfast/lunch/dinner/snack) . */
import React from "react";

import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { MEAL_ORDER, type MealType } from "@/components/nutrition/shared";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function MealSegmented({
  value,
  onChange,
  label,
}: {
  value: MealType;
  onChange: (meal: MealType) => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) {
          haptic("light");
          onChange(v as MealType);
        }
      }}
      aria-label={label}
      className="w-full rounded-2xl bg-muted/50 p-1"
    >
      {MEAL_ORDER.map((meal) => (
        <ToggleGroupItem
          key={meal}
          value={meal}
          aria-label={t(`nutrition.meal.${meal}`)}
          className="h-10 flex-1 rounded-xl text-xs font-medium data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
        >
          {t(`nutrition.meal.${meal}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
