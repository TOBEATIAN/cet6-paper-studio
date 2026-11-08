import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ImageUp,
  Loader2,
  Sparkles,
  Pencil,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Question } from "../../lib/types/exam";
import { usePaperStore } from "../../stores/paperStore";
import { useAssistantStore } from "../../stores/assistantStore";
import { usePracticeStore } from "../../stores/practiceStore";
import { useConfigStore } from "../../stores/configStore";
import * as storage from "../../lib/storage/tauri";
import {
  studentAnswerSpaceLines,
  studentBlankUnderlineLength,
} from "../../lib/exam/pagination";
import {
  choiceDisplay,
  stripLeadingQuestionNumber,
} from "../../lib/exam/choiceDisplay";
import { Markdown } from "./Markdown";
import { PracticeNoteControl } from "../practice/PracticeNoteControl";
import { applyTranslationGlossary } from "../../lib/exam/translationGlossary";
import { useTwoColumnReadingOptions } from "../../lib/exam/cetReadingLayout";

interface QuestionBlockProps {
  question: Question;
  index: number;
  studentView: boolean;
  analysisView?: boolean;
  onEdit: (id: string) => void;
}

/**
 * A single question rendered on the sheet. Static = minimal sheet style; on
 * hover it lifts into a card revealing edit/reorder/delete actions. Answers and
 * explanations show only in teacher view.
 */
export function QuestionBlock({
  question,
  index,
  studentView,
  analysisView = false,
  onEdit,
}: QuestionBlockProps) {
  const { t } = useTranslation();
  const { reorder, deleteQuestion } = usePaperStore();
  const focusQuestion = useAssistantStore((s) => s.focusQuestion);
  const practiceMode = usePracticeStore((s) => s.practiceMode);
  const interactionMode = usePracticeStore((s) => s.interactionMode);
  const practiceAnswers = usePracticeStore((s) => s.answers);
  const submitted = usePracticeStore((s) => s.submitted);
  const setAnswer = usePracticeStore((s) => s.setAnswer);
  const [answerOpen, setAnswerOpen] = useState(false);

  const choice = isChoiceQuestion(question) ? choiceDisplay(question) : null;
  const correctIndexes =
    question.type === "single-choice"
      ? [question.correctAnswer]
      : question.type === "multiple-choice"
        ? question.correctAnswers
        : [];
  const content =
    choice?.stem ?? stripLeadingQuestionNumber(question.content);
  const isCetListening =
    question.examSection?.kind?.startsWith("cet-listening-") ?? false;
  const showContent = !isCetListening || analysisView;
  const displayedContent =
    !showContent
      ? ""
      : question.examSection?.kind === "cet-translation"
      ? applyTranslationGlossary(content, question.examSection.glossary)
      : content;
  const isCet = question.examSection?.kind?.startsWith("cet-") ?? false;
  const displayNumber = isCet
    ? question.examSection?.questionNumber
    : index + 1;
  const readingOptionsTwoColumns =
    question.examSection?.kind === "cet-reading-c" &&
    choice != null &&
    useTwoColumnReadingOptions(choice.options);

  return (
    <li
      id={`question-${question.id}`}
      data-question-id={question.id}
      className="question-block scroll-mt-8 group relative border border-transparent px-1 py-1 transition-colors hover:border-border hover:bg-accent/40"
    >
      {!studentView && !analysisView && !practiceMode && (
        <div className="no-print absolute right-2 top-2 hidden gap-1 group-hover:flex">
          <ActionButton
            label={t("paper.aiModify")}
            onClick={() => focusQuestion(question)}
          >
            <Sparkles className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label={t("paper.edit")}
            onClick={() => onEdit(question.id)}
          >
            <Pencil className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label={t("paper.moveUp")}
            onClick={() => reorder(question.id, "up")}
          >
            <ArrowUp className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label={t("paper.moveDown")}
            onClick={() => reorder(question.id, "down")}
          >
            <ArrowDown className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label={t("paper.delete")}
            onClick={() => deleteQuestion(question.id)}
          >
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      )}

      <div className="flex gap-2">
        {displayNumber != null && (
          <span className="select-none font-medium text-muted-foreground">
            {displayNumber}.
          </span>
        )}
        <div className="flow-root min-w-0 flex-1">
          {practiceMode && (
            <span
              data-practice-note-placement="inline"
              className="no-print float-right ml-2 mb-1"
            >
              <PracticeNoteControl
                compact
                noteKey={`question:${question.id}`}
                label={t("practice.questionLabel", {
                  number: displayNumber ?? index + 1,
                })}
              />
            </span>
          )}
          {showContent && (
            <>
              <div
                className="min-w-0"
                data-markdown-source="content"
                data-markdown-source-key={`content:${question.id}`}
                data-markdown-text={displayedContent}
              >
                {studentView && question.type === "fill-in-blank" ? (
                  <FillBlankContent question={question} />
                ) : (
                  <Markdown>{displayedContent}</Markdown>
                )}
              </div>
              <div aria-hidden="true" className="clear-both" />
            </>
          )}

          {choice &&
            choice.options.length > 0 &&
            (!question.examSection?.hideOptions ||
              (practiceMode &&
                question.examSection?.kind !== "cet-reading-a")) && (
            <ol
              role={practiceMode ? "radiogroup" : undefined}
              aria-label={practiceMode ? t("practice.optionsFor", {
                number: displayNumber ?? index + 1,
              }) : undefined}
              className={`mt-1.5 text-sm text-foreground ${
                practiceMode && question.examSection?.hideOptions
                  ? "flex flex-wrap gap-1.5"
                  : readingOptionsTwoColumns
                  ? "grid-flow-col grid-cols-2 grid-rows-2 gap-x-6"
                  : "grid gap-y-1 pl-6"
              }`}
            >
              {choice.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const selected = practiceAnswers[question.id] === letter;
                const correct = submitted && correctIndexes.includes(i);
                const wrong = submitted && selected && !correct;
                if (!practiceMode) {
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0">{letter}.</span>
                      <div
                        className="min-w-0 flex-1"
                        data-markdown-source="option"
                        data-markdown-source-key={`option:${question.id}:${i}`}
                        data-markdown-question-id={question.id}
                        data-markdown-option-index={i}
                        data-markdown-text={opt}
                      >
                        <Markdown variant="compact">{opt}</Markdown>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={i}>
                    <div
                      onClick={() => {
                        if (interactionMode === "answer") {
                          setAnswer(question.id, letter);
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                        correct
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : wrong
                            ? "border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                            : selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${letter}. ${opt}`}
                        title={
                          question.examSection?.hideOptions ? opt : undefined
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          setAnswer(question.id, letter);
                        }}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-[10px] font-semibold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {letter}
                      </button>
                      {!question.examSection?.hideOptions && (
                        <div
                          className="min-w-0 flex-1 select-text"
                          data-markdown-source="option"
                          data-markdown-source-key={`option:${question.id}:${i}`}
                          data-markdown-question-id={question.id}
                          data-markdown-option-index={i}
                          data-markdown-text={opt}
                        >
                          <Markdown variant="compact">{opt}</Markdown>
                        </div>
                      )}
                      {!question.examSection?.hideOptions && (
                        <PracticeNoteControl
                          compact
                          noteKey={`option:${question.id}:${i}`}
                          label={`${letter}. ${opt}`}
                        />
                      )}
                      {correct && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0" />}
                      {wrong && <span className="ml-auto text-xs font-semibold">×</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {practiceMode && (
            <PracticeTextAnswer question={question} submitted={submitted} />
          )}

          {!studentView && analysisView && (
            <AnswerBlock question={question} />
          )}
          {!studentView && !analysisView && (
            <div className="mt-2">
              {(!practiceMode || submitted) && (
                <button
                  type="button"
                  onClick={() => setAnswerOpen((value) => !value)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {answerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {t(answerOpen ? "paper.hideAnswer" : "paper.showAnswer")}
                </button>
              )}
              {answerOpen && <AnswerBlock question={question} />}
            </div>
          )}
          {studentView && <StudentAnswerSpace question={question} />}
        </div>
      </div>
    </li>
  );
}

function PracticeTextAnswer({
  question,
  submitted,
}: {
  question: Question;
  submitted: boolean;
}) {
  const { t } = useTranslation();
  const dataDir = useConfigStore((s) => s.dataDir);
  const activeConfig = useConfigStore((s) => s.activeConfig());
  const writingAnswer = usePracticeStore((s) => s.writingAnswer);
  const translationAnswer = usePracticeStore((s) => s.translationAnswer);
  const setWritingAnswer = usePracticeStore((s) => s.setWritingAnswer);
  const setTranslationAnswer = usePracticeStore(
    (s) => s.setTranslationAnswer,
  );
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const target =
    question.type === "essay"
      ? "writing"
      : question.type === "short-answer"
        ? "translation"
        : null;
  if (!target) return null;
  const importTarget = target;

  const value = target === "writing" ? writingAnswer : translationAnswer;
  const setValue =
    target === "writing" ? setWritingAnswer : setTranslationAnswer;

  async function importAnswerImage() {
    setImportMessage(null);
    if (!activeConfig) {
      setImportMessage({
        kind: "error",
        text: t("practice.imageNeedsModel"),
      });
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        defaultPath: dataDir ?? undefined,
        filters: [
          {
            name: t("practice.answerImages"),
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
      const apiKey = await storage.getApiKey(activeConfig.id);
      if (!apiKey) {
        setImportMessage({
          kind: "error",
          text: t("practice.imageNeedsKey"),
        });
        return;
      }
      const text = await storage.extractImagesWithAi({
        baseUrl: activeConfig.baseUrl,
        apiKey,
        model: activeConfig.model,
        imagePaths: paths,
        instruction: answerImageInstruction(importTarget),
      });
      setValue(text.trim());
      setImportMessage({
        kind: "success",
        text: t("practice.imageRecognized"),
      });
    } catch {
      setImportMessage({
        kind: "error",
        text: t("practice.imageRecognizeFailed"),
      });
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="no-print mt-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {target === "writing"
            ? t("practice.writingInput", { count: value.length })
            : t("practice.translationInput", {
                count: Array.from(value).length,
              })}
        </span>
        <button
          type="button"
          disabled={importBusy}
          onClick={() => void importAnswerImage()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60"
        >
          {importBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageUp className="h-3.5 w-3.5" />
          )}
          {t(importBusy ? "practice.recognizingImage" : "practice.importImage")}
        </button>
      </div>
      <textarea
        rows={target === "writing" ? 9 : 7}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder={t(
          target === "writing"
            ? "practice.writingPlaceholder"
            : "practice.translationPlaceholder",
        )}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {importMessage && (
        <p
          role={importMessage.kind === "error" ? "alert" : "status"}
          className={`mt-1 text-xs ${
            importMessage.kind === "success"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-destructive"
          }`}
        >
          {importMessage.text}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("practice.imagePrivacy")}
      </p>
      {submitted && target === "writing" && (
        <span className="mt-1 block text-xs text-muted-foreground">
          {t("practice.writingSubmitted")}
        </span>
      )}
    </div>
  );
}

function answerImageInstruction(target: "writing" | "translation"): string {
  const shared =
    "Transcribe every legible word exactly as written. Do not grade, correct, improve, answer, or translate anything. Preserve paragraph and line boundaries. Return only the transcription.";
  return target === "writing"
    ? `This image contains a handwritten CET-6 essay response. ${shared}`
    : `This image contains a handwritten CET-6 Chinese-to-English translation response. ${shared}`;
}

function FillBlankContent({ question }: { question: Question }) {
  if (question.type !== "fill-in-blank") {
    return <Markdown>{question.content}</Markdown>;
  }
  const blankLength = studentBlankUnderlineLength(question);
  const replacement = "_".repeat(blankLength);
  const content = /_{3,}/.test(question.content)
    ? question.content.replace(/_{3,}/g, replacement)
    : `${stripLeadingQuestionNumber(question.content)} ${Array.from(
        { length: Array.isArray(question.blanks) ? question.blanks.length : 1 },
        () => replacement,
      ).join(" ")}`;
  return <Markdown>{content}</Markdown>;
}

function StudentAnswerSpace({ question }: { question: Question }) {
  const lines = studentAnswerSpaceLines(question);
  if (lines === 0) return null;
  return (
    <div
      className="answer-space mt-3"
      style={{ height: `${lines * 1.7}em` }}
      aria-hidden="true"
    />
  );
}

function isChoiceQuestion(
  question: Question,
): question is Extract<Question, { type: "single-choice" | "multiple-choice" }> {
  return question.type === "single-choice" || question.type === "multiple-choice";
}

function AnswerBlock({ question }: { question: Question }) {
  const { t } = useTranslation();
  const explanation =
    "explanation" in question ? question.explanation : undefined;

  const sections = getAnswerSections(question, {
    answer: t("paper.answer"),
    solution: t("paper.solution"),
    scoringPoints: t("paper.scoringPoints"),
    referenceEssay: t("paper.referenceEssay"),
    writingGuidance: t("paper.writingGuidance"),
    scoringCriteria: t("paper.scoringCriteria"),
    true: t("paper.true"),
    false: t("paper.false"),
  });

  if (!explanation && sections.length === 0) return null;

  return (
    <div className="answer-block mt-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
      {sections.map((section) => (
        <AnswerSection key={section.label} {...section} />
      ))}
      {explanation && question.type !== "essay" && (
        <AnswerSection
          label={t("paper.explanation")}
          content={explanation}
        />
      )}
    </div>
  );
}

interface AnswerSectionProps {
  label: string;
  content?: string;
}

function AnswerSection({ label, content }: AnswerSectionProps) {
  const safeContent = content ?? "";
  if (!safeContent.trim()) return null;

  return (
    <div className="mt-1 first:mt-0">
      <span className="font-medium text-primary">【{label}】</span>
      <div className="mt-0.5">
        <Markdown variant="compact">{safeContent}</Markdown>
      </div>
    </div>
  );
}

function getAnswerSections(
  question: Question,
  labels: {
    answer: string;
    solution: string;
    scoringPoints: string;
    referenceEssay: string;
    writingGuidance: string;
    scoringCriteria: string;
    true: string;
    false: string;
  },
): AnswerSectionProps[] {
  switch (question.type) {
    case "single-choice":
      return [
        {
          label: labels.answer,
          content: String.fromCharCode(65 + question.correctAnswer),
        },
      ];
    case "multiple-choice":
      return [
        {
          label: labels.answer,
          content: (Array.isArray(question.correctAnswers)
            ? question.correctAnswers
            : []
          )
            .map((i) => String.fromCharCode(65 + i))
            .join(", "),
        },
      ];
    case "true-false":
      return [
        {
          label: labels.answer,
          content: question.correctAnswer ? labels.true : labels.false,
        },
      ];
    case "fill-in-blank":
      return [
        {
          label: labels.answer,
          content: (Array.isArray(question.blanks) ? question.blanks : []).join(
            " / ",
          ),
        },
      ];
    case "short-answer": {
      const sections = [
        { label: labels.answer, content: question.referenceAnswer },
      ];
      if (question.scoringPoints?.length) {
        sections.push({
          label: labels.scoringPoints,
          content: question.scoringPoints.map((point) => `- ${point}`).join("\n"),
        });
      }
      return sections;
    }
    case "essay":
      return [
        ...(question.referenceAnswer
          ? [
              {
                label: labels.referenceEssay,
                content: question.referenceAnswer,
              },
            ]
          : []),
        ...(question.writingGuidance || question.explanation
          ? [{
              label: labels.writingGuidance,
              content: question.writingGuidance ?? question.explanation,
            }]
          : []),
        {
          label: labels.scoringCriteria,
          content: question.scoringCriteria,
        },
      ];
    case "calculation":
      return [
        { label: labels.answer, content: question.answer },
        { label: labels.solution, content: question.solution },
      ];
  }
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {children}
    </button>
  );
}
