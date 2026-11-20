import type { Cet6ContentStage } from "../types/cet";
import {
  ImportedPaperDraftSchema,
  ProvidedAnswerSchema,
  type ImportedPaperDraft,
  type ProvidedAnswer,
} from "../types/import";

const ANSWER_KEY_HEADING_RE =
  /答案速查|参考答案|答案与解析|answer\s+key|answer\s+sheet/i;
const SET_HEADING_RE = /第\s*([一二三123])\s*套/g;
const ANSWER_PAIR_RE =
  /(?:^|[\s,，;；])(\d{1,2})\s*[.．、:：]?\s*([A-O01])(?=$|[\s,，;；])/gi;

export function isAnswerKeyPage(text: string): boolean {
  return (
    ANSWER_KEY_HEADING_RE.test(text) &&
    countAnswerPairs(text) >= 10
  );
}

export function parseProvidedAnswers(
  pages: readonly { pageNumber: number; text: string }[],
): ProvidedAnswer[] {
  const answers = new Map<string, ProvidedAnswer>();
  for (const page of pages) {
    if (!isAnswerKeyPage(page.text)) continue;
    for (const section of splitBySet(page.text)) {
      for (const pair of parseAnswerPairs(section.text)) {
        const stage = stageForQuestionNumber(pair.number);
        const letter = pair.letter;
        if (!stage || !allowedAnswerLetter(stage, letter)) continue;
        const answer = ProvidedAnswerSchema.parse({
          setLabel: section.setLabel,
          stage,
          sourceQuestionNumber: pair.number,
          answerLetter: letter,
        });
        const key = `${answer.setLabel}:${answer.stage}:${answer.sourceQuestionNumber}`;
        if (!answers.has(key)) answers.set(key, answer);
      }
    }
  }
  return [...answers.values()];
}

export function applyProvidedAnswers(
  draft: ImportedPaperDraft,
  providedAnswers: readonly ProvidedAnswer[],
): ImportedPaperDraft {
  const setLabel = normalizeSetLabel(draft.setLabel);
  const answers = new Map(
    providedAnswers
      .filter(
        (answer) =>
          !setLabel || normalizeSetLabel(answer.setLabel) === setLabel,
      )
      .map((answer) => [
        `${answer.stage}:${answer.sourceQuestionNumber}`,
        answer.answerLetter,
      ]),
  );
  if (answers.size === 0) return draft;
  return ImportedPaperDraftSchema.parse({
    ...draft,
    blocks: draft.blocks.map((block) => ({
      ...block,
      questions: block.questions.map((question) => {
        if (question.sourceQuestionNumber == null) return question;
        const letter = answers.get(
          `${block.stage}:${question.sourceQuestionNumber}`,
        );
        return letter
          ? {
              ...question,
              answerLetter: letter,
              answerStatus: "official" as const,
            }
          : question;
      }),
    })),
  });
}

export function answerChoicesForStage(stage: Cet6ContentStage): string[] {
  const count =
    stage === "reading-a" || stage === "reading-b" ? 15 : 4;
  return Array.from({ length: count }, (_, index) =>
    String.fromCharCode(65 + index),
  );
}

function splitBySet(
  text: string,
): Array<{ setLabel: string; text: string }> {
  const matches = [...text.matchAll(SET_HEADING_RE)];
  if (matches.length === 0) {
    return [{ setLabel: "真题", text }];
  }
  return matches.map((match, index) => ({
    setLabel: normalizeSetLabel(`第${match[1]}套`),
    text: text.slice(
      match.index ?? 0,
      matches[index + 1]?.index ?? text.length,
    ),
  }));
}

function parseAnswerPairs(text: string): Array<{
  number: number;
  letter: string;
}> {
  const pairs: Array<{ number: number; letter: string }> = [];
  for (const match of text.matchAll(
    new RegExp(ANSWER_PAIR_RE.source, ANSWER_PAIR_RE.flags),
  )) {
    const number = Number(match[1]);
    const letter = normalizeAnswerLetter(match[2]);
    if (number < 1 || number > 55) continue;
    pairs.push({ number, letter });
  }
  return pairs;
}

function normalizeAnswerLetter(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized === "0") return "O";
  if (normalized === "1") return "I";
  return normalized;
}

function allowedAnswerLetter(
  stage: Cet6ContentStage,
  letter: string,
): boolean {
  const last =
    stage === "reading-a" || stage === "reading-b" ? "O" : "D";
  return letter >= "A" && letter <= last;
}

function countAnswerPairs(text: string): number {
  return [
    ...text.matchAll(new RegExp(ANSWER_PAIR_RE.source, ANSWER_PAIR_RE.flags)),
  ].length;
}

function stageForQuestionNumber(
  number: number,
): Cet6ContentStage | null {
  if (number >= 1 && number <= 8) return "listening-a";
  if (number >= 9 && number <= 15) return "listening-b";
  if (number >= 16 && number <= 25) return "listening-c";
  if (number >= 26 && number <= 35) return "reading-a";
  if (number >= 36 && number <= 45) return "reading-b";
  if (number >= 46 && number <= 55) return "reading-c";
  return null;
}

function normalizeSetLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/第1套/, "第一套")
    .replace(/第2套/, "第二套")
    .replace(/第3套/, "第三套");
}
