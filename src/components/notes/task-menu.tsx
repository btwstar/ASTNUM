"use client";

/**
 * TaskMenu — per-task options dropdown.
 * Shared by the tasks view rows and the note-editor checklist rows.
 * This is the accessible equivalent of the swipe gestures (due / priority /
 * postpone / repeat / delete all reachable via keyboard).
 */
import React, { useState } from "react";
import { CalendarClock, CalendarX2, Check, Repeat2, Trash2, CalendarPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useDeleteTask, useUpdateTask } from "./api-hooks";
import {
  dueNextWeekISO,
  dueTodayISO,
  dueTomorrowISO,
  postponedISO,
  type TaskDTO,
} from "./types";

interface TaskMenuProps {
  task: TaskDTO;
  /** show "postpone to tomorrow" entry (tasks view rows) */
  showPostpone?: boolean;
  onDone?: (done: boolean) => void;
}

const PRIORITIES: Array<{ value: number; dot: string }> = [
  { value: 0, dot: "bg-danger" },
  { value: 1, dot: "bg-warning" },
  { value: 2, dot: "bg-muted-foreground" },
  { value: 3, dot: "bg-transparent border border-border" },
];

const REPEATS = ["none", "daily", "weekly", "weekdays"] as const;

export function TaskMenu({ task, showPostpone = true, onDone }: TaskMenuProps) {
  const { t } = useI18n();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  // v1.15 (review finding 1): deleting is now CONFIRMED before it happens —
  // it soft-deletes into السلة where the task can be restored for 30 days.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (p: Parameters<typeof updateTask.mutate>[0]["patch"], hapticStyle: "light" | "medium" = "light") => {
    haptic(hapticStyle);
    updateTask.mutate({ id: task.id, patch: p });
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("tasks.moreAria")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-lg leading-none" aria-hidden>
            ⋮
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56 rounded-2xl">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("tasks.dueLabel")}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => patch({ dueAt: dueTodayISO() })} className="min-h-10">
          <CalendarClock className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t("tasks.due.today")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => patch({ dueAt: dueTomorrowISO() })} className="min-h-10">
          <CalendarPlus className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t("tasks.due.tomorrow")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => patch({ dueAt: dueNextWeekISO() })} className="min-h-10">
          <CalendarPlus className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t("tasks.due.nextWeek")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => patch({ dueAt: null })} className="min-h-10">
          <CalendarX2 className="h-4 w-4" aria-hidden /> {t("tasks.due.clear")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("tasks.priorityLabel")}
        </DropdownMenuLabel>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem
            key={p.value}
            onClick={() => patch({ priority: p.value })}
            className="min-h-10"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} aria-hidden />
            <span className="flex-1">{t(`tasks.priority.${["high", "medium", "low", "none"][p.value]}`)}</span>
            {task.priority === p.value && <Check className="h-4 w-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("tasks.repeatLabel")}
        </DropdownMenuLabel>
        {REPEATS.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => patch({ repeatRule: { type: r } })}
            className="min-h-10"
          >
            <Repeat2 className="h-4 w-4" aria-hidden />
            <span className="flex-1">{t(`tasks.repeat.${r}`)}</span>
            {task.repeatRule.type === r && <Check className="h-4 w-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}

        {showPostpone && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => patch({ dueAt: postponedISO(task.dueAt) })} className="min-h-10">
              <CalendarClock className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t("tasks.postpone")}
            </DropdownMenuItem>
          </>
        )}

        {onDone && (
          <DropdownMenuItem onClick={() => onDone(!task.doneToday)} className="min-h-10">
            <Check className="h-4 w-4" aria-hidden />
            {task.doneToday ? t("tasks.uncomplete") : t("tasks.complete")}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            haptic("light");
            setConfirmDelete(true);
          }}
          className="min-h-10 text-danger focus:text-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> {t("tasks.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {" "}
    {/* delete confirm — the destructive action is never one accidental tap */}
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent className="max-w-sm rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tasks.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks.deleteConfirmBody", { title: task.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2">
          <AlertDialogCancel className="mt-0 flex-1 rounded-2xl">
            {t("action.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // keep the dialog open until the mutation settles
              haptic("medium");
              deleteTask.mutate(task.id, {
                onSuccess: () => {
                  toast.success(t("tasks.trashedToast"));
                  setConfirmDelete(false);
                },
              });
            }}
            disabled={deleteTask.isPending}
            className="flex-1 rounded-2xl bg-danger text-white hover:bg-danger/90"
          >
            {t("tasks.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
