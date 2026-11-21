import type { Question } from "../types/exam";

export type AnswerSectionKey =
  | "answer"
  | "solution"
  | "scoringPoints"
  | "referenceEssay"
  | "writingGuidance"
  | "scoringCriteria"
  | "explanation";

export interface QuestionAnswerSection {
  key: AnswerSectionKey;
  content: string;
}

const ANSWER_CHUNK_LINES = 14;
const ESTIMATED_LINE_CHARACTERS = 34;

export function answerSectionsForQuestion(
  question: Question,
): QuestionAnswerSection[] {
  const sections: QuestionAnswerSection[] = [];
  switch (question.type) {
    case "single-choice":
      sections.push({
        key: "answer",
        content: String.fromCharCode(65 + question.correctAnswer),
      });
      break;
    case "multiple-choice":
      sections.push({
        key: "answer",
        content: (Array.isArray(question.correctAnswers)
          ? question.correctAnswers
          : []
        )
          .map((index) => String.fromCharCode(65 + index))
          .join(", "),
      });
      break;
    case "true-false":
      sections.push({
        key: "answer",
        content: question.correctAnswer ? "TRUE" : "FALSE",
      });
      break;
    case "fill-in-blank":
      sections.push({
        key: "answer",
        content: (Array.isArray(question.blanks) ? question.blanks : []).join(
          " / ",
        ),
      });
      break;
    case "short-answer":
      sections.push({
        key: "answer",
        content: question.referenceAnswer,
      });
      if (question.scoringPoints?.length) {
        sections.push({
          key: "scoringPoints",
          content: question.scoringPoints.map((point) => `- ${point}`).join("\n"),
        });
      }
      break;
    case "essay":
      if (question.referenceAnswer?.trim()) {
        sections.push({
          key: "referenceEssay",
          content: question.referenceAnswer,
        });
      }
      if (question.writingGuidance || question.explanation) {
        sections.push({
          key: "writingGuidance",
          content: question.writingGuidance ?? question.explanation ?? "",
        });
      }
      sections.push({
        key: "scoringCriteria",
        content: question.scoringCriteria,
      });
      break;
    case "calculation":
      sections.push({ key: "answer", content: question.answer });
      sections.push({ key: "solution", content: question.solution });
      break;
  }

  if (question.type !== "essay" && question.explanation?.trim()) {
    sections.push({
      key: "explanation",
      content: question.explanation,
    });
  }
  return sections.filter((section) => section.content.trim().length > 0);
}

export function splitAnswerSectionContent(
  content: string,
  maxLines = ANSWER_CHUNK_LINES,
): string[] {
  if (estimatedTextLines(content) <= maxLines) return [content.trim()];
  const units = splitTextUnits(content);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLines = 0;

  const flush = () => {
    const text = current.join("").trim();
    if (text) chunks.push(text);
    current = [];
    currentLines = 0;
  };

  for (const unit of units) {
    const unitLines = estimatedTextLines(unit);
    if (unitLines > maxLines) {
      flush();
      chunks.push(...hardSplitText(unit, maxLines));
      continue;
    }
    if (currentLines > 0 && currentLines + unitLines > maxLines) flush();
    current.push(unit);
    currentLines += unitLines;
  }
  flush();
  return chunks;
}

export function answerSectionTranslationKey(key: AnswerSectionKey): string {
  return `paper.${key}`;
}

function splitTextUnits(content: string): string[] {
  const paragraphs = content
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[。！？；.!?;])/u);
    for (const sentence of sentences) {
      if (sentence.trim()) units.push(sentence);
    }
    units.push("\n\n");
  }
  return units;
}

function hardSplitText(content: string, maxLines: number): string[] {
  const maxCharacters = Math.max(
    ESTIMATED_LINE_CHARACTERS,
    maxLines * ESTIMATED_LINE_CHARACTERS,
  );
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += maxCharacters) {
    chunks.push(content.slice(index, index + maxCharacters).trim());
  }
  return chunks.filter(Boolean);
}

function estimatedTextLines(text: string): number {
  return text.split(/\r?\n/).reduce((sum, line) => {
    const trimmed = line.trim();
    if (!trimmed) return sum + 1;
    return sum + Math.max(
      1,
      Math.ceil(trimmed.length / ESTIMATED_LINE_CHARACTERS),
    );
  }, 0);
}
