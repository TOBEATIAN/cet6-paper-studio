import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { ReviewIndex, ReviewMeta, ReviewRecord } from "../lib/types/review";
import { analyzeReview } from "../lib/review/analysis";
import {
  buildDeepReviewMessages,
  buildSingleAnswerReviewMessages,
  parseDeepReviewReply,
} from "../lib/review/deepReview";
import * as storage from "../lib/storage/tauri";
import { useConfigStore } from "./configStore";
import { usePaperStore } from "./paperStore";

interface ReviewState {
  reviews: ReviewMeta[];
  activeReview: ReviewRecord | null;
  deepReviewError: string | null;
  load: (paperId: string) => Promise<void>;
  save: (input: {
    answers: Record<string, string>;
    writingAnswer: string;
    translationAnswer: string;
    reviewNotes: string;
    readingArticleCard: string;
  }) => Promise<ReviewRecord | null>;
  improve: (
    reviewId: string,
    kind: "writing" | "translation",
  ) => Promise<boolean>;
  open: (reviewId: string) => Promise<void>;
  generateDeepReview: (reviewId: string) => Promise<boolean>;
  remove: (reviewId: string) => Promise<void>;
  clear: () => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  reviews: [],
  activeReview: null,
  deepReviewError: null,

  load: async (paperId) => {
    const dataDir = useConfigStore.getState().dataDir;
    if (!dataDir) return;
    const index = await storage.loadReviewIndex(dataDir, paperId);
    set({
      reviews: index?.reviews ?? [],
      activeReview: null,
      deepReviewError: null,
    });
  },

  save: async (input) => {
    const dataDir = useConfigStore.getState().dataDir;
    const paper = usePaperStore.getState().paper;
    const paperId = usePaperStore.getState().activePaperId;
    if (!dataDir || !paperId) return null;
    const createdAt = new Date().toISOString();
    const record: ReviewRecord = {
      version: 1,
      id: uuid(),
      paperId,
      paperTitle: paper.title,
      createdAt,
      answers: input.answers,
      writingAnswer: input.writingAnswer,
      translationAnswer: input.translationAnswer,
      reviewNotes: input.reviewNotes,
      readingArticleCard: input.readingArticleCard,
      errorTypes: [],
    };
    const analysis = analyzeReview(paper, record);
    const meta: ReviewMeta = {
      id: record.id,
      paperId,
      paperTitle: paper.title,
      createdAt,
      updatedAt: createdAt,
      answered: analysis.answered,
      correct: analysis.correct,
      objectiveScore: analysis.objectiveScore,
      errorTypes: [],
      hasDeepReview: false,
    };
    const current =
      (await storage.loadReviewIndex(dataDir, paperId)) ??
      ({ version: 1, reviews: [] } satisfies ReviewIndex);
    const index: ReviewIndex = {
      ...current,
      reviews: [meta, ...current.reviews.filter((item) => item.id !== meta.id)],
    };
    await storage.saveReview(dataDir, paperId, record);
    await storage.saveReviewIndex(dataDir, paperId, index);
    set({
      reviews: index.reviews,
      activeReview: record,
      deepReviewError: null,
    });
    return record;
  },

  generateDeepReview: async (reviewId) => {
    const dataDir = useConfigStore.getState().dataDir;
    const paper = usePaperStore.getState().paper;
    const paperId = usePaperStore.getState().activePaperId;
    const provider = useConfigStore.getState().activeConfig();
    if (!dataDir || !paperId || !provider) {
      set({ deepReviewError: "请先配置并启用一个文本模型。" });
      return false;
    }
    const current = await storage.loadReview(dataDir, paperId, reviewId);
    if (!current) {
      set({ deepReviewError: "找不到这条复盘记录，请重新保存后再试。" });
      return false;
    }
    const apiKey = await storage.getApiKey(provider.id);
    if (!apiKey) {
      set({ deepReviewError: "当前模型没有可用的 API Key。" });
      return false;
    }
    const analysis = analyzeReview(paper, current);
    set({ deepReviewError: null });
    try {
      const reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        temperature: Math.min(provider.temperature ?? 0.2, 0.3),
        maxTokens: Math.max(provider.maxTokens ?? 0, 16_000),
        messages: buildDeepReviewMessages({
          paper,
          analysis,
          reviewCreatedAt: current.createdAt,
          reviewNotes: current.reviewNotes,
          readingArticleCard: current.readingArticleCard,
          previousReviews: get()
            .reviews.filter((review) => review.id !== reviewId)
            .map((review) => ({
              createdAt: review.createdAt,
              objectiveScore: review.objectiveScore,
              writingScore: review.writingScore,
              translationScore: review.translationScore,
              totalScore: review.totalScore,
              errorTypes: review.errorTypes,
            })),
        }),
      });
      const result = parseDeepReviewReply(reply);
      const writingPoints =
        result.writingScore == null ? undefined : result.writingScore * 7.1;
      const translationPoints =
        result.translationScore == null
          ? undefined
          : result.translationScore * 7.1;
      const totalScore =
        writingPoints == null || translationPoints == null
          ? undefined
          : Math.round(
              (analysis.objectiveScore + writingPoints + translationPoints) *
                100,
            ) / 100;
      const next: ReviewRecord = {
        ...current,
        deepReview: result.markdown,
        writingScore: result.writingScore,
        translationScore: result.translationScore,
        totalScore,
        errorTypes: result.errorTypes,
      };
      const now = new Date().toISOString();
      const currentIndex =
        (await storage.loadReviewIndex(dataDir, paperId)) ?? {
          version: 1,
          reviews: [],
        };
      const nextIndex: ReviewIndex = {
        ...currentIndex,
        reviews: currentIndex.reviews.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                updatedAt: now,
                writingScore: result.writingScore,
                translationScore: result.translationScore,
                totalScore,
                errorTypes: result.errorTypes,
                hasDeepReview: true,
              }
            : review,
        ),
      };
      await storage.saveReview(dataDir, paperId, next);
      await storage.saveReviewIndex(dataDir, paperId, nextIndex);
      set({
        activeReview: next,
        reviews: nextIndex.reviews,
        deepReviewError: null,
      });
      return true;
    } catch (error) {
      set({
        deepReviewError:
          error instanceof Error ? error.message : "深度复盘生成失败。",
      });
      return false;
    }
  },

  improve: async (reviewId, kind) => {
    const dataDir = useConfigStore.getState().dataDir;
    const paper = usePaperStore.getState().paper;
    const paperId = usePaperStore.getState().activePaperId;
    const provider = useConfigStore.getState().activeConfig();
    if (!dataDir || !paperId || !provider) return false;
    const current = await storage.loadReview(dataDir, paperId, reviewId);
    if (!current) return false;
    const task = paper.questions.find(
      (question) =>
        question.examSection?.kind ===
        (kind === "writing" ? "cet-writing" : "cet-translation"),
    );
    if (!task) return false;
    const answer =
      kind === "writing" ? current.writingAnswer : current.translationAnswer;
    if (!answer.trim()) return false;
    const apiKey = await storage.getApiKey(provider.id);
    if (!apiKey) return false;
    let reply: string;
    try {
      reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
        messages: buildSingleAnswerReviewMessages(kind, task, answer),
      });
    } catch {
      return false;
    }
    const next: ReviewRecord = {
      ...current,
      ...(kind === "writing"
        ? { improvedWriting: reply.trim() }
        : { improvedTranslation: reply.trim() }),
    };
    await storage.saveReview(dataDir, paperId, next);
    set({ activeReview: next });
    return true;
  },

  open: async (reviewId) => {
    const dataDir = useConfigStore.getState().dataDir;
    const paperId = usePaperStore.getState().activePaperId;
    if (!dataDir || !paperId) return;
    const record = await storage.loadReview(dataDir, paperId, reviewId);
    if (record) set({ activeReview: record, deepReviewError: null });
  },

  remove: async (reviewId) => {
    const dataDir = useConfigStore.getState().dataDir;
    const paperId = usePaperStore.getState().activePaperId;
    if (!dataDir || !paperId) return;
    await storage.deleteReview(dataDir, paperId, reviewId);
    const current = await storage.loadReviewIndex(dataDir, paperId);
    const index: ReviewIndex = {
      version: 1,
      reviews: (current?.reviews ?? []).filter((item) => item.id !== reviewId),
    };
    await storage.saveReviewIndex(dataDir, paperId, index);
    set({
      reviews: index.reviews,
      activeReview:
        get().activeReview?.id === reviewId ? null : get().activeReview,
      deepReviewError:
        get().activeReview?.id === reviewId ? null : get().deepReviewError,
    });
  },

  clear: () =>
    set({ reviews: [], activeReview: null, deepReviewError: null }),
}));
