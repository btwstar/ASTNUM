"use client";

/**
 * Notes tab screen — default export consumed by the app shell.
 *
 * Segments: الملاحظات | مهامي | الأرشيف | السلة
 * Sticky sub-header: instant search (250ms debounce) + tag filter chips.
 * FAB contract: listens for window event "astnum:fab" (detail.tab === "notes")
 * → opens the quick-capture sheet in <300ms ("one-tap capture from anywhere").
 * Full editor + trash management live in sibling components.
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useAppStore } from "@/lib/store/app-store";
import { useTagsQuery } from "./api-hooks";
import { NotesList } from "./notes-list";
import { TasksView } from "./tasks-view";
import { TrashView } from "./trash-view";
import { NoteEditor } from "./note-editor";
import { QuickCapture, type QuickType } from "./quick-capture";

type Segment = "notes" | "tasks" | "archived" | "trash";

const SEGMENTS: Array<{ id: Segment; labelKey: string }> = [
  { id: "notes", labelKey: "notes.segment.notes" },
  { id: "tasks", labelKey: "notes.segment.tasks" },
  { id: "archived", labelKey: "notes.segment.archived" },
  { id: "trash", labelKey: "notes.segment.trash" },
];

export default function NotesScreen() {
  const { t } = useI18n();
  // consumed-once intent ("كل المهام" from Today must land on مهامي, not الملاحظات).
  // v1.15 HARDENING (found by fresh-session browser test): the old pattern
  // consumed the intent DURING RENDER (getState + setState in the body).
  // On a COLD dynamic chunk React suspends the first render attempt and
  // DISCARDS it — the discarded attempt had already cleared the store, so
  // the committed render fell back to "notes" (reproduced 2× on fresh
  // sessions). Render-safe fix: the useState initializer only READS the
  // intent; a mount effect clears it AFTER commit, so no suspended/discarded
  // render can swallow it. (StrictMode is off — a remount-safe guard is not
  // needed and would add a flash.)
  const [segment, setSegment] = useState<Segment>(
    () => (useAppStore.getState().notesSegmentIntent ?? "notes")
  );
  useEffect(() => {
    useAppStore.setState({ notesSegmentIntent: null });
  }, []);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // editor: open with existing note id, or null → compose new note
  const [editor, setEditor] = useState<{ open: boolean; noteId: string | null }>({
    open: false,
    noteId: null,
  });
  // quick capture (FAB)
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<QuickType>("note");

  const tagsQuery = useTagsQuery();

  // FAB → quick capture (contract: detail.tab === "notes")
  useEffect(() => {
    const onFab = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab !== "notes") return;
      setQuickType(segment === "tasks" ? "task" : "note");
      setQuickOpen(true);
      haptic("light");
    };
    window.addEventListener("astnum:fab", onFab);
    return () => window.removeEventListener("astnum:fab", onFab);
  }, [segment]);

  // «إضافة سريعة» + «عنصر مثبّت» deep links: bridge the EXTERNAL store
  // (zustand) into this screen's local sheet state. Subscription covers
  // warm taps (screen already mounted); the mount-time microtask covers
  // cold taps (the intent fired before this screen's first render). The
  // editor fetches the note by id itself — no list wait needed.
  useEffect(() => {
    const consumeIntents = () => {
      const s = useAppStore.getState();
      if (s.notesComposeIntent) {
        const type = s.notesComposeIntent === "task" ? "task" : "note";
        useAppStore.setState({ notesComposeIntent: null });
        setQuickType(type);
        setQuickOpen(true);
        haptic("light");
      }
      const noteId = s.noteEditorIntent;
      if (noteId) {
        useAppStore.setState({ noteEditorIntent: null });
        haptic("light");
        setEditor({ open: true, noteId });
      }
    };
    const unsub = useAppStore.subscribe(consumeIntents);
    const t = window.setTimeout(consumeIntents, 0);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  // search debounce 250ms
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const openEditor = (noteId: string | null) => {
    haptic("light");
    setEditor({ open: true, noteId });
  };

  const showSearch = segment !== "tasks";
  const showTags = segment === "notes";
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {/* screen heading */}
      <div className="px-1 pt-3">
        <h1 className="text-xl font-bold leading-snug">{t("notes.title")}</h1>
      </div>

      {/* sticky sub-header: segment control + search + tag chips */}
      <div className="sticky top-14 z-20 -mx-4 flex flex-col gap-2.5 border-b border-border/40 bg-background/85 px-4 py-2.5 backdrop-blur-xl">
        <div
          role="tablist"
          aria-label={t("notes.title")}
          className="flex gap-1 rounded-full bg-muted p-1"
        >
          {SEGMENTS.map((s) => {
            const active = segment === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  haptic("light");
                  setSegment(s.id);
                }}
                className="relative min-h-11 flex-1 rounded-full text-xs font-semibold sm:text-sm"
              >
                {active && (
                  <motion.span
                    layoutId="notes-segment"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-gradient-accent shadow-md shadow-primary/20"
                  />
                )}
                <span
                  className={`relative z-10 flex h-full items-center justify-center px-1 transition-colors ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t(s.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        {showSearch && (
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("notes.searchPlaceholder")}
              aria-label={t("action.search")}
              maxLength={200}
              className="h-11 w-full rounded-full border border-border/70 bg-card ps-10 pe-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  setSearch("");
                }}
                aria-label={t("action.close")}
                className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}

        {showTags && tags.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar" role="group">
            <TagChip active={activeTag === null} onClick={() => setActiveTag(null)}>
              {t("notes.allTags")}
            </TagChip>
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                active={activeTag === tag.name}
                onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
              >
                #{tag.name}
              </TagChip>
            ))}
          </div>
        )}
      </div>

      {/* active view — v1.12 instant atomic swap (the old wait-mode crossfade
          left an empty frame between views = the "black screen" flash;
          see app-shell.tsx for the full rationale) */}
      <div className="pt-1">
        {segment === "notes" && (
          <NotesList
            mode="active"
            q={debouncedQ}
            tag={activeTag}
            onOpenNote={(id) => openEditor(id)}
            onNewNote={() => openEditor(null)}
          />
        )}
        {segment === "tasks" && <TasksView />}
        {segment === "archived" && (
          <NotesList
            mode="archived"
            q={debouncedQ}
            tag={activeTag}
            onOpenNote={(id) => openEditor(id)}
          />
        )}
        {segment === "trash" && <TrashView q={debouncedQ} />}
      </div>

      <NoteEditor
        open={editor.open}
        noteId={editor.noteId}
        onClose={() => setEditor((s) => ({ ...s, open: false }))}
      />

      <QuickCapture
        open={quickOpen}
        type={quickType}
        onTypeChange={setQuickType}
        onClose={() => setQuickOpen(false)}
      />
    </div>
  );
}

function TagChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        haptic("light");
        onClick();
      }}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary/15 text-primary ring-1 ring-primary/50"
          : "bg-secondary/70 text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
