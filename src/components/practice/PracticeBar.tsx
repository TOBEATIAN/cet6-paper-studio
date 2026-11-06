import {
  CheckCheck,
  ClipboardPenLine,
  RotateCcw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { correctLetter, wordCount, chineseCount } from "../../lib/cet/quality/textMetrics";
import type { Question } from "../../lib/types/exam";
import { usePaperStore } from "../../stores/paperStore";
import { usePracticeStore } from "../../stores/practiceStore";
import { primaryBtn, secondaryBtn, iconBtn } from "../../lib/ui/styles";

export function PracticeBar({ onOpenReview }: { onOpenReview: () => void }) {
  const { t } = useTranslation();
  const paper = usePaperStore((state) => state.paper);
  const practiceMode = usePracticeStore((state) => state.practiceMode);
  const answers = usePracticeStore((state) => state.answers);
  const writingAnswer = usePracticeStore((state) => state.writingAnswer);
  const translationAnswer = usePracticeStore(
    (state) => state.translationAnswer,
  );
  const notes = usePracticeStore((state) => state.notes);
  const submitted = usePracticeStore((state) => state.submitted);
  const setPracticeMode = usePracticeStore((state) => state.setPracticeMode);
  const submit = usePracticeStore((state) => state.submit);
  const clearAnswers = usePracticeStore((state) => state.clearAnswers);

  if (!practiceMode) return null;

  const objective = paper.questions.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice" &&
      question.examSection?.questionNumber != null,
  );
  const answered = objective.filter((question) => answers[question.id]).length;
  const correct = objective.filter(
    (question) =>
      answers[question.id] === correctLetter(question.correctAnswer),
  );
  const objectiveScore = correct.reduce(
    (sum, question) => sum + question.score,
    0,
  );
  const objectiveMaxScore = objective.reduce(
    (sum, question) => sum + question.score,
    0,
  );

  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <ClipboardPenLine className="h-4 w-4 text-primary" />
        {t("practice.title")}
      </div>
      <span className="text-xs text-muted-foreground">
        {t("practice.objectiveProgress", {
          answered,
          total: objective.length,
        })}
      </span>
      <span className="text-xs text-muted-foreground">
        {t("practice.writingProgress", {
          count: wordCount(writingAnswer),
        })}
        {" · "}
        {t("practice.translationProgress", {
          count: chineseCount(translationAnswer),
        })}
      </span>
      <span className="text-xs text-muted-foreground">
        {t("practice.noteProgress", {
          count: Object.values(notes).filter((note) => note.trim()).length,
        })}
      </span>
      <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{
            width: `${objective.length ? (answered / objective.length) * 100 : 0}%`,
          }}
        />
      </div>
      {submitted ? (
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t("practice.score", {
            score: objectiveScore.toFixed(1),
            total: objectiveMaxScore.toFixed(1),
            correct: correct.length,
            answered,
          })}
        </span>
      ) : null}
      <button
        type="button"
        onClick={submitted ? onOpenReview : submit}
        className={primaryBtn}
      >
        <CheckCheck className="h-4 w-4" />
        {t(submitted ? "practice.review" : "practice.submit")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(t("practice.clearConfirm"))) clearAnswers();
        }}
        className={secondaryBtn}
      >
        <RotateCcw className="h-4 w-4" />
        {t("practice.clear")}
      </button>
      <button
        type="button"
        onClick={() => setPracticeMode(false)}
        aria-label={t("practice.exit")}
        title={t("practice.exit")}
        className={iconBtn}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
