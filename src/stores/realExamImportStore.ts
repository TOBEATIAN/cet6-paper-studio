import { create } from "zustand";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Cet6ContentStage } from "../lib/types/cet";
import type {
  AnswerSearchResult,
  ImportSession,
  ImportedSetDraft,
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
  applyProvidedAnswers,
  isAnswerKeyPage,
  parseProvidedAnswers,
} from "../lib/import/answerKey";
import {
  emptyAnswerBank,
  entriesFromConfirmedDraft,
  lookupBankAnswers,
  mergeAnswerBank,
} from "../lib/import/answerBank";
import { AnswerBankSchema } from "../lib/types/answerBank";
import {
  importedTextInstruction,
  importSourceHash,
  readImportFileAsPageImages,
} from "../lib/import/pdfPages";
import {
  assignListeningAudioPaths,
  detectExamDate,
  detectSetRanges,
  setPageText,
} from "../lib/import/realExamSets";
import { ImportSessionSchema } from "../lib/types/import";
import { ImportedPaperDraftSchema } from "../lib/types/import";
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
  progressCurrent: number;
  progressTotal: number;
  progressStartedAt: string | null;
  session: ImportSession | null;
  activeSetId: string | null;
  draft: ImportedPaperDraft | null;
  answers: AnswerSearchResult | null;
  bankCount: number;
  error: string;
  extract: (input: {
    paths: string[];
    mode: "full" | "section";
    selectedStages: Cet6ContentStage[];
    listeningAudioPath?: string;
    listeningAudioPaths?: string[];
  }) => Promise<void>;
  searchAnswers: () => Promise<void>;
  searchSetAnswers: (id: string) => Promise<void>;
  selectSet: (id: string) => void;
  toggleSet: (id: string, enabled: boolean) => void;
  updateSetAudio: (id: string, path: string) => void;
  updateSetRange: (id: string, pageStart: number, pageEnd: number) => void;
  retrySet: (id: string) => Promise<void>;
  replaceDraft: (draft: ImportedPaperDraft) => void;
  updateAnswer: (
    stage: Cet6ContentStage,
    groupId: string,
    sourceQuestionNumber: number,
    answerLetter: string,
  ) => void;
  apply: () => Promise<boolean>;
  importBank: (path: string) => Promise<void>;
  exportBank: (path: string) => Promise<void>;
  refreshBankCount: () => Promise<void>;
  clear: () => void;
}

function updateSet(
  get: () => RealExamImportState,
  set: (partial: Partial<RealExamImportState>) => void,
  id: string,
  patch: Partial<ImportedSetDraft>,
): ImportedSetDraft | null {
  const session = get().session;
  if (!session) return null;
  let updated: ImportedSetDraft | null = null;
  const sets = session.sets.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  set({ session: { ...session, sets } });
  return updated;
}

export const useRealExamImportStore = create<RealExamImportState>((set, get) => ({
  status: "idle",
  progress: "",
  progressCurrent: 0,
  progressTotal: 0,
  progressStartedAt: null,
  session: null,
  activeSetId: null,
  draft: null,
  answers: null,
  bankCount: 0,
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
    const startedAt = new Date().toISOString();
    set({
      status: "extracting",
      progress: "realImport.progress.render",
      progressCurrent: 0,
      progressTotal: 0,
      progressStartedAt: startedAt,
      session: null,
      activeSetId: null,
      error: "",
    });
    try {
      const pages = await readImportFileAsPageImages(input.paths);
      const sourceHash = await importSourceHash(input.paths);
      if (pages.length === 0) throw new Error("realImport.errors.noPages");
      const scanned = pages.filter(
        (page) => page.text.replace(/\s+/g, "").length < 80,
      );
      const ocrByPage = new Map<
        number,
        { text: string; confidence: number; cached: boolean }
      >();
      for (let offset = 0; offset < scanned.length; offset += 5) {
        const chunk = scanned.slice(offset, offset + 5);
        set({
          progress: "realImport.progress.ocrBatch",
          progressCurrent: offset,
          progressTotal: scanned.length,
        });
        const ocr = await storage.ocrImportPages({
          dataDir: configState.dataDir ?? "",
          sourceHash,
          pages: chunk.map((page) => ({
            pageNumber: page.pageNumber,
            imageDataUrl: page.dataUrl,
          })),
        });
        for (const result of ocr) {
          ocrByPage.set(result.pageNumber, {
            text: result.text,
            confidence: result.averageConfidence,
            cached: result.cached,
          });
        }
        set({ progressCurrent: Math.min(offset + chunk.length, scanned.length) });
      }

      const textPages = pages.map((page) => {
        const ocr = ocrByPage.get(page.pageNumber);
        const text =
          page.text.replace(/\s+/g, "").length >= 80 ? page.text : ocr?.text ?? "";
        return {
          pageNumber: page.pageNumber,
          text,
          confidence:
            page.text.replace(/\s+/g, "").length >= 80
              ? 1
              : ocr?.confidence ?? 0,
          cached: ocr?.cached ?? false,
        };
      });
      const answerKeyPages = textPages.filter((page) =>
        isAnswerKeyPage(page.text),
      );
      const examPages = textPages.filter(
        (page) => !answerKeyPages.some((key) => key.pageNumber === page.pageNumber),
      );
      if (examPages.length === 0) throw new Error("realImport.errors.noPages");
      const ranges = detectSetRanges(examPages);
      const audioPaths = [
        ...new Set(
          (input.listeningAudioPaths ??
            (input.listeningAudioPath ? [input.listeningAudioPath] : [])).filter(
            Boolean,
          ),
        ),
      ];
      const assignedAudioPaths = assignListeningAudioPaths(
        ranges.map((range) => range.setLabel),
        audioPaths,
      );
      const providedAnswers = parseProvidedAnswers(answerKeyPages);
      const sets: ImportedSetDraft[] = ranges.map((range, index) => ({
        id: `${range.pageStart}-${range.pageEnd}`,
        setLabel: range.setLabel,
        examDate: detectExamDate(
          setPageText(textPages, range).slice(0, 5_000),
        ),
        pageStart: range.pageStart,
        pageEnd: range.pageEnd,
        enabled: true,
        status: "pending",
        error: "",
        listeningAudioPath: assignedAudioPaths[index] ?? "",
        providedAnswers: providedAnswers.filter(
          (answer) => answer.setLabel === range.setLabel,
        ),
      }));
      const session = ImportSessionSchema.parse({
        sourceHash,
        sourceFileName: input.paths.map(fileName).join(", "),
        listeningAudioPath: audioPaths[0] ?? "",
        listeningAudioPaths: audioPaths,
        mode: input.mode,
        selectedStages: input.selectedStages,
        pages: textPages,
        sets,
      });
      set({
        session,
        activeSetId: sets[0]?.id ?? null,
        draft: null,
        answers: null,
        status: "extracting",
        progress: "realImport.progress.structureSets",
        progressCurrent: 0,
        progressTotal: sets.length,
      });

      for (const [index, item] of sets.entries()) {
        set({
          progressCurrent: index,
          activeSetId: item.id,
        });
        await get().retrySet(item.id);
      }
      const first = get().session?.sets[0];
      set({
        status: "ready",
        progress: "realImport.progress.setsReady",
        progressCurrent: sets.length,
        activeSetId: first?.id ?? null,
        draft: first?.draft ?? null,
        answers: first?.answers ?? null,
        error: first?.error ?? "",
      });
    } catch (error) {
      set({
        status: "error",
        error: importErrorMessage(error),
      });
    }
  },

  searchAnswers: async () => {
    const id = get().activeSetId;
    if (id) await get().searchSetAnswers(id);
  },

  searchSetAnswers: async (id) => {
    const item = get().session?.sets.find((candidate) => candidate.id === id);
    const draft = item?.draft;
    if (!item || !draft) return;
    const { config, getWebSearchApiKey, activeConfig, dataDir } =
      useConfigStore.getState();
    const bank = await loadLocalBank(dataDir);
    const bankTable = lookupBankAnswers(draft, bank);
    updateSet(get, set, id, { answers: bankTable });
    set({ bankCount: bank.entries.length });
    if (
      bankTable.rows.every(
        (row) => row.status !== "missing" && row.status !== "conflict",
      ) ||
      draft.blocks.every((block) =>
        block.questions.every((question) => Boolean(question.answerLetter)),
      )
    ) {
      updateSet(get, set, id, {
        answers: bankTable,
      });
      if (get().activeSetId === id) {
        set({ draft, answers: bankTable, progress: "realImport.progress.bankHit" });
      }
      return;
    }
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
        answers: bankTable,
      });
      return;
    }
    set({
      status: "ready",
      progress: get().activeSetId === id
        ? "realImport.progress.search"
        : get().progress,
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
          ...(get().activeSetId === id
            ? {
                status: "ready" as const,
                progress: "realImport.progress.manualNoResult",
                answers: mergeAnswerRows(draft, "{}", query, bankTable),
              }
            : {}),
        });
        updateSet(get, set, id, {
          answers: mergeAnswerRows(draft, "{}", query, bankTable),
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
      const nextAnswers = mergeAnswerRows(draft, reply, query, bankTable);
      updateSet(get, set, id, { answers: nextAnswers });
      if (get().activeSetId === id) {
        set({
          status: "ready",
          progress: "realImport.progress.candidates",
          draft,
          answers: nextAnswers,
        });
      }
    } catch (error) {
      const nextAnswers = mergeAnswerRows(draft, "{}", "", bankTable);
      updateSet(get, set, id, { answers: nextAnswers });
      if (get().activeSetId === id) {
        set({
          status: "ready",
          progress: "realImport.progress.manualFailed",
          error: importErrorMessage(error),
          draft,
          answers: nextAnswers,
        });
      }
    }
  },

  selectSet: (id) => {
    const item = get().session?.sets.find((candidate) => candidate.id === id);
    if (!item) return;
    set({
      activeSetId: id,
      draft: item.draft ?? null,
      answers: item.answers ?? null,
      error: item.error,
      progress:
        item.status === "ready"
          ? "realImport.progress.draftReady"
          : item.status === "error"
            ? "realImport.progress.manualFailed"
            : "realImport.progress.structureSets",
    });
  },

  toggleSet: (id, enabled) => {
    updateSet(get, set, id, { enabled });
  },

  updateSetAudio: (id, path) => {
    updateSet(get, set, id, { listeningAudioPath: path });
  },

  updateSetRange: (id, pageStart, pageEnd) => {
    const session = get().session;
    if (!session) return;
    const start = Math.min(
      session.pages.length,
      Math.max(1, Math.min(pageStart, pageEnd)),
    );
    const end = Math.min(
      session.pages.length,
      Math.max(start, pageStart, pageEnd),
    );
    updateSet(get, set, id, {
      pageStart: start,
      pageEnd: end,
      status: "pending",
      draft: undefined,
      answers: undefined,
      error: "",
    });
    if (get().activeSetId === id) {
      set({ draft: null, answers: null, status: "ready", error: "" });
    }
  },

  retrySet: async (id) => {
    const session = get().session;
    const item = session?.sets.find((candidate) => candidate.id === id);
    if (!session || !item) return;
    const configState = useConfigStore.getState();
    const provider = configState.activeConfig();
    if (!provider) return;
    const apiKey = await storage.getApiKey(provider.id);
    if (!apiKey) return;
    updateSet(get, set, id, { status: "extracting", error: "" });
    if (get().activeSetId === id) {
      set({ status: "extracting", error: "" });
    }
    try {
      const pageText = setPageText(session.pages, item);
      const reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        temperature: Math.min(provider.temperature ?? 0.1, 0.2),
        maxTokens: Math.max(provider.maxTokens ?? 0, 24_000),
        messages: [
          {
            role: "system",
            content:
              "Convert OCR text into the requested import JSON. Return JSON only.",
          },
          {
            role: "user",
            content: `${importedTextInstruction({
              mode: session.mode,
              selectedStages: session.selectedStages,
              setLabel: item.setLabel,
              examDate: item.examDate,
            })}

OCR/text-layer pages:
${pageText.slice(0, 70_000)}`,
          },
        ],
      });
      const pageDraft = parseImportedPageDraft(reply);
      const draftWithAudio = ImportedPaperDraftSchema.parse({
        ...mergeImportedPages([pageDraft], {
          mode: session.mode,
          selectedStages: session.selectedStages,
          sourceFileName: session.sourceFileName,
          sourceHash: session.sourceHash,
          listeningAudioPath: item.listeningAudioPath,
        }),
        examDate: item.examDate || pageDraft.examDate,
        setLabel: item.setLabel || pageDraft.setLabel,
      });
      const draft = applyProvidedAnswers(
        draftWithAudio,
        item.providedAnswers,
      );
      const answerTable = answerTableForDraft(draft);
      updateSet(get, set, id, {
        status: "ready",
        draft,
        answers: answerTable,
        error: "",
      });
      if (get().activeSetId === id) {
        set({
          status: "ready",
          draft,
          answers: answerTable,
          progress: "realImport.progress.draftReady",
          error: "",
        });
      }
      await get().searchSetAnswers(id);
    } catch (error) {
      const message = importErrorMessage(error);
      updateSet(get, set, id, { status: "error", error: message });
      if (get().activeSetId === id) {
        set({
          status: "error",
          error: message,
          progress: "realImport.progress.manualFailed",
        });
      }
    }
  },

  updateAnswer: (stage, groupId, sourceQuestionNumber, answerLetter) => {
    const id = get().activeSetId;
    const current = get().answers;
    if (!id || !current) return;
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
    const answers = { ...current, rows };
    updateSet(get, set, id, { answers });
    set({ answers });
  },

  replaceDraft: (draft) => {
    const id = get().activeSetId;
    if (!id) return;
    const answers = answerTableForDraft(draft);
    updateSet(get, set, id, { draft, answers, status: "ready", error: "" });
    set({
      draft,
      answers,
      status: "ready",
      progress: "realImport.progress.draftReady",
      error: "",
    });
  },

  apply: async () => {
    const session = get().session;
    const selectedSets =
      session?.sets.filter((item) => item.enabled) ?? [];
    if (!session || selectedSets.length === 0) {
      set({ status: "ready", error: "realImport.errors.noEnabledSets" });
      return false;
    }
    const prepared: Array<{
      set: ImportedSetDraft;
      draft: ImportedPaperDraft;
      answers: AnswerSearchResult;
      paper: ReturnType<typeof importedDraftToPaper>;
    }> = [];
    for (const item of selectedSets) {
      if (!item.draft || !item.answers) {
        get().selectSet(item.id);
        set({ error: "realImport.errors.answerTableRequired" });
        return false;
      }
      const objectiveRows = item.answers.rows.filter(
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
        get().selectSet(item.id);
        set({ error: "realImport.errors.answerConfirmRequired" });
        return false;
      }
      const confirmedDraft = applyAnswerRows(item.draft, item.answers.rows);
      const draftIssues = importedDraftIssues(confirmedDraft);
      if (draftIssues.length > 0) {
        get().selectSet(item.id);
        set({
          error: `realImport.errors.draftInvalid\n${draftIssues.join("\n")}`,
        });
        return false;
      }
      const paper = importedDraftToPaper(confirmedDraft, {
        answersConfirmed: true,
      });
      const issues = importedPaperIssues(paper);
      if (issues.length > 0) {
        get().selectSet(item.id);
        set({
          error: `realImport.errors.draftInvalid\n${issues.join("\n")}`,
        });
        return false;
      }
      prepared.push({
        set: item,
        draft: confirmedDraft,
        answers: item.answers,
        paper,
      });
    }
    set({ status: "applying", error: "" });
    try {
      const { dataDir } = useConfigStore.getState();
      const bank = await loadLocalBank(dataDir);
      const existing = usePaperStore.getState().papers;
      let importedCount = 0;
      const nextBank = mergeAnswerBank(
        bank,
        AnswerBankSchema.parse({
          version: 1,
          updatedAt: new Date().toISOString(),
          entries: prepared.flatMap((entry) =>
            entriesFromConfirmedDraft(entry.draft, entry.answers.rows),
          ),
        }),
      );
      for (const entry of prepared) {
        const duplicate = existing.some(
          (paper) =>
            !paper.archived &&
            paper.sourceHash === session.sourceHash &&
            paper.setLabel === entry.set.setLabel &&
            paper.examDate === entry.set.examDate,
        );
        if (duplicate) continue;
        await usePaperStore.getState().newPaper();
        await usePaperStore.getState().replacePaper(entry.paper);
        importedCount += 1;
      }
      if (dataDir) {
        await storage
          .saveAnswerBank(dataDir, JSON.stringify(nextBank, null, 2))
          .catch(() => undefined);
      }
      set({
        status: "idle",
        progress: "",
        progressCurrent: 0,
        progressTotal: 0,
        progressStartedAt: null,
        session: null,
        activeSetId: null,
        draft: null,
        answers: null,
        bankCount: nextBank.entries.length,
        error: "",
      });
      return importedCount > 0 || prepared.length > 0;
    } catch (error) {
      set({
        status: "error",
        error: importErrorMessage(error),
      });
      return false;
    }
  },

  importBank: async (path) => {
    const { dataDir } = useConfigStore.getState();
    if (!dataDir) return;
    try {
      const incoming = AnswerBankSchema.parse(
        JSON.parse(await readTextFile(path)),
      );
      const next = mergeAnswerBank(await loadLocalBank(dataDir), incoming);
      await storage.saveAnswerBank(dataDir, JSON.stringify(next, null, 2));
      set({ bankCount: next.entries.length, error: "" });
    } catch (error) {
      set({ error: importErrorMessage(error) });
    }
  },

  exportBank: async (path) => {
    const { dataDir } = useConfigStore.getState();
    if (!dataDir) return;
    try {
      const bank = await loadLocalBank(dataDir);
      await writeTextFile(path, JSON.stringify(bank, null, 2));
      set({ bankCount: bank.entries.length, error: "" });
    } catch (error) {
      set({ error: importErrorMessage(error) });
    }
  },

  refreshBankCount: async () => {
    const bank = await loadLocalBank(useConfigStore.getState().dataDir);
    set({ bankCount: bank.entries.length });
  },

  clear: () =>
    set({
      status: "idle",
      progress: "",
      progressCurrent: 0,
      progressTotal: 0,
      progressStartedAt: null,
      session: null,
      activeSetId: null,
      draft: null,
      answers: null,
      error: "",
    }),
}));

function answerQueries(draft: ImportedPaperDraft): string[] {
  const identity = [draft.examDate, draft.setLabel]
    .filter(Boolean)
    .join(" ");
  const identityQuery = `${
    identity || draft.sourceFileName
  } 大学英语六级 真题 答案`;
  const passageQueries = draft.blocks
    .filter((block) => block.passage.trim())
    .slice(0, 3)
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
  return [...new Set([identityQuery, ...passageQueries])];
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

async function loadLocalBank(dataDir: string | null) {
  if (!dataDir) return emptyAnswerBank();
  try {
    const raw = await storage.loadAnswerBank(dataDir);
    return raw == null ? emptyAnswerBank() : AnswerBankSchema.parse(raw);
  } catch {
    return emptyAnswerBank();
  }
}
