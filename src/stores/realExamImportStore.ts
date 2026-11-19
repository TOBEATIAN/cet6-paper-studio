import { create } from "zustand";
import type { Cet6ContentStage } from "../lib/types/cet";
import type {
  AnswerSearchResult,
  ImportedPaperDraft,
} from "../lib/types/import";
import {
  applyAnswerRows,
  answerTableForDraft,
  importedDraftToPaper,
  importedDraftIssues,
  importedPaperIssues,
  mergeAnswerRows,
  mergeImportedPages,
  parseImportedPageDraft,
} from "../lib/import/realExamImport";
import {
  importedPageInstruction,
  readImportFileAsPageImages,
} from "../lib/import/pdfPages";
import * as storage from "../lib/storage/tauri";
import { useConfigStore } from "./configStore";
import { usePaperStore } from "./paperStore";

type ImportStatus =
  | "idle"
  | "extracting"
  | "searching"
  | "ready"
  | "applying"
  | "error";

interface RealExamImportState {
  status: ImportStatus;
  progress: string;
  draft: ImportedPaperDraft | null;
  answers: AnswerSearchResult | null;
  error: string;
  extract: (input: {
    paths: string[];
    mode: "full" | "section";
    selectedStages: Cet6ContentStage[];
    listeningAudioPath?: string;
  }) => Promise<void>;
  searchAnswers: () => Promise<void>;
  replaceDraft: (draft: ImportedPaperDraft) => void;
  updateAnswer: (
    stage: Cet6ContentStage,
    groupId: string,
    sourceQuestionNumber: number,
    answerLetter: string,
  ) => void;
  apply: () => Promise<boolean>;
  clear: () => void;
}

export const useRealExamImportStore = create<RealExamImportState>((set, get) => ({
  status: "idle",
  progress: "",
  draft: null,
  answers: null,
  error: "",

  extract: async (input) => {
    const configState = useConfigStore.getState();
    const provider = configState.activeConfig();
    if (!provider) {
      set({
        status: "error",
        error: "realImport.errors.modelRequired",
      });
      return;
    }
    const apiKey = await storage.getApiKey(provider.id);
    if (!apiKey) {
      set({ status: "error", error: "realImport.errors.keyRequired" });
      return;
    }
    set({ status: "extracting", progress: "realImport.progress.render", error: "" });
    try {
      const pages = await readImportFileAsPageImages(input.paths);
      if (pages.length === 0) throw new Error("realImport.errors.noPages");
      const pageDrafts = [];
      for (let offset = 0; offset < pages.length; offset += 2) {
        set({ progress: "realImport.progress.recognize" });
        const reply = await storage.extractImageDataWithAi({
          baseUrl: provider.baseUrl,
          apiKey,
          model: provider.model,
          imageDataUrls: pages
            .slice(offset, offset + 2)
            .map((page) => page.dataUrl),
          instruction: `${importedPageInstruction({
            mode: input.mode,
            selectedStages: input.selectedStages,
          })}

PDF text layer, when available:
${pages
  .slice(offset, offset + 2)
  .map((page) => page.text)
  .filter(Boolean)
  .join("\n")
  .slice(0, 12_000)}`,
          maxTokens: Math.max(provider.maxTokens ?? 0, 16_384),
        });
        pageDrafts.push(parseImportedPageDraft(reply));
      }
      const draft = mergeImportedPages(pageDrafts, {
        mode: input.mode,
        selectedStages: input.selectedStages,
        sourceFileName: input.paths.map(fileName).join(", "),
        listeningAudioPath: input.listeningAudioPath,
      });
      set({
        draft,
        status: "ready",
        progress: "realImport.progress.draftReady",
        answers: answerTableForDraft(draft),
      });
      await get().searchAnswers();
    } catch (error) {
      set({
        status: "error",
        error: importErrorMessage(error),
      });
    }
  },

  searchAnswers: async () => {
    const draft = get().draft;
    if (!draft) return;
    if (draft.blocks.every((block) =>
      block.questions.every((question) => Boolean(question.answerLetter)),
    )) {
      set({ answers: answerTableForDraft(draft) });
      return;
    }
    const { config, getWebSearchApiKey, activeConfig } =
      useConfigStore.getState();
    const search = config.settings.webSearch;
    const model = activeConfig();
    if (!model) return;
    const [searchKey, modelKey] = await Promise.all([
      getWebSearchApiKey(search.activeProvider).catch(() => null),
      storage.getApiKey(model.id).catch(() => null),
    ]);
    const apiKey =
      search.activeProvider === "deepseek" ? searchKey ?? modelKey : searchKey;
    if (!apiKey || !modelKey) {
      set({
        status: "ready",
        progress: "realImport.progress.manualNoKey",
        error: "",
        answers: answerTableForDraft(draft),
      });
      return;
    }
    set({
      status: "searching",
      progress: "realImport.progress.search",
      error: "",
    });
    try {
      const queries = answerQueries(draft);
      const resultGroups = [];
      for (const query of queries) {
        resultGroups.push(
          ...(await storage.webSearch({
            provider: search.activeProvider,
            apiKey,
            query,
            resultCount: search.resultCount,
            contentMode: "deep",
          })),
        );
      }
      const uniqueResults = dedupeByUrl(resultGroups);
      const query = queries.join(" | ");
      if (uniqueResults.length === 0) {
        set({
          status: "ready",
          progress: "realImport.progress.manualNoResult",
          answers: mergeAnswerRows(draft, "{}", query),
        });
        return;
      }
      const reply = await storage.completeChat({
        baseUrl: model.baseUrl,
        apiKey: modelKey ?? "",
        model: model.model,
        temperature: Math.min(model.temperature ?? 0.1, 0.2),
        maxTokens: Math.max(model.maxTokens ?? 0, 12_000),
        messages: [
          {
            role: "system",
            content:
              "Extract CET-6 answer-key evidence. Never solve questions yourself.",
          },
          {
            role: "user",
            content: buildAnswerExtractionRequest(draft, uniqueResults),
          },
        ],
      });
      set({
        status: "ready",
        progress: "realImport.progress.candidates",
        answers: mergeAnswerRows(draft, reply, query),
      });
    } catch (error) {
      set({
        status: "ready",
        progress: "realImport.progress.manualFailed",
        error: error instanceof Error ? error.message : String(error),
        answers: mergeAnswerRows(draft, "{}", ""),
      });
    }
  },

  updateAnswer: (stage, groupId, sourceQuestionNumber, answerLetter) => {
    const current = get().answers;
    if (!current) return;
    const rows = current.rows.map((row) =>
      row.stage === stage &&
      row.groupId === groupId &&
      row.sourceQuestionNumber === sourceQuestionNumber
        ? {
            ...row,
            answerLetter: answerLetter.toUpperCase(),
            status: "manual" as const,
          }
        : row,
    );
    set({ answers: { ...current, rows } });
  },

  replaceDraft: (draft) =>
    set({
      draft,
      answers: answerTableForDraft(draft),
      status: "ready",
      progress: "realImport.progress.draftReady",
      error: "",
    }),

  apply: async () => {
    const draft = get().draft;
    const answers = get().answers;
    if (!draft) return false;
    const confirmedAnswers = answers;
    if (!confirmedAnswers) {
      set({
        status: "ready",
        error: "realImport.errors.answerTableRequired",
      });
      return false;
    }
    const objectiveRows =
      confirmedAnswers.rows.filter(
        (row) => !["writing", "translation"].includes(row.stage),
      );
    if (
      objectiveRows.length === 0 ||
      objectiveRows.some(
        (row) =>
          !row.answerLetter ||
          row.status === "conflict" ||
          row.status === "missing",
      )
    ) {
      set({
        status: "ready",
        error: "realImport.errors.answerConfirmRequired",
      });
      return false;
    }
    set({ status: "applying", error: "" });
    try {
      const confirmedDraft = applyAnswerRows(draft, confirmedAnswers.rows);
      const draftIssues = importedDraftIssues(confirmedDraft);
      if (draftIssues.length > 0) {
        set({
          status: "ready",
          error: `realImport.errors.draftInvalid\n${draftIssues.join("\n")}`,
        });
        return false;
      }
      const paper = importedDraftToPaper(confirmedDraft, {
        answersConfirmed: true,
      });
      const issues = importedPaperIssues(paper);
      if (issues.length > 0) {
        set({
          status: "ready",
          error: `realImport.errors.draftInvalid\n${issues.join("\n")}`,
        });
        return false;
      }
      await usePaperStore.getState().newPaper();
      await usePaperStore.getState().replacePaper(paper);
      set({
        status: "idle",
        progress: "",
        draft: null,
        answers: null,
        error: "",
      });
      return true;
    } catch (error) {
      set({
        status: "error",
        error: importErrorMessage(error),
      });
      return false;
    }
  },

  clear: () =>
    set({
      status: "idle",
      progress: "",
      draft: null,
      answers: null,
      error: "",
    }),
}));

function answerQueries(draft: ImportedPaperDraft): string[] {
  const identity = [draft.examDate, draft.setLabel, draft.title]
    .filter(Boolean)
    .join(" ");
  const passageQueries = draft.blocks
    .filter((block) => block.passage.trim())
    .slice(0, 4)
    .map((block) => {
      const words = block.passage
        .replace(/\s+/g, " ")
        .trim()
        .split(" ");
      const fingerprint = [
        ...words.slice(0, 18),
        ...words.slice(Math.max(18, words.length - 12)),
      ].join(" ");
      return `${identity} 六级 "${fingerprint}" 答案`;
    });
  return passageQueries.length > 0
    ? passageQueries
    : [`${identity || draft.sourceFileName} 大学英语六级 真题 答案`];
}

function buildAnswerExtractionRequest(
  draft: ImportedPaperDraft,
  results: Awaited<ReturnType<typeof storage.webSearch>>,
): string {
  const questions = draft.blocks.flatMap((block) =>
    block.questions
      .filter((question) => question.sourceQuestionNumber != null)
      .map((question) => ({
        stage: block.stage,
        groupId: block.groupId,
        questionNumber: question.sourceQuestionNumber,
      })),
  );
  return `Imported questions:
${JSON.stringify(questions)}

Public search results:
${JSON.stringify(
  results.map((result) => ({
    title: result.title,
    url: result.url,
    content: (result.content ?? result.snippet).slice(0, 5000),
  })),
)}

Extract only answers visibly supported by the results. Include one candidate row
for each answer/letter combination found. Preserve conflicts by returning
multiple letters for the same question. Every row needs at least one source URL
and exact evidence text from that result. Never infer answers by solving.

Return exactly:
{"answers":[{"stage":"reading-c","groupId":"the matching imported groupId","sourceQuestionNumber":46,"answerLetter":"A","sources":[{"title":"","url":"https://...","evidence":""}]}],"notes":[]}`;
}

function dedupeByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "importNoJson") return "realImport.errors.noJson";
  if (message === "importTooManyPages") {
    return "realImport.errors.tooManyPages";
  }
  if (message === "importCanvasUnavailable") {
    return "realImport.errors.canvasUnavailable";
  }
  return message;
}
