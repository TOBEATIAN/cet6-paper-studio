import { z } from "zod";
import { extractJson } from "../api/extractJson";
import type { ApiMessage } from "../types/library";
import type { Question, ReadingCRiskReview } from "../types/exam";
import {
  Cet6DistractorErrorTypeSchema,
  ReadingCRiskReviewSchema,
} from "../types/exam";
import { contentWords, correctLetter, supportSentences } from "./quality/textMetrics";

export type ReadingCRiskType = "same-sentence" | "dual-support";

export interface ReadingCRisk {
  questionId: string;
  questionNumber: number;
  stem: string;
  letter: string;
  correctLetter: string;
  types: ReadingCRiskType[];
  option: string;
  correctOption: string;
  passage: string;
  supportSentence: string;
  correctSupportSentence: string;
  distractorOverlap: number;
  correctOverlap: number;
}

export interface ReadingCRiskDecision {
  questionNumber: number;
  letter: string;
  decision: "keep" | "rewrite";
  errorType?: string;
  passageEvidence?: string;
  optionError?: string;
  distinguishingReason?: string;
}

const ReadingCRiskDecisionSchema = z.object({
  questionNumber: z.number().int().positive(),
  letter: z.enum(["A", "B", "C", "D"]),
  decision: z.enum(["keep", "rewrite"]),
  errorType: Cet6DistractorErrorTypeSchema.optional(),
  passageEvidence: z.string().optional(),
  optionError: z.string().optional(),
  distinguishingReason: z.string().optional(),
});

const ReadingCRiskResponseSchema = z.object({
  reviews: z.array(ReadingCRiskDecisionSchema).min(1),
});

interface SupportMatch {
  sentenceIndex: number;
  ratio: number;
  sentence: string;
}

export function collectReadingCRisks(
  questions: readonly Question[],
): ReadingCRisk[] {
  const readingC = questions.filter(
    (question) => question.examSection?.kind === "cet-reading-c",
  );
  const passages = new Map<string, string>();
  for (const question of readingC) {
    const groupId = question.examSection?.groupId;
    const passage = question.examSection?.passage;
    if (groupId && passage) passages.set(groupId, passage);
  }

  const risks: ReadingCRisk[] = [];
  for (const question of readingC) {
    if (question.type !== "single-choice") continue;
    const passage = passages.get(question.examSection?.groupId ?? "");
    if (!passage) continue;
    const supportSentenceList = supportSentences(passage);
    const sentenceSets = supportSentenceList.map(contentWords);
    const correct = scoreSupport(
      question.options[question.correctAnswer] ?? "",
      sentenceSets,
      supportSentenceList,
    );
    const distractors = question.options
      .map((option, index) => ({
        index,
        option,
        ...scoreSupport(option, sentenceSets, supportSentenceList),
      }))
      .filter((entry) => entry.index !== question.correctAnswer);
    const strongest = distractors.reduce(
      (best, entry) => (entry.ratio > best.ratio ? entry : best),
      { index: -1, option: "", sentenceIndex: -1, ratio: 0, sentence: "" },
    );

    for (const distractor of distractors) {
      const sameSentence =
        distractor.sentenceIndex === correct.sentenceIndex &&
        distractor.ratio >= 0.6;
      const dualSupport =
        distractor.index === strongest.index &&
        strongest.ratio >= correct.ratio - 0.15 &&
        strongest.ratio >= 0.5;
      if (!sameSentence && !dualSupport) continue;
      risks.push({
        questionId: question.id,
        questionNumber: question.examSection?.questionNumber ?? 0,
        stem: question.content,
        letter: correctLetter(distractor.index),
        correctLetter: correctLetter(question.correctAnswer),
        types: [
          ...(sameSentence ? (["same-sentence"] as const) : []),
          ...(dualSupport ? (["dual-support"] as const) : []),
        ],
        option: distractor.option,
        correctOption: question.options[question.correctAnswer] ?? "",
        passage,
        supportSentence: distractor.sentence,
        correctSupportSentence: correct.sentence,
        distractorOverlap: distractor.ratio,
        correctOverlap: correct.ratio,
      });
    }
  }
  return risks;
}

export function groupReadingCRisksForReview(
  risks: readonly ReadingCRisk[],
  size = 2,
): ReadingCRisk[][] {
  const byPassage = new Map<string, ReadingCRisk[]>();
  for (const risk of risks) {
    byPassage.set(risk.passage, [...(byPassage.get(risk.passage) ?? []), risk]);
  }
  return [...byPassage.values()].flatMap((items) => {
    const groups: ReadingCRisk[][] = [];
    for (let index = 0; index < items.length; index += size) {
      groups.push(items.slice(index, index + size));
    }
    return groups;
  });
}

export function buildReadingCRiskReviewPrompt(
  risks: readonly ReadingCRisk[],
): ApiMessage[] {
  const passages: { id: string; text: string }[] = [];
  const passageIds = new Map<string, string>();
  for (const risk of risks) {
    if (passageIds.has(risk.passage)) continue;
    const id = `P${passageIds.size + 1}`;
    passageIds.set(risk.passage, id);
    passages.push({ id, text: risk.passage });
  }
  return [
    {
      role: "system",
      content: `You are a strict CET-6 reading-item editor performing the final Project_04 strong-distractor review.
Work only from the supplied passage. Never invent evidence.
Return exactly one JSON object and no prose outside it.`,
    },
    {
      role: "user",
      content: `Review these Reading Section C risk items against their passages.

Passages:
${JSON.stringify(passages, null, 2)}

Risk items:
${JSON.stringify(
  risks.map((risk) => toPromptRisk(risk, passageIds.get(risk.passage) ?? "")),
  null,
  2,
)}

For every item decide:
- "keep" only when the distractor has one decisive factual error and you can quote a verbatim passage phrase that proves it.
- "rewrite" when both options can reasonably answer the stem, when the only objection is "less precise", or when no exact passage evidence proves the error.

For "keep", errorType must be one of:
张冠李戴, 程度偏移, 程度/范围偏移, 无中生有, 答非所问, 因果倒置, 与原文相悖, 半对半错, 偷换范围.
passageEvidence must be copied verbatim from the passage, not from an explanation.
optionError must name the exact wrong wording or relation in the distractor.
distinguishingReason must state why that error prevents the option from answering this exact stem.
For "rewrite", return the same identity fields and decision only.

Return:
{"reviews":[{"questionNumber":46,"letter":"B","decision":"keep","errorType":"程度偏移","passageEvidence":"exact words from passage","optionError":"the option turns X into Y","distinguishingReason":"The stem asks X; the option changes Y, so it does not answer X."}]}`,
    },
  ];
}

export function parseReadingCRiskReviewResponse(
  reply: string,
):
  | { ok: true; reviews: ReadingCRiskDecision[] }
  | { ok: false; error: string; raw: string } {
  const { json } = extractJson(reply);
  if (!json) return { ok: false, error: "No JSON block found.", raw: reply };
  try {
    const parsed = ReadingCRiskResponseSchema.safeParse(JSON.parse(json));
    return parsed.success
      ? { ok: true, reviews: parsed.data.reviews }
      : {
          ok: false,
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n"),
          raw: reply,
        };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      raw: reply,
    };
  }
}

export function applyReadingCRiskDecisions(
  questions: readonly Question[],
  risks: readonly ReadingCRisk[],
  decisions: readonly ReadingCRiskDecision[],
): {
  questions: Question[];
  unresolved: ReadingCRisk[];
  invalidReviews: string[];
} {
  const decisionMap = new Map(
    decisions.map((decision) => [
      `${decision.questionNumber}-${decision.letter}`,
      decision,
    ]),
  );
  const accepted = new Map<string, ReadingCRiskReview[]>();
  const rejected = new Set<string>();
  const unresolved: ReadingCRisk[] = [];
  const invalidReviews: string[] = [];

  for (const risk of risks) {
    const key = `${risk.questionNumber}-${risk.letter}`;
    const decision = decisionMap.get(key);
    if (!decision || decision.decision === "rewrite") {
      if (decision?.decision === "rewrite") rejected.add(key);
      unresolved.push(risk);
      continue;
    }
    const review = ReadingCRiskReviewSchema.safeParse({
      types: risk.types,
      option: risk.option,
      correctOption: risk.correctOption,
      errorType: decision.errorType,
      passageEvidence: decision.passageEvidence,
      optionError: decision.optionError,
      distinguishingReason: decision.distinguishingReason,
    });
    const reviewIssues = review.success
      ? readingCRiskReviewIssues(risk, review.data)
      : review.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
    if (reviewIssues.length > 0 || !review.success) {
      rejected.add(key);
      unresolved.push(risk);
      invalidReviews.push(`Q${key}: ${reviewIssues.join("; ")}`);
      continue;
    }
    const current = accepted.get(risk.questionId) ?? [];
    current.push(review.data);
    accepted.set(risk.questionId, current);
  }

  return {
    questions: questions.map((question) => {
      const fresh = accepted.get(question.id) ?? [];
      const carried = (question.examSection?.readingCRiskReviews ?? []).filter(
        (review) =>
          ![...rejected].some((key) => {
            const [number, letter] = key.split("-");
            return (
              Number(number) === question.examSection?.questionNumber &&
              risks.some(
                (risk) =>
                  risk.questionId === question.id &&
                  risk.letter === letter &&
                  risk.option === review.option &&
                  risk.correctOption === review.correctOption,
              )
            );
          }),
      );
      const reviews = dedupeReadingCRiskReviews([...carried, ...fresh]);
      return {
        ...question,
        examSection: {
          ...question.examSection,
          kind: question.examSection?.kind ?? "cet-reading-c",
          readingCRiskReviews: reviews.length ? reviews : undefined,
        },
      };
    }),
    unresolved,
    invalidReviews,
  };
}

export function isValidReadingCRiskReview(
  risk: ReadingCRisk,
  review: ReadingCRiskReview,
): boolean {
  return readingCRiskReviewIssues(risk, review).length === 0;
}

export function readingCRiskReviewIssues(
  risk: ReadingCRisk,
  review: ReadingCRiskReview,
): string[] {
  const issues: string[] = [];
  if (
    review.option !== risk.option ||
    review.correctOption !== risk.correctOption
  ) {
    issues.push("裁决对应了旧选项，已经与当前题目不一致");
  }
  const missingTypes = risk.types.filter((type) => !review.types.includes(type));
  if (missingTypes.length > 0) {
    issues.push(`缺少风险类型 ${missingTypes.join("/")}`);
  }
  const evidence = normalizeSpace(review.passageEvidence);
  if (
    evidence.length < 8 ||
    !normalizeSpace(risk.passage).includes(evidence) ||
    contentWords(evidence).size < 2
  ) {
    issues.push("正文证据不是原文逐字短语，或实词不足两个");
  }
  if (review.optionError.trim().length < 4) {
    issues.push("没有指出干扰项的具体错误措辞");
  }
  if (review.distinguishingReason.trim().length < 8) {
    issues.push("没有说明该错误为何不能回答当前题干");
  }
  if (isGenericDistinction(review.optionError, review.distinguishingReason)) {
    issues.push("错因或区分理由仍是空泛表述");
  }
  return [...new Set(issues)];
}

export function unresolvedReadingCRiskText(risk: ReadingCRisk): string {
  return [
    `Q${risk.questionNumber}-${risk.letter}`,
    `risk=${risk.types.join("+")}`,
    `distractor=${JSON.stringify(risk.option)}`,
    `correct=${JSON.stringify(risk.correctOption)}`,
    `overlap=${(risk.distractorOverlap * 100).toFixed(0)}% vs key ${(risk.correctOverlap * 100).toFixed(0)}%`,
    `supporting sentence=${JSON.stringify(risk.supportSentence)}`,
    `correct support=${JSON.stringify(risk.correctSupportSentence)}`,
    "Required fix: name one decisive actor/time/scope/degree/cause/object error and support it with a verbatim passage phrase.",
  ].join("\n");
}

export function carryForwardReadingCRiskReviews(
  previous: Question,
  next: Extract<Question, { type: "single-choice" }>,
): Extract<Question, { type: "single-choice" }> {
  const correctOption = next.options[next.correctAnswer];
  const reviews = (previous.examSection?.readingCRiskReviews ?? []).filter(
    (review) =>
      review.correctOption === correctOption &&
      next.options.includes(review.option),
  );
  return {
    ...next,
    examSection: {
      ...next.examSection,
      kind: next.examSection?.kind ?? "cet-reading-c",
      readingCRiskReviews: reviews.length ? reviews : undefined,
    },
  };
}

export function formatReadingCRisksForRepair(
  risks: readonly ReadingCRisk[],
): string {
  return risks.map(unresolvedReadingCRiskText).join("\n\n");
}

function toPromptRisk(risk: ReadingCRisk, passageId: string) {
  return {
    passageId,
    questionNumber: risk.questionNumber,
    stem: risk.stem,
    letter: risk.letter,
    option: risk.option,
    correctLetter: risk.correctLetter,
    correctOption: risk.correctOption,
    risks: risk.types,
    distractorOverlap: `${(risk.distractorOverlap * 100).toFixed(0)}%`,
    correctOverlap: `${(risk.correctOverlap * 100).toFixed(0)}%`,
    strongestDistractorSentence: risk.supportSentence,
    strongestCorrectSentence: risk.correctSupportSentence,
  };
}

function scoreSupport(
  text: string,
  sentenceSets: readonly Set<string>[],
  rawSentences: readonly string[],
): SupportMatch {
  const words = contentWords(text);
  let best: SupportMatch = { sentenceIndex: -1, ratio: 0, sentence: "" };
  sentenceSets.forEach((sentence, index) => {
    let shared = 0;
    for (const word of words) if (sentence.has(word)) shared += 1;
    const ratio = words.size ? shared / words.size : 0;
    if (ratio > best.ratio) {
      best = {
        sentenceIndex: index,
        ratio,
        sentence: rawSentences[index] ?? "",
      };
    }
  });
  return best;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeReadingCRiskReviews(
  reviews: readonly ReadingCRiskReview[],
): ReadingCRiskReview[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key = [
      review.option,
      review.correctOption,
      review.errorType,
      review.passageEvidence,
      review.optionError,
      review.distinguishingReason,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGenericDistinction(optionError: string, reason: string): boolean {
  const generic = [
    "不够准确",
    "不如正确项",
    "不完全符合",
    "less precise",
    "not as accurate",
    "does not match well",
  ];
  return (
    optionError.trim().length < 4 ||
    reason.trim().length < 8 ||
    generic.some(
      (phrase) =>
        normalizeSpace(optionError).toLowerCase() === phrase.toLowerCase() ||
        normalizeSpace(reason).toLowerCase() === phrase.toLowerCase(),
    )
  );
}
