import { create } from "zustand";
import type { HighlightColorPreset } from "../lib/exam/markdownStyle";
import * as storage from "../lib/storage/tauri";

const STORAGE_KEY = "cet6-practice-sessions-v1";
let practiceDataDir = "";

export function configurePracticePersistence(dataDir: string | null): void {
  practiceDataDir = dataDir ?? "";
}

export type PracticeInteractionMode = "answer" | "highlight" | "eraser";
export type PracticeHighlightSource =
  | "content"
  | "passage"
  | "option"
  | "word-bank";

export interface PracticeHighlight {
  id: string;
  questionId: string;
  source: PracticeHighlightSource;
  sourceIndex?: number;
  sourceKey: string;
  sourceHash: string;
  start: number;
  end: number;
  color: HighlightColorPreset;
}

interface StoredPracticeSession {
  answers: Record<string, string>;
  writingAnswer: string;
  translationAnswer: string;
  notes?: Record<string, string>;
  highlights?: PracticeHighlight[];
  submitted: boolean;
  updatedAt: string;
}

interface PracticeState {
  paperId: string | null;
  practiceMode: boolean;
  answers: Record<string, string>;
  writingAnswer: string;
  translationAnswer: string;
  notes: Record<string, string>;
  highlights: PracticeHighlight[];
  interactionMode: PracticeInteractionMode;
  highlightColor: HighlightColorPreset;
  submitted: boolean;
  load: (paperId: string | null) => void;
  hydrate: (paperId: string | null) => Promise<void>;
  setPracticeMode: (active: boolean) => void;
  setInteractionMode: (mode: PracticeInteractionMode) => void;
  setHighlightColor: (color: HighlightColorPreset) => void;
  setAnswer: (questionId: string, answer: string) => void;
  setWritingAnswer: (answer: string) => void;
  setTranslationAnswer: (answer: string) => void;
  setNote: (noteKey: string, note: string) => void;
  addHighlight: (highlight: PracticeHighlight) => void;
  removeHighlightsInRange: (
    sourceKey: string,
    start: number,
    end: number,
  ) => void;
  submit: () => void;
  clearAnswers: () => void;
}

export function hashPracticeSource(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readSessions(): Record<string, StoredPracticeSession> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([paperId, value]) => [paperId, normalizeSession(value)])
        .filter(
          (entry): entry is [string, StoredPracticeSession] => entry[1] != null,
        ),
    );
  } catch {
    return {};
  }
}

function normalizeSession(value: unknown): StoredPracticeSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredPracticeSession>;
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.filter(
        (highlight): highlight is PracticeHighlight =>
          Boolean(
            highlight &&
              typeof highlight.id === "string" &&
              typeof highlight.questionId === "string" &&
              typeof highlight.sourceKey === "string" &&
              typeof highlight.sourceHash === "string" &&
              Number.isInteger(highlight.start) &&
              Number.isInteger(highlight.end) &&
              highlight.end > highlight.start,
          ),
      )
    : [];
  return {
    answers:
      candidate.answers && typeof candidate.answers === "object"
        ? candidate.answers
        : {},
    writingAnswer:
      typeof candidate.writingAnswer === "string"
        ? candidate.writingAnswer
        : "",
    translationAnswer:
      typeof candidate.translationAnswer === "string"
        ? candidate.translationAnswer
        : "",
    notes:
      candidate.notes && typeof candidate.notes === "object"
        ? candidate.notes
        : {},
    highlights,
    submitted: Boolean(candidate.submitted),
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date(0).toISOString(),
  };
}

function applySession(
  paperId: string,
  session: StoredPracticeSession | undefined,
  practiceMode = false,
): void {
  usePracticeStore.setState({
    paperId,
    practiceMode,
    answers: session?.answers ?? {},
    writingAnswer: session?.writingAnswer ?? "",
    translationAnswer: session?.translationAnswer ?? "",
    notes: session?.notes ?? {},
    highlights: session?.highlights ?? [],
    interactionMode: "answer",
    submitted: session?.submitted ?? false,
  });
}

function writeSession(
  paperId: string,
  session: Omit<StoredPracticeSession, "updatedAt">,
): void {
  if (typeof window === "undefined") return;
  const stored = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  const sessions = readSessions();
  sessions[paperId] = stored;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  const dataDir = practiceDataDir;
  if (dataDir) {
    void storage
      .savePracticeSession(dataDir, paperId, stored)
      .catch(() => undefined);
  }
}

export const usePracticeStore = create<PracticeState>((set, get) => {
  function persist(
    next: Pick<
      PracticeState,
      | "answers"
      | "writingAnswer"
      | "translationAnswer"
      | "notes"
      | "highlights"
      | "submitted"
    >,
  ) {
    const paperId = get().paperId;
    if (!paperId) return;
    writeSession(paperId, next);
  }

  return {
    paperId: null,
    practiceMode: false,
    answers: {},
    writingAnswer: "",
    translationAnswer: "",
    notes: {},
    highlights: [],
    interactionMode: "answer",
    highlightColor: "yellow",
    submitted: false,

    load: (paperId) => {
      if (!paperId) {
        set({
          paperId: null,
          practiceMode: false,
          answers: {},
          writingAnswer: "",
          translationAnswer: "",
          notes: {},
          highlights: [],
          interactionMode: "answer",
          submitted: false,
        });
        return;
      }
      const session = readSessions()[paperId];
      applySession(paperId, session);
    },

    hydrate: async (paperId) => {
      if (!paperId) return;
      const dataDir = practiceDataDir;
      if (!dataDir) return;
      const cached = readSessions()[paperId];
      try {
        const raw = await storage.loadPracticeSession(dataDir, paperId);
        const disk = normalizeSession(raw);
        if (!disk) {
          if (cached) {
            await storage.savePracticeSession(dataDir, paperId, cached);
          }
          return;
        }
        if (
          !cached ||
          Date.parse(disk.updatedAt) >= Date.parse(cached.updatedAt)
        ) {
          const sessions = readSessions();
          sessions[paperId] = disk;
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
          applySession(paperId, disk, get().practiceMode);
        } else {
          await storage.savePracticeSession(dataDir, paperId, cached);
        }
      } catch {
        // The in-memory and localStorage copy remains usable if the file is corrupt.
      }
    },

    setPracticeMode: (practiceMode) =>
      set({
        practiceMode,
        ...(practiceMode ? {} : { interactionMode: "answer" }),
      }),

    setInteractionMode: (interactionMode) => set({ interactionMode }),

    setHighlightColor: (highlightColor) => set({ highlightColor }),

    setAnswer: (questionId, answer) => {
      const answers = { ...get().answers, [questionId]: answer };
      set({ answers });
      persist({
        answers,
        writingAnswer: get().writingAnswer,
        translationAnswer: get().translationAnswer,
        notes: get().notes,
        highlights: get().highlights,
        submitted: get().submitted,
      });
    },

    setWritingAnswer: (writingAnswer) => {
      set({ writingAnswer });
      persist({
        answers: get().answers,
        writingAnswer,
        translationAnswer: get().translationAnswer,
        notes: get().notes,
        highlights: get().highlights,
        submitted: get().submitted,
      });
    },

    setTranslationAnswer: (translationAnswer) => {
      set({ translationAnswer });
      persist({
        answers: get().answers,
        writingAnswer: get().writingAnswer,
        translationAnswer,
        notes: get().notes,
        highlights: get().highlights,
        submitted: get().submitted,
      });
    },

    setNote: (noteKey, note) => {
      const notes = { ...get().notes };
      if (note.trim()) notes[noteKey] = note;
      else delete notes[noteKey];
      set({ notes });
      persist({
        answers: get().answers,
        writingAnswer: get().writingAnswer,
        translationAnswer: get().translationAnswer,
        notes,
        highlights: get().highlights,
        submitted: get().submitted,
      });
    },

    addHighlight: (highlight) => {
      const highlights = [
        ...get().highlights.filter(
          (current) =>
            current.sourceKey !== highlight.sourceKey ||
            current.end <= highlight.start ||
            current.start >= highlight.end,
        ),
        highlight,
      ];
      set({ highlights });
      persist({
        answers: get().answers,
        writingAnswer: get().writingAnswer,
        translationAnswer: get().translationAnswer,
        notes: get().notes,
        highlights,
        submitted: get().submitted,
      });
    },

    removeHighlightsInRange: (sourceKey, start, end) => {
      const highlights = get().highlights.filter(
        (highlight) =>
          highlight.sourceKey !== sourceKey ||
          highlight.end <= start ||
          highlight.start >= end,
      );
      set({ highlights });
      persist({
        answers: get().answers,
        writingAnswer: get().writingAnswer,
        translationAnswer: get().translationAnswer,
        notes: get().notes,
        highlights,
        submitted: get().submitted,
      });
    },

    submit: () => {
      set({ submitted: true });
      persist({
        answers: get().answers,
        writingAnswer: get().writingAnswer,
        translationAnswer: get().translationAnswer,
        notes: get().notes,
        highlights: get().highlights,
        submitted: true,
      });
    },

    clearAnswers: () => {
      set({
        answers: {},
        writingAnswer: "",
        translationAnswer: "",
        notes: get().notes,
        highlights: get().highlights,
        submitted: false,
      });
      persist({
        answers: {},
        writingAnswer: "",
        translationAnswer: "",
        notes: get().notes,
        highlights: get().highlights,
        submitted: false,
      });
    },
  };
});
