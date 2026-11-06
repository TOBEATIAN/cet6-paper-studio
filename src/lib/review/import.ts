import { parseImportedAnswers } from "./analysis";

export type ReviewImportTarget =
  | "auto"
  | "answers"
  | "writing"
  | "translation";

export interface ParsedReviewImport {
  answers: Record<string, string>;
  writingAnswer: string;
  translationAnswer: string;
}

const WRITING_HEADING =
  /^(?:\s*part\s*(?:i|1)\s*)?(?:writing|作文|写作)(?:\s*(?:answer|作答|答案))?(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*$/i;
const TRANSLATION_HEADING =
  /^(?:\s*part\s*(?:iv|4)\s*)?(?:translation|翻译)(?:\s*(?:answer|作答|答案))?(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*$/i;

export function parseReviewImport(
  raw: string,
  target: ReviewImportTarget = "auto",
): ParsedReviewImport | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const structured = parseJsonReview(trimmed);
  if (structured) return structured;

  if (target === "answers") {
    const answers = parseImportedAnswers(trimmed) ?? {};
    return Object.keys(answers).length > 0
      ? { answers, writingAnswer: "", translationAnswer: "" }
      : null;
  }

  if (target === "writing") {
    const sections = splitNamedSections(trimmed);
    return {
      answers: {},
      writingAnswer: sections.writingAnswer || trimmed,
      translationAnswer: "",
    };
  }

  if (target === "translation") {
    const sections = splitNamedSections(trimmed);
    return {
      answers: {},
      writingAnswer: "",
      translationAnswer: sections.translationAnswer || trimmed,
    };
  }

  const answers = parseImportedAnswers(trimmed) ?? {};
  const sections = splitNamedSections(trimmed);
  if (
    Object.keys(answers).length === 0 &&
    !sections.writingAnswer &&
    !sections.translationAnswer
  ) {
    return null;
  }
  return {
    answers,
    writingAnswer: sections.writingAnswer,
    translationAnswer: sections.translationAnswer,
  };
}

function parseJsonReview(raw: string): ParsedReviewImport | null {
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const answerSource =
      parsed.answers && typeof parsed.answers === "object"
        ? (parsed.answers as Record<string, unknown>)
        : parsed;
    const answers: Record<string, string> = {};
    for (const [questionNumber, value] of Object.entries(answerSource)) {
      if (!/^\d+$/.test(questionNumber)) continue;
      const letter = String(value).trim().toUpperCase();
      if (/^[A-O]$/.test(letter)) answers[questionNumber] = letter;
    }
    const writingAnswer =
      typeof parsed.writingAnswer === "string" ? parsed.writingAnswer.trim() : "";
    const translationAnswer =
      typeof parsed.translationAnswer === "string"
        ? parsed.translationAnswer.trim()
        : "";
    return Object.keys(answers).length > 0 ||
      writingAnswer ||
      translationAnswer
      ? { answers, writingAnswer, translationAnswer }
      : null;
  } catch {
    return null;
  }
}

function splitNamedSections(raw: string): {
  writingAnswer: string;
  translationAnswer: string;
} {
  const writingLines: string[] = [];
  const translationLines: string[] = [];
  let current: "writing" | "translation" | null = null;

  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (WRITING_HEADING.test(line)) {
      current = "writing";
      continue;
    }
    if (TRANSLATION_HEADING.test(line)) {
      current = "translation";
      continue;
    }
    if (current === "writing") writingLines.push(line);
    if (current === "translation") translationLines.push(line);
  }

  return {
    writingAnswer: writingLines.join("\n").trim(),
    translationAnswer: translationLines.join("\n").trim(),
  };
}
