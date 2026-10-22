"use client";

/**
 * QuickCapture — one-tap capture sheet opened by the contextual FAB
 * (window event "astnum:fab", detail.tab === "notes").
 * Opens in <300ms (fast sheet duration + tiny mount). Type toggle
 * ملاحظة / مهمة → POST /api/notes or POST /api/tasks.
 */
import React, { useEffect, useRef, useState } from "react";
import { SquareCheckBig, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useCreateNote, useCreateTask } from "./api-hooks";

export type QuickType = "note" | "task";

export function QuickCapture({
  open,
  type,
  onTypeChange,
  onClose,
}: {
  open: boolean;
  type: QuickType;
  onTypeChange: (t: QuickType) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const createNote = useCreateNote();
  const createTask = useCreateTask();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      // focus after the (fast) sheet enters — keeps the "instant" feel
      const id = window.setTimeout(() => textareaRef.current?.focus(), 220);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const save = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    const [firstLine, ...rest] = value.split("\n");
    try {
      if (type === "note") {
        await createNote.mutateAsync({
          title: firstLine.trim().slice(0, 500),
          body: rest.length > 0 ? rest.join("\n") : "",
        });
        toast.success(t("notes.quick.savedNote"));
      } else {
        await createTask.mutateAsync({ title: firstLine.trim().slice(0, 500) });
        toast.success(t("notes.quick.savedTask"));
      }
      haptic("success");
      onClose();
    } catch {
      toast.error(t("state.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-3xl border-t p-0 data-[state=open]:duration-200 data-[state=closed]:duration-200"
      >
        <SheetHeader className="border-b border-border/40 pb-3">
          <SheetTitle className="text-base">{t("notes.quick.title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4 pb-safe">
          {/* type toggle */}
          <div
            role="radiogroup"
            aria-label={t("notes.quick.typeAria")}
            className="flex rounded-full bg-muted p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={type === "note"}
              onClick={() => {
                haptic("light");
                onTypeChange("note");
              }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors ${
                type === "note" ? "bg-gradient-accent text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <StickyNote className="h-4 w-4" aria-hidden />
              {t("notes.quick.type.note")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === "task"}
              onClick={() => {
                haptic("light");
                onTypeChange("task");
              }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors ${
                type === "task" ? "bg-gradient-accent text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <SquareCheckBig className="h-4 w-4" aria-hidden />
              {t("notes.quick.type.task")}
            </button>
          </div>

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={t("notes.quick.placeholder")}
            aria-label={t("notes.quick.title")}
            className="min-h-24 resize-none rounded-2xl border-border/60 bg-card text-base leading-relaxed placeholder:text-muted-foreground/60"
          />

          <Button
            onClick={() => void save()}
            disabled={!text.trim() || busy}
            className="h-12 w-full rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            {t("action.save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
