"use client";

/**
 * Food database sheet — searchable list of the local food DB with per-food
 * photo tiles, favorites ("وجبات محفوظة") filter, and full library
 * management (v1.13): create + edit + delete foods, each with an optional
 * photo (canvas-compressed pair — lists carry only the small thumbnail,
 * exactly like the notes list contract).
 *
 * Views swap ATOMICALLY (search | create | edit) — no wait-mode transitions,
 * per the v1.12 open-flicker standard.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import { useI18n, useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { compressFoodImagePair } from "@/lib/image-compress";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { FoodRow } from "@/components/nutrition/shared";

function parseNum(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Which sub-view the sheet body shows (swapped atomically, never animated-out). */
type View = "search" | "create" | "edit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFood: (food: FoodRow) => void;
}

export function FoodSearchSheet(props: Props) {
  const { t } = useI18n();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const { open, onOpenChange, onPickFood } = props;

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<View>("search");
  const [editingFood, setEditingFood] = useState<FoodRow | null>(null);

  // debounce 250ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (open) {
      // Deferred so we don't setState synchronously inside the effect.
      queueMicrotask(() => {
        setQ("");
        setDebouncedQ("");
        setFavoritesOnly(false);
        setView("search");
        setEditingFood(null);
      });
    }
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ["nutrition-foods", debouncedQ, favoritesOnly],
    queryFn: () =>
      apiGet<{ foods: FoodRow[] }>(
        `/api/nutrition/foods?q=${encodeURIComponent(debouncedQ)}&favorite=${favoritesOnly ? "1" : "0"}`
      ),
    enabled: open && view === "search",
  });

  const foods = useMemo(() => data?.foods ?? [], [data]);

  const toggleFavorite = async (food: FoodRow) => {
    haptic("light");
    // optimistic
    queryClient.setQueriesData<{ foods: FoodRow[] }>(
      { queryKey: ["nutrition-foods"] },
      (previous) =>
        previous
          ? {
              foods: previous.foods.map((f) => (f.id === food.id ? { ...f, favorite: !food.favorite } : f)),
            }
          : previous
    );
    try {
      await apiPatch("/api/nutrition/foods", { id: food.id, favorite: !food.favorite });
    } catch (err) {
      // revert
      await queryClient.invalidateQueries({ queryKey: ["nutrition-foods"] });
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    }
  };

  const backToSearch = () => {
    setView("search");
    setEditingFood(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="slim-scroll max-h-[92vh] overflow-y-auto rounded-t-3xl px-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5 pb-1">
          <SheetTitle className="text-start">{t("nutrition.foodSearch")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-5 pb-6">
          {view === "search" ? (
            <>
              {/* search */}
              <div className="relative">
                <Search
                  className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3"
                  aria-hidden
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("nutrition.searchPlaceholder")}
                  aria-label={t("action.search")}
                  className="h-12 rounded-2xl ps-10"
                  autoFocus
                />
              </div>

              {/* filter chips */}
              <div className="flex gap-2" role="tablist" aria-label={t("nutrition.foodSearch")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!favoritesOnly}
                  onClick={() => {
                    haptic("light");
                    setFavoritesOnly(false);
                  }}
                  className={`min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors ${
                    !favoritesOnly ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {t("nutrition.all")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={favoritesOnly}
                  onClick={() => {
                    haptic("light");
                    setFavoritesOnly(true);
                  }}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${
                    favoritesOnly ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden />
                  {t("nutrition.favorites")}
                </button>
              </div>

              {/* results */}
              {isLoading ? (
                <div className="space-y-2 pt-1" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-2xl" />
                  ))}
                </div>
              ) : foods.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {debouncedQ || favoritesOnly ? t("nutrition.searchEmpty") : t("nutrition.dbEmpty")}
                </p>
              ) : (
                <ul className="slim-scroll max-h-96 divide-y divide-border/50 overflow-y-auto" role="list">
                  {foods.map((food) => (
                    <li key={food.id} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          haptic("light");
                          onPickFood(food);
                        }}
                        aria-label={food.nameAr}
                        className="flex min-h-14 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-accent focus-visible:bg-accent"
                      >
                        {/* photo tile (or subtle placeholder) */}
                        {food.imageThumb ? (
                          <img
                            src={food.imageThumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-10 w-10 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground/60"
                          >
                            <Utensils className="h-4 w-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{food.nameAr}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {food.nameEn !== food.nameAr ? food.nameEn : ""}
                            {food.brand ? ` · ${food.brand}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge
                            variant="outline"
                            className="rounded-full text-[9px] font-normal text-muted-foreground"
                          >
                            {food.servingG != null ? t("nutrition.per100g") : t("nutrition.perPiece")}
                          </Badge>
                          <span className="tnum text-xs text-muted-foreground">
                            {fmt.number(food.kcal, { maximumFractionDigits: 0 })} {t("unit.kcal")}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          haptic("light");
                          setEditingFood(food);
                          setView("edit");
                        }}
                        aria-label={t("nutrition.editFood")}
                        className="flex w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(food)}
                        aria-label={t("nutrition.favorites")}
                        aria-pressed={food.favorite}
                        className="flex w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                      >
                        <Star
                          className={`h-5 w-5 transition-colors ${
                            food.favorite ? "fill-warning text-warning" : "text-muted-foreground"
                          }`}
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* custom food */}
              <Button
                variant="outline"
                onClick={() => {
                  haptic("light");
                  setView("create");
                }}
                className="h-11 w-full rounded-2xl"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t("nutrition.addCustomFood")}
              </Button>
            </>
          ) : (
            <FoodForm
              mode={view}
              food={view === "edit" ? editingFood : null}
              onDone={backToSearch}
              onCreated={(food) => {
                toast.success(t("nutrition.savedFood"));
                void queryClient.invalidateQueries({ queryKey: ["nutrition-foods"] });
                onPickFood(food);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── shared create/edit form ─────────────────────────────────────── */

interface FoodFormProps {
  mode: "create" | "edit";
  /** required in edit mode; the list row carries imageThumb (image is stripped) */
  food: FoodRow | null;
  /** back to the search view (cancel / after save / after delete) */
  onDone: () => void;
  /** create mode only: the fresh food is passed up (pick → portion sheet) */
  onCreated: (food: FoodRow) => void;
}

/**
 * One form, two modes:
 *  - create: POST { nameAr, brand, kcal, macros, servingG, photo pair? } → pick food
 *  - edit:   PATCH { id, touched fields } → refresh list; optional soft DELETE
 * The photo pair is only sent when the user actually changed it (picked a
 * new photo / removed it) — an untouched photo is left as-is server-side.
 */
function FoodForm({ mode, food, onDone, onCreated }: FoodFormProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(food?.nameAr ?? "");
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [kcal, setKcal] = useState(food != null ? String(food.kcal) : "");
  const [protein, setProtein] = useState(food != null ? String(food.protein) : "");
  const [carbs, setCarbs] = useState(food != null ? String(food.carbs) : "");
  const [fat, setFat] = useState(food != null ? String(food.fat) : "");
  const [servingG, setServingG] = useState(
    food?.servingG != null ? String(food.servingG) : ""
  );

  // photo state — preview (thumb) + the freshly compressed pair + dirty flags
  const [photo, setPhoto] = useState<string | null>(food?.imageThumb ?? null);
  const [photoPair, setPhotoPair] = useState<{ image: string; imageThumb: string } | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [compressing, setCompressing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      haptic("heavy");
      toast.error(t("nutrition.imageBadType"));
      return;
    }
    setCompressing(true);
    try {
      const pair = await compressFoodImagePair(file);
      setPhotoPair(pair);
      setPhoto(pair.imageThumb);
      setPhotoChanged(true);
      haptic("light");
    } catch (err) {
      haptic("heavy");
      toast.error(
        err instanceof Error && err.message === "too-large"
          ? t("nutrition.imageTooLarge")
          : t("nutrition.imageBadType")
      );
    } finally {
      setCompressing(false);
    }
  };

  const removePhoto = () => {
    haptic("light");
    setPhoto(null);
    setPhotoPair(null);
    setPhotoChanged(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setError(t("nutrition.validation.foodName"));
      haptic("heavy");
      return;
    }
    const k = parseNum(kcal);
    if (k === null || k < 0 || k > 2000) {
      setError(t("nutrition.validation.foodKcal"));
      haptic("heavy");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const result = await apiPost<{ food: FoodRow }>("/api/nutrition/foods", {
          nameAr: name.trim(),
          brand: brand.trim() || null,
          kcal: k,
          protein: parseNum(protein) ?? 0,
          carbs: parseNum(carbs) ?? 0,
          fat: parseNum(fat) ?? 0,
          servingG: parseNum(servingG),
          ...(photoPair ? { image: photoPair.image, imageThumb: photoPair.imageThumb } : {}),
        });
        onCreated(result.food);
      } else if (food) {
        const patch: Record<string, unknown> = {
          id: food.id,
          nameAr: name.trim(),
          brand: brand.trim() || null,
          kcal: k,
          protein: parseNum(protein) ?? 0,
          carbs: parseNum(carbs) ?? 0,
          fat: parseNum(fat) ?? 0,
          servingG: parseNum(servingG),
        };
        // only touch the photo pair when the user actually changed it
        if (photoChanged) {
          if (photoPair) {
            patch.image = photoPair.image;
            patch.imageThumb = photoPair.imageThumb;
          } else {
            patch.image = null;
            patch.imageThumb = null;
          }
        }
        await apiPatch("/api/nutrition/foods", patch);
        toast.success(t("nutrition.foodUpdated"));
        void queryClient.invalidateQueries({ queryKey: ["nutrition-foods"] });
        onDone();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async () => {
    if (!food) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/nutrition/foods/${food.id}`);
      haptic("success");
      toast.success(t("nutrition.foodDeleted"));
      void queryClient.invalidateQueries({ queryKey: ["nutrition-foods"] });
      setConfirmDelete(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("state.errorGeneric"));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
      <div>
        <p className="text-sm font-semibold">
          {mode === "create" ? t("nutrition.customFood") : t("nutrition.editFood")}
        </p>
        {mode === "create" && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("nutrition.customFoodHint")}</p>
        )}
      </div>

      {/* photo picker */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            fileRef.current?.click();
          }}
          disabled={compressing}
          aria-label={photo ? t("nutrition.changePhoto") : t("nutrition.addPhoto")}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/60 transition-colors hover:border-primary/50 disabled:opacity-60"
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/70 transition-colors group-hover:text-primary">
              {compressing ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-5 w-5" aria-hidden />
              )}
              <span className="px-1 text-center text-[9px] font-medium leading-tight">
                {t("nutrition.addPhoto")}
              </span>
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{t("nutrition.foodPhoto")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {t("nutrition.photoHint")}
          </p>
          {photo && (
            <button
              type="button"
              onClick={removePhoto}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-danger transition-opacity hover:opacity-75"
            >
              <X className="h-3 w-3" aria-hidden />
              {t("nutrition.removePhoto")}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            void pickPhoto(file);
          }}
        />
      </div>

      {/* fields */}
      <div className="space-y-1.5">
        <Label htmlFor="cf-name" className="text-xs font-medium text-muted-foreground">
          {t("misc.name")} *
        </Label>
        <Input
          id="cf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-xl"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cf-brand" className="text-xs font-medium text-muted-foreground">
          {t("nutrition.brand")} — {t("misc.optional")}
        </Label>
        <Input
          id="cf-brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="h-12 rounded-xl"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["cf-kcal", t("nutrition.kcal"), kcal, setKcal],
            ["cf-protein", t("nutrition.protein"), protein, setProtein],
            ["cf-carbs", t("nutrition.carbs"), carbs, setCarbs],
            ["cf-fat", t("nutrition.fat"), fat, setFat],
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
              placeholder="0"
              className="h-12 rounded-xl tabular-nums"
            />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="cf-serving" className="text-xs font-medium text-muted-foreground">
            {t("nutrition.servingG")} — {t("misc.optional")}
          </Label>
          <Input
            id="cf-serving"
            inputMode="decimal"
            dir="ltr"
            value={servingG}
            onChange={(e) => setServingG(e.target.value)}
            placeholder="100"
            className="h-12 rounded-xl tabular-nums"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {servingG.trim() ? t("nutrition.per100g") : t("nutrition.perPiece")}
      </p>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={onDone}
          className="h-11 flex-1 rounded-2xl text-muted-foreground"
        >
          {t("action.cancel")}
        </Button>
        <Button
          onClick={save}
          disabled={saving}
          className="h-11 flex-1 rounded-2xl bg-gradient-accent font-semibold text-primary-foreground"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("action.save")}
        </Button>
      </div>

      {mode === "edit" && food && (
        <Button
          variant="outline"
          onClick={() => {
            haptic("heavy");
            setConfirmDelete(true);
          }}
          className="h-11 w-full rounded-2xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t("nutrition.deleteFood")}
        </Button>
      )}

      {mode === "edit" && food && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent className="max-w-sm rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("nutrition.deleteFoodConfirm.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("nutrition.deleteFoodConfirm.desc", { name: food.nameAr })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11 rounded-xl">
                {t("action.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault(); // we close manually after the request settles
                  void runDelete();
                }}
                disabled={deleting}
                className="min-h-11 rounded-xl bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  t("nutrition.deleteFood")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
