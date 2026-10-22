"use client";

/**
 * Exercise picker bottom sheet — instant client-side filtering
 * over the cached full library, muscle chips (gym.muscle.<id> keys), recent 6
 * (from stats personalRecords, passed by the parent), used by the session tab
 * ("add exercise") and the template editor.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiGet } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  CANONICAL_MUSCLES,
  exerciseName,
  type GymExercise,
} from "./shared";

export interface PickerExercise {
  id: string;
  nameAr: string;
  nameEn: string;
}

export interface ExercisePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: GymExercise) => void;
  recent?: PickerExercise[];
  showRecent?: boolean;
}

export function ExercisePickerSheet({
  open,
  onOpenChange,
  onPick,
  recent = [],
  showRecent = true,
}: ExercisePickerSheetProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string>("");

  const libQuery = useQuery({
    queryKey: ["gym", "exercises"],
    queryFn: () => apiGet<{ exercises: GymExercise[] }>("/api/gym/exercises"),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const exercises = libQuery.data?.exercises ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (muscle && !ex.muscles.some((m) => m.muscleId === muscle)) return false;
      if (!q) return true;
      return ex.nameAr.toLowerCase().includes(q) || ex.nameEn.toLowerCase().includes(q);
    });
  }, [exercises, query, muscle]);

  const recentExercises = useMemo(() => {
    if (!showRecent || query.trim() || muscle) return [];
    return recent
      .slice(0, 6)
      .map((r) => exercises.find((ex) => ex.id === r.id))
      .filter((ex): ex is GymExercise => Boolean(ex));
  }, [showRecent, query, muscle, recent, exercises]);

  const pick = (ex: GymExercise) => {
    haptic("medium");
    onPick(ex);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border-0 pb-safe"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-start">{t("gym.picker.title")}</SheetTitle>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("gym.picker.search")}
              className="min-h-11 rounded-2xl bg-muted/50 ps-9"
              aria-label={t("gym.picker.search")}
              autoComplete="off"
            />
          </div>
          {/* muscle chips */}
          <div className="slim-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label={t("gym.library.muscle")}>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setMuscle("");
              }}
              aria-pressed={muscle === ""}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                muscle === ""
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              {t("gym.picker.all")}
            </button>
            {CANONICAL_MUSCLES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  haptic("light");
                  setMuscle(muscle === m ? "" : m);
                }}
                aria-pressed={muscle === m}
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                  muscle === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {t(`gym.muscle.${m}`)}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="slim-scroll flex-1 overflow-y-auto px-4 pb-6">
          {libQuery.isLoading ? (
            <div className="space-y-2 pt-2" aria-busy="true" aria-label={t("gym.loading.aria")}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              {recentExercises.length > 0 && (
                <section className="pt-2">
                  <h3 className="pb-2 text-xs font-semibold text-muted-foreground">
                    {t("gym.picker.recent")}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {recentExercises.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => pick(ex)}
                        className="min-h-11 rounded-full border border-border bg-muted/50 px-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
                      >
                        {exerciseName(ex, lang)}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center" role="status">
                  <Dumbbell className="h-10 w-10 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm text-muted-foreground">{t("gym.picker.empty")}</p>
                </div>
              ) : (
                <ul className="space-y-1.5 pt-2" role="listbox" aria-label={t("gym.picker.title")}>
                  {filtered.map((ex) => (
                    <li key={ex.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => pick(ex)}
                        className="flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">
                            {exerciseName(ex, lang)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t(`gym.equipment.${ex.equipment}`)}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-border bg-muted/50 text-[10px] text-muted-foreground"
                        >
                          {exerciseName(
                            { nameAr: ex.nameAr, nameEn: ex.nameEn },
                            lang === "ar" ? "en" : "ar"
                          )}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
