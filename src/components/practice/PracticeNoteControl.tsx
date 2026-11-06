import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, StickyNote, Trash2 } from "lucide-react";
import { usePracticeStore } from "../../stores/practiceStore";

interface PracticeNoteControlProps {
  noteKey: string;
  label: string;
  compact?: boolean;
}

/** Per-question, per-option and per-passage study notes stored with the paper. */
export function PracticeNoteControl({
  noteKey,
  label,
  compact = false,
}: PracticeNoteControlProps) {
  const { t } = useTranslation();
  const notes = usePracticeStore((state) => state.notes);
  const setNote = usePracticeStore((state) => state.setNote);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const note = notes[noteKey] ?? "";

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <span
      ref={ref}
      className="no-print relative inline-flex align-middle"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={t("practice.noteFor", { label })}
        title={note || t("practice.addNote")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex shrink-0 items-center justify-center rounded border transition-colors ${
          compact ? "h-6 w-6" : "h-7 w-7"
        } ${
          note
            ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <StickyNote className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={t("practice.noteDialog", { label })}
          className="absolute right-0 top-8 z-40 block w-60 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl"
        >
          <textarea
            autoFocus
            rows={3}
            value={note}
            aria-label={t("practice.noteText", { label })}
            placeholder={t("practice.notePlaceholder")}
            onChange={(event) =>
              setNote(noteKey, event.currentTarget.value)
            }
            className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="mt-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!note}
              onClick={() => setNote(noteKey, "")}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("practice.clearNote")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
            >
              <Check className="h-3.5 w-3.5" />
              {t("practice.doneNote")}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
