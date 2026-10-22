"use client";

/**
 * Habit card: icon, name, streak, 7-day mini dots, one-tap check, swipe
 * gestures (start → complete, end → freeze) with visible backdrops, an
 * a11y menu (all swipe actions have button equivalents) and a dnd-kit
 * drag handle for reordering.
 */
import React, { useEffect, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
  type PanInfo,
} from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArchiveRestore,
  Check,
  Flame,
  GripVertical,
  MoreVertical,
  Pencil,
  Play,
  Snowflake,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HabitIcon, hexA, isLightHex, type HabitDTO } from "./shared";

const SWIPE_THRESHOLD = 64;

export interface HabitCardProps {
  habit: HabitDTO;
  isRtl: boolean;
  /** increments whenever this habit just hit a milestone (triggers the burst) */
  celebrateNonce: number;
  onToggleToday: (habit: HabitDTO) => void;
  onFreezeToday: (habit: HabitDTO) => void;
  /** gymPlan habits: start the linked workout session */
  onGymStart?: (habit: HabitDTO) => void;
  onOpenDetail: (habit: HabitDTO) => void;
  onEdit: (habit: HabitDTO) => void;
  onArchiveToggle: (habit: HabitDTO) => void;
}

/** dnd-kit sortable wrapper — the drag listeners live on the grip only. */
export function SortableHabitCard(props: HabitCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.habit.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={isDragging ? "relative z-20" : undefined}
    >
      <HabitCard
        {...props}
        grip={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as unknown as Record<string, unknown>,
        }}
      />
    </div>
  );
}

export function HabitCard({
  habit,
  isRtl,
  celebrateNonce,
  onToggleToday,
  onFreezeToday,
  onGymStart,
  onOpenDetail,
  onEdit,
  onArchiveToggle,
  grip,
}: HabitCardProps & {
  grip?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const x = useMotionValue(0);
  const [burst, setBurst] = useState(0);

  const done = habit.todayDone;
  const archived = habit.archived;
  const isGymPlan = habit.schedule.type === "gymPlan";
  const scheduledToday = isGymPlan
    ? habit.gymTurn === "due"
    : habit.last7.length > 0
      ? habit.last7[habit.last7.length - 1].scheduled
      : true;
  // Glow hint: the habit is expected today but not completed yet. For gymPlan
  // that means "its turn in the rotation" — the linked workout stays due
  // (postponed) every day until completed.
  const glow = !archived && scheduledToday && !done;

  // Reveal the swipe action layers while dragging (physical sign → logical side).
  const completeOp = useTransform(x, isRtl ? [-110, -12] : [12, 110], [0, 1]);
  const freezeOp = useTransform(x, isRtl ? [12, 110] : [-110, -12], [0, 1]);

  useEffect(() => {
    // Defer so we don't setState synchronously inside the effect.
    if (celebrateNonce > 0) queueMicrotask(() => setBurst(celebrateNonce));
  }, [celebrateNonce]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    animate(x, 0, { type: "spring", stiffness: 500, damping: 38 });
    if (archived) return;
    const offset = info.offset.x;
    if (Math.abs(offset) < SWIPE_THRESHOLD) return;
    const towardStart = isRtl ? offset < 0 : offset > 0;
    if (towardStart) {
      onToggleToday(habit);
    } else if (!isGymPlan) {
      // freezes are meaningless for gymPlan habits (postponement never breaks)
      onFreezeToday(habit);
    }
  };

  const checkColor = done ? (isLightHex(habit.color) ? "#0b1020" : "#f8fafc") : undefined;

  return (
    <div className="relative">
      {/* swipe action backdrops (freeze side hidden for gymPlan) */}
      <div aria-hidden className="absolute inset-0 flex overflow-hidden rounded-2xl">
        <motion.div
          className="flex w-1/2 items-center bg-success/15 ps-4 text-success"
          style={{ opacity: completeOp }}
        >
          <Check className="h-5 w-5" />
          <span className="ms-1.5 text-xs font-semibold">{t("habits.swipe.complete")}</span>
        </motion.div>
        {!isGymPlan && (
          <motion.div
            className="flex w-1/2 items-center justify-end bg-warning/15 pe-4 text-warning"
            style={{ opacity: freezeOp }}
          >
            <span className="me-1.5 text-xs font-semibold">{t("habits.swipe.freeze")}</span>
            <Snowflake className="h-5 w-5" />
          </motion.div>
        )}
      </div>

      <motion.div
        style={{
          x,
          ...(glow
            ? {
                borderColor: hexA(habit.color, 0.45),
                boxShadow: `0 0 26px -8px ${hexA(habit.color, 0.55)}`,
              }
            : {}),
        }}
        drag={archived ? false : "x"}
        dragConstraints={{ left: -112, right: 112 }}
        dragElastic={0.16}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className={cn(
          "card-hi relative flex items-center gap-1.5 rounded-2xl border bg-card p-3.5",
          glow ? "" : "border-border",
          archived && "opacity-70"
        )}
      >
        {/* drag handle (reordering) */}
        {!archived && grip && (
          <button
            type="button"
            aria-label={t("habits.grip.aria")}
            {...grip.attributes}
            {...grip.listeners}
            className="-ms-1 flex h-11 w-6 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" aria-hidden />
          </button>
        )}

        {/* body → detail sheet */}
        <button
          type="button"
          onClick={() => onOpenDetail(habit)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-start"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: hexA(habit.color, 0.14), color: habit.color }}
          >
            <HabitIcon icon={habit.icon} size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold leading-tight">{habit.name}</span>
              {archived && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t("habits.archived.badge")}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1 text-warning" title={isGymPlan ? t("habits.gym.completions") : t("habits.streak.aria")}>
                <Flame className="h-3.5 w-3.5" aria-hidden />
                <span className="tnum text-[13px] font-bold leading-none">
                  {fmt.number(habit.streaks.current)}
                </span>
              </span>
              {habit.schedule.type === "timesPerWeek" && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                  {t("habits.streak.weeksBadge")}
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] leading-none text-muted-foreground/80">
                <Trophy className="h-3 w-3" aria-hidden />
                <span className="tnum">{fmt.number(habit.streaks.best)}</span>
              </span>
              {/* gym-plan rotation chips */}
              {isGymPlan && !archived && (
                <>
                  {habit.gymTurn === "due" && !done && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary">
                      <Play className="h-2.5 w-2.5" aria-hidden />
                      {t("habits.gym.due")}
                    </span>
                  )}
                  {habit.gymTurn === "due" && !done && habit.gymPendingDays > 1 && (
                    <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning">
                      {t("habits.gym.postponed", { n: fmt.number(habit.gymPendingDays - 1) })}
                    </span>
                  )}
                  {habit.gymTurn === "next" && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                      {t("habits.gym.queued")}
                    </span>
                  )}
                </>
              )}
              <span className="sr-only">{t("habits.streak.aria")}</span>
            </span>
            {/* 7-day mini dots */}
            <span className="mt-2 flex items-center gap-1" aria-hidden>
              {habit.last7.map((d) => (
                <span
                  key={d.date}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !d.done && !d.scheduled && "bg-muted-foreground/15",
                    !d.done && d.scheduled && "bg-foreground/25"
                  )}
                  style={d.done ? { backgroundColor: habit.color } : undefined}
                />
              ))}
            </span>
          </span>
        </button>

        {/* a11y menu: every swipe action has a button equivalent */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("habits.menu.aria", { name: habit.name })}
              className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl">
            {!archived && (
              <>
                <DropdownMenuItem
                  onClick={() => onToggleToday(habit)}
                  className="min-h-11 gap-2"
                >
                  <Check className="h-4 w-4 text-success" aria-hidden />
                  {done ? t("habits.menu.undo") : t("habits.menu.complete")}
                </DropdownMenuItem>
                {!isGymPlan && (
                  <DropdownMenuItem
                    onClick={() => onFreezeToday(habit)}
                    className="min-h-11 gap-2"
                  >
                    <Snowflake className="h-4 w-4 text-info" aria-hidden />
                    {t("habits.menu.freeze")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onEdit(habit)} className="min-h-11 gap-2">
              <Pencil className="h-4 w-4" aria-hidden />
              {t("action.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchiveToggle(habit)} className="min-h-11 gap-2">
              {archived ? (
                <ArchiveRestore className="h-4 w-4" aria-hidden />
              ) : (
                <Archive className="h-4 w-4" aria-hidden />
              )}
              {archived ? t("action.unarchive") : t("action.archive")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* start the linked workout (gymPlan habits only) */}
        {!archived && isGymPlan && habit.gymTemplateId && onGymStart && (
          <button
            type="button"
            onClick={() => onGymStart(habit)}
            aria-label={t("habits.gym.startAria", { name: habit.name })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-90"
          >
            <Play className="h-5 w-5" aria-hidden />
          </button>
        )}

        {/* one-tap check */}
        {!archived && (
          <span className="relative ms-1 shrink-0">
            {burst > 0 && (
              <motion.span
                key={`burst-${burst}`}
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ backgroundColor: habit.color }}
                initial={{ scale: 1, opacity: 0.45 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                onAnimationComplete={() => setBurst(0)}
              />
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              transition={{ duration: 0.12 }}
              onClick={() => onToggleToday(habit)}
              aria-label={t(done ? "habits.check.undo" : "habits.check.complete", { name: habit.name })}
              className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-150"
              style={
                done
                  ? { backgroundColor: habit.color, borderColor: habit.color }
                  : { borderColor: hexA(habit.color, 0.5) }
              }
            >
              <AnimatePresence initial={false} mode="wait">
                {done ? (
                  <motion.span
                    key="done"
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  >
                    <Check className="h-6 w-6" style={{ color: checkColor }} aria-hidden />
                  </motion.span>
                ) : (
                  <motion.span
                    key="empty"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  >
                    {habit.todayFrozen ? (
                      <Snowflake className="h-5 w-5 text-info" aria-hidden />
                    ) : (
                      <span
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: hexA(habit.color, 0.4) }}
                      />
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </span>
        )}
      </motion.div>
    </div>
  );
}

/** Non-draggable card for the archived list. */
export function ArchivedHabitCard(props: Omit<HabitCardProps, "isRtl">) {
  const { onToggleToday, onFreezeToday, ...rest } = props;
  return (
    <HabitCard
      {...rest}
      isRtl={false}
      // no swipe/check on archived cards — only detail/edit/unarchive via menu
      onToggleToday={() => undefined}
      onFreezeToday={() => undefined}
    />
  );
}
