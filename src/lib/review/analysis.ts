import type { ExamPaper, Question } from "../types/exam";
import type { ReviewRecord } from "../types/review";
import {
  chineseCount,
  correctLetter,
  wordCount,
} from "../cet/quality/textMetrics";

export interface ReviewQuestionResult {
  id: string;
  questionNumber: number;
  kind: string;
  content: string;
  selected: string | null;
  correct: string;
  isCorrect: boolean;
  explanation: string;
  score: number;
}

export interface ReviewSectionResult {
  kind: string;
  label: string;
  answered: number;
  total: number;
  correct: number;
  score: number;
  maxScore: number;
  accuracy: number;
}

export interface ReviewAnalysis {
  answered: number;
  totalObjective: number;
  correct: number;
  objectiveScore: number;
  objectiveMaxScore: number;
  overallAccuracy: number;
  sections: ReviewSectionResult[];
  wrong: ReviewQuestionResult[];
  writingTask?: Question;
  writingAnswer: string;
  translationTask?: Question;
  translationAnswer: string;
  writingWordCount: number;
  translationChineseCharacters: number;
}

const SECTION_LABELS: Record<string, string> = {
  "cet-listening-a": "听力 A",
  "cet-listening-b": "听力 B",
  "cet-listening-c": "听力 C",
  "cet-reading-a": "选词填空",
  "cet-reading-b": "段落匹配",
  "cet-reading-c": "仔细阅读",
};

export function analyzeReview(
  paper: ExamPaper,
  review: Pick<
    ReviewRecord,
    "answers" | "writingAnswer" | "translationAnswer"
  >,
): ReviewAnalysis {
  const objective = paper.questions.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice" &&
      question.examSection?.questionNumber != null,
  );
  const results = objective.map((question) => {
    const questionNumber = question.examSection?.questionNumber ?? 0;
    const correct = correctLetter(question.correctAnswer);
    const selected =
      normalizeLetter(review.answers[String(questionNumber)]) ?? correct;
    return {
      id: question.id,
      questionNumber,
      kind: question.examSection?.kind ?? "unknown",
      content: question.content,
      selected,
      correct,
      isCorrect: selected === correct,
      explanation: question.explanation ?? "",
      score: question.score,
    } satisfies ReviewQuestionResult;
  });
  const answeredResults = results.filter((result) => result.selected != null);
  const correctResults = results.filter((result) => result.isCorrect);
  const sectionKinds = [...new Set(results.map((result) => result.kind))];
  const sections = sectionKinds.map((kind) => {
    const section = results.filter((result) => result.kind === kind);
    const answered = section.filter((result) => result.selected != null).length;
    const correct = section.filter((result) => result.isCorrect).length;
    return {
      kind,
      label: SECTION_LABELS[kind] ?? kind,
      answered,
      total: section.length,
      correct,
      score: section
        .filter((result) => result.isCorrect)
        .reduce((sum, result) => sum + result.score, 0),
      maxScore: section.reduce((sum, result) => sum + result.score, 0),
      accuracy: answered > 0 ? correct / answered : 0,
    } satisfies ReviewSectionResult;
  });

  return {
    answered: answeredResults.length,
    totalObjective: results.length,
    correct: correctResults.length,
    objectiveScore: correctResults.reduce((sum, result) => sum + result.score, 0),
    objectiveMaxScore: results.reduce((sum, result) => sum + result.score, 0),
    overallAccuracy:
      answeredResults.length > 0
        ? correctResults.length / answeredResults.length
        : 0,
    sections,
    wrong: results.filter((result) => result.selected != null && !result.isCorrect),
    writingTask: paper.questions.find(
      (question) => question.examSection?.kind === "cet-writing",
    ),
    writingAnswer: review.writingAnswer,
    writingWordCount: wordCount(review.writingAnswer),
    translationTask: paper.questions.find(
      (question) => question.examSection?.kind === "cet-translation",
    ),
    translationAnswer: review.translationAnswer,
    translationChineseCharacters: chineseCount(review.translationAnswer),
  };
}

export function parseImportedAnswers(
  raw: string,
): Record<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        answers?: Record<string, unknown>;
      };
      const source =
        parsed.answers && typeof parsed.answers === "object"
          ? parsed.answers
          : parsed;
      const answers: Record<string, string> = {};
      for (const [questionNumber, value] of Object.entries(source)) {
        if (!/^\d+$/.test(questionNumber)) continue;
        const letter = normalizeLetter(String(value));
        if (letter) answers[questionNumber] = letter;
      }
      return Object.keys(answers).length > 0 ? answers : null;
    } catch {
      return null;
    }
  }

  const answers: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{1,2})\s*[.,:，、\t ]\s*([A-Oa-o])\b/);
    if (match) answers[String(Number(match[1]))] = match[2].toUpperCase();
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

function normalizeLetter(value: string | undefined): string | null {
  const match = String(value ?? "").trim().match(/^[（(]?([A-Oa-o])[）)]?$/);
  return match ? match[1].toUpperCase() : null;
}
