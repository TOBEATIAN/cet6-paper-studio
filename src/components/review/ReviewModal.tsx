import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  ImageUp,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import {
  analyzeReview,
} from "../../lib/review/analysis";
import { correctLetter } from "../../lib/cet/quality/textMetrics";
import type { Question } from "../../lib/types/exam";
import { usePaperStore } from "../../stores/paperStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useConfigStore } from "../../stores/configStore";
import * as storage from "../../lib/storage/tauri";
import { iconBtn, inputCls, primaryBtn, secondaryBtn } from "../../lib/ui/styles";
import { Markdown } from "../paper/Markdown";

interface ReviewModalProps {
  onClose: () => void;
  initialPractice?: ReviewInitialPractice;
}

export interface ReviewInitialPractice {
  key: string;
  answers: Record<string, string>;
  writingAnswer: string;
  translationAnswer: string;
}

export function ReviewModal({
  onClose,
  initialPractice,
}: ReviewModalProps) {
  const { t } = useTranslation();
  const paper = usePaperStore((s) => s.paper);
  const activePaperId = usePaperStore((s) => s.activePaperId);
  const dataDir = useConfigStore((s) => s.dataDir);
  const activeConfig = useConfigStore((s) => s.activeConfig());
  const reviews = useReviewStore((s) => s.reviews);
  const activeReview = useReviewStore((s) => s.activeReview);
  const load = useReviewStore((s) => s.load);
  const save = useReviewStore((s) => s.save);
  const openReview = useReviewStore((s) => s.open);
  const removeReview = useReviewStore((s) => s.remove);
  const improve = useReviewStore((s) => s.improve);
  const generateDeepReview = useReviewStore((s) => s.generateDeepReview);
  const deepReviewError = useReviewStore((s) => s.deepReviewError);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [writingAnswer, setWritingAnswer] = useState("");
  const [translationAnswer, setTranslationAnswer] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [readingArticleCard, setReadingArticleCard] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [deepReviewBusy, setDeepReviewBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState("");
  const appliedPracticeKey = useRef<string | null>(null);

  useEffect(() => {
    if (activePaperId) void load(activePaperId);
  }, [activePaperId, load]);

  useEffect(() => {
    if (!activeReview) return;
    setAnswers(activeReview.answers);
    setWritingAnswer(activeReview.writingAnswer);
    setTranslationAnswer(activeReview.translationAnswer);
    setReviewNotes(activeReview.reviewNotes);
    setReadingArticleCard(activeReview.readingArticleCard);
  }, [activeReview]);

  useEffect(() => {
    if (
      activeReview ||
      !initialPractice ||
      appliedPracticeKey.current === initialPractice.key
    ) {
      return;
    }
    appliedPracticeKey.current = initialPractice.key;
    setAnswers(initialPractice.answers);
    setWritingAnswer(initialPractice.writingAnswer);
    setTranslationAnswer(initialPractice.translationAnswer);
  }, [activeReview, initialPractice]);

  const objectiveSections = useMemo(() => {
    type ChoiceQuestion = Extract<Question, { type: "single-choice" }>;
    const groups = new Map<string, ChoiceQuestion[]>();
    paper.questions
      .filter(
        (question): question is Extract<Question, { type: "single-choice" }> =>
          question.type === "single-choice" &&
          question.examSection?.questionNumber != null,
      )
      .forEach((question) => {
        const kind = question.examSection?.kind ?? "unknown";
        groups.set(kind, [...(groups.get(kind) ?? []), question]);
      });
    return [...groups.entries()];
  }, [paper.questions]);
  const writingTask = paper.questions.find(
    (question) => question.examSection?.kind === "cet-writing",
  );
  const translationTask = paper.questions.find(
    (question) => question.examSection?.kind === "cet-translation",
  );
  const analysis = activeReview ? analyzeReview(paper, activeReview) : null;
  const correctAnswersByNumber = useMemo(
    () =>
      Object.fromEntries(
        paper.questions
          .filter(
            (
              question,
            ): question is Extract<Question, { type: "single-choice" }> =>
              question.type === "single-choice" &&
              question.examSection?.questionNumber != null,
          )
          .map((question) => [
            String(question.examSection?.questionNumber),
            correctLetter(question.correctAnswer),
          ]),
      ) as Record<string, string>,
    [paper.questions],
  );
  const markedWrongCount = Object.entries(answers).filter(
    ([questionNumber, answer]) =>
      correctAnswersByNumber[questionNumber] != null &&
      answer !== correctAnswersByNumber[questionNumber],
  ).length;
  const needsReadingArticleCard = paper.questions.some(
    (question) => question.examSection?.kind === "cet-reading-c",
  );
  const readingArticleCardReady =
    !needsReadingArticleCard || readingArticleCard.trim().length > 0;

  async function importImages(target: "writing" | "translation") {
    if (!activeConfig) {
      setError(t("review.imageNeedsModel"));
      return;
    }
    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: dataDir ?? undefined,
      filters: [
        {
          name: "Answer images",
          extensions: ["jpg", "jpeg", "png", "webp", "gif"],
        },
      ],
    });
    const paths =
      typeof selected === "string"
        ? [selected]
        : Array.isArray(selected)
          ? selected
          : [];
    if (paths.length === 0) return;
    setImportBusy(true);
    setImportStatus("");
    setError("");
    try {
      const apiKey = await storage.getApiKey(activeConfig.id);
      if (!apiKey) {
        setError(t("review.imageNeedsKey"));
        return;
      }
      const text = await storage.extractImagesWithAi({
        baseUrl: activeConfig.baseUrl,
        apiKey,
        model: activeConfig.model,
        imagePaths: paths,
        instruction: imageImportInstruction(target),
      });
      if (target === "writing") {
        setWritingAnswer(text.trim());
      } else {
        setTranslationAnswer(text.trim());
      }
      setImportStatus(t("review.imageRecognized"));
    } catch {
      setError(t("review.imageRecognizeFailed"));
    } finally {
      setImportBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({
        answers,
        writingAnswer,
        translationAnswer,
        reviewNotes,
        readingArticleCard,
      });
    } catch {
      setError(t("review.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const setQuestionAnswer = (
    questionNumber: number,
    answer: string,
  ) => {
    const key = String(questionNumber);
    setAnswers((current) => {
      const next = { ...current };
      if (answer === correctAnswersByNumber[key]) {
        delete next[key];
      } else {
        next[key] = answer;
      }
      return next;
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("review.title")}
        className="flex h-[88vh] max-h-[48rem] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t("review.title")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("review.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("settings.cancel")}
            onClick={onClose}
            className={iconBtn}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] sm:grid-cols-[18rem_minmax(0,1fr)] sm:grid-rows-1">
          <aside className="min-h-0 overflow-auto border-b border-border bg-muted/30 p-3 sm:border-b-0 sm:border-r">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("review.history")}
            </p>
            <ul className="mt-2 space-y-1">
              {reviews.map((review) => (
                <li key={review.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openReview(review.id)}
                    className="min-w-0 flex-1 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="block truncate font-medium">
                      {new Date(review.createdAt).toLocaleString()}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {t("review.historyScore", {
                        correct: review.correct,
                        answered: review.answered,
                        score: review.objectiveScore.toFixed(1),
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("settings.delete")}
                    onClick={() => void removeReview(review.id)}
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {reviews.length === 0 && (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t("review.noHistory")}
                </li>
              )}
            </ul>
          </aside>

          <section className="min-h-0 overflow-auto p-4 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-4">
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {t("review.defaultCorrectHint", {
                    count: markedWrongCount,
                  })}
                </p>

                {objectiveSections.map(([kind, questions]) => (
                  <section key={kind}>
                    <h3 className="mb-2 text-sm font-semibold">
                      {t(`review.sections.${kind}`, {
                        defaultValue: kind,
                      })}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {questions.map((question) => {
                        const number =
                          question.examSection?.questionNumber ?? 0;
                        const correct =
                          correctAnswersByNumber[String(number)] ?? "";
                        const selected =
                          answers[String(number)] ?? correct;
                        const wrong = selected !== correct;
                        return (
                          <label
                            key={question.id}
                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                              wrong
                                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                                : "border-border bg-background"
                            }`}
                          >
                            <span className="w-6 shrink-0 text-muted-foreground">
                              {number}
                            </span>
                            {!wrong && (
                              <CheckCircle2
                                className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                aria-label={t("review.correctDefault")}
                              />
                            )}
                            <select
                              value={selected}
                              onChange={(event) =>
                                setQuestionAnswer(
                                  number,
                                  event.currentTarget.value,
                                )
                              }
                              aria-label={t("review.questionAnswerLabel", {
                                number,
                              })}
                              className="min-w-0 flex-1 bg-transparent outline-none"
                            >
                              {question.options.map((_, index) => {
                                const letter = String.fromCharCode(65 + index);
                                return (
                                  <option key={letter} value={letter}>
                                    {letter}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {writingTask && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t("review.writingAnswer")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void importImages("writing")}
                        disabled={importBusy}
                        aria-label={t("review.importWritingImage")}
                        className={secondaryBtn}
                      >
                        {importBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImageUp className="h-4 w-4" />
                        )}
                        {t("review.importImages")}
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={writingAnswer}
                      onChange={(event) =>
                        setWritingAnswer(event.currentTarget.value)
                      }
                      className={`${inputCls} resize-y`}
                      aria-label={t("review.writingAnswer")}
                    />
                  </div>
                )}
                {translationTask && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t("review.translationAnswer")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void importImages("translation")}
                        disabled={importBusy}
                        aria-label={t("review.importTranslationImage")}
                        className={secondaryBtn}
                      >
                        {importBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImageUp className="h-4 w-4" />
                        )}
                        {t("review.importImages")}
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={translationAnswer}
                      onChange={(event) =>
                        setTranslationAnswer(event.currentTarget.value)
                      }
                      className={`${inputCls} resize-y`}
                      aria-label={t("review.translationAnswer")}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">
                    {t("review.reviewNotes")}
                  </span>
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(event) =>
                      setReviewNotes(event.currentTarget.value)
                    }
                    className={`${inputCls} resize-y`}
                    placeholder={t("review.reviewNotesHint")}
                    aria-label={t("review.reviewNotes")}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">
                    {t("review.readingArticleCard")}
                  </span>
                  <textarea
                    rows={5}
                    value={readingArticleCard}
                    onChange={(event) =>
                      setReadingArticleCard(event.currentTarget.value)
                    }
                    className={`${inputCls} resize-y`}
                    placeholder={t("review.readingArticleCardHint")}
                    aria-label={t("review.readingArticleCard")}
                  />
                </div>
                {importStatus && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {importStatus}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {t("review.imagePrivacy")}
                </p>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className={primaryBtn}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("review.analyze")}
                </button>
              </div>

              <aside className="space-y-3">
                {analysis ? (
                  <ReviewAnalysisPanel
                    analysis={analysis}
                    reviewId={activeReview?.id ?? null}
                    improvedWriting={activeReview?.improvedWriting ?? ""}
                    improvedTranslation={activeReview?.improvedTranslation ?? ""}
                    onImprove={improve}
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    {t("review.emptyAnalysis")}
                  </div>
                )}
              </aside>
            </div>
            <section className="mt-6 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileSearch className="h-4 w-4 text-primary" />
                    {t("review.deepReview")}
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                    {t("review.oldFlowHint")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    !activeReview ||
                    deepReviewBusy ||
                    !readingArticleCardReady
                  }
                  onClick={async () => {
                    if (!activeReview) return;
                    setDeepReviewBusy(true);
                    try {
                      await generateDeepReview(activeReview.id);
                    } finally {
                      setDeepReviewBusy(false);
                    }
                  }}
                  className={primaryBtn}
                >
                  {deepReviewBusy && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t("review.generateDeepReview")}
                </button>
              </div>
              {!readingArticleCardReady && (
                <p className="mt-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                  {t("review.readingArticleCardRequired")}
                </p>
              )}
              {deepReviewError && (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {deepReviewError}
                </p>
              )}
              {activeReview?.deepReview ? (
                <div className="mt-4 border-t border-border pt-4 text-sm">
                  <Markdown>{activeReview.deepReview}</Markdown>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  {t("review.deepReviewEmpty")}
                </p>
              )}
            </section>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function imageImportInstruction(target: "writing" | "translation"): string {
  const shared =
    "Transcribe every legible word exactly as written. Do not grade, correct, improve, answer, or translate anything. Preserve paragraph and line boundaries. Return only the transcription.";
  if (target === "writing") {
    return `This image contains a handwritten CET-6 essay response. ${shared}`;
  }
  if (target === "translation") {
    return `This image contains a handwritten CET-6 Chinese-to-English translation response. ${shared}`;
  }
  return `This image contains a handwritten CET-6 response. ${shared}`;
}

function ReviewAnalysisPanel({
  analysis,
  reviewId,
  improvedWriting,
  improvedTranslation,
  onImprove,
}: {
  analysis: ReturnType<typeof analyzeReview>;
  reviewId: string | null;
  improvedWriting: string;
  improvedTranslation: string;
  onImprove: (
    reviewId: string,
    kind: "writing" | "translation",
  ) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [busyKind, setBusyKind] = useState<"writing" | "translation" | null>(
    null,
  );
  return (
    <>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs text-muted-foreground">{t("review.objectiveScore")}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">
          {analysis.objectiveScore.toFixed(1)}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            / {analysis.objectiveMaxScore.toFixed(1)}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("review.accuracy", {
            correct: analysis.correct,
            answered: analysis.answered,
            percent: (analysis.overallAccuracy * 100).toFixed(0),
          })}
        </p>
      </div>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="mb-2 text-sm font-medium">{t("review.sectionAccuracy")}</p>
        <div className="space-y-2">
          {analysis.sections.map((section) => (
            <div key={section.kind}>
              <div className="flex justify-between text-xs">
                <span>{section.label}</span>
                <span>
                  {section.correct}/{section.answered}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full origin-left rounded-full bg-primary"
                  style={{ transform: `scaleX(${section.accuracy})` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="mb-2 text-sm font-medium">{t("review.wrongQuestions")}</p>
        <div className="max-h-72 space-y-2 overflow-auto">
          {analysis.wrong.map((result) => (
            <div key={result.id} className="rounded bg-destructive/5 p-2 text-xs">
              <p className="font-medium">
                Q{result.questionNumber} · {t("review.yourAnswer", {
                  selected: result.selected,
                  correct: result.correct,
                })}
              </p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {result.content}
              </p>
              <div className="mt-1 text-foreground">
                <Markdown variant="compact">{result.explanation}</Markdown>
              </div>
            </div>
          ))}
          {analysis.wrong.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("review.noWrongQuestions")}
            </p>
          )}
        </div>
      </div>
      {analysis.writingAnswer && analysis.writingTask?.type === "essay" && (
        <div className="rounded-md border border-border bg-background p-3 text-xs">
          <p className="font-medium">
            {t("review.writingCheck", {
              count: analysis.writingWordCount,
            })}
          </p>
          {analysis.writingTask.writingGuidance && (
            <div className="mt-2 max-h-48 overflow-auto text-muted-foreground">
              <Markdown variant="compact">
                {analysis.writingTask.writingGuidance}
              </Markdown>
            </div>
          )}
          {reviewId && (
            <button
              type="button"
              disabled={busyKind !== null}
              onClick={async () => {
                setBusyKind("writing");
                try {
                  await onImprove(reviewId, "writing");
                } finally {
                  setBusyKind(null);
                }
              }}
              className={`${secondaryBtn} mt-2`}
            >
              {busyKind === "writing" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("review.improveWriting")}
            </button>
          )}
          {improvedWriting && (
            <div className="mt-2 border-t border-border pt-2 text-foreground">
              <Markdown variant="compact">{improvedWriting}</Markdown>
            </div>
          )}
        </div>
      )}
      {analysis.translationAnswer &&
        analysis.translationTask?.type === "short-answer" && (
          <div className="rounded-md border border-border bg-background p-3 text-xs">
            <p className="font-medium">
              {t("review.translationCheck", {
                count: analysis.translationChineseCharacters,
              })}
            </p>
            <div className="mt-2 max-h-48 overflow-auto text-muted-foreground">
              <Markdown variant="compact">
                {analysis.translationTask.referenceAnswer}
              </Markdown>
            </div>
            {reviewId && (
              <button
                type="button"
                disabled={busyKind !== null}
                onClick={async () => {
                  setBusyKind("translation");
                  try {
                    await onImprove(reviewId, "translation");
                  } finally {
                    setBusyKind(null);
                  }
                }}
                className={`${secondaryBtn} mt-2`}
              >
                {busyKind === "translation" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("review.improveTranslation")}
              </button>
            )}
            {improvedTranslation && (
              <div className="mt-2 border-t border-border pt-2 text-foreground">
                <Markdown variant="compact">{improvedTranslation}</Markdown>
              </div>
            )}
          </div>
        )}
    </>
  );
}

