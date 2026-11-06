import type { ExamPaper, Question } from "../types/exam";
import { z } from "zod";
import {
  Cet6BlueprintSchema,
  type Cet6Blueprint,
  type Cet6ContentStage,
} from "../types/cet";
import { extractJson } from "../api/extractJson";
import { validateQuestions } from "../api/validateQuestions";
import { toStudentVersion } from "../exam/studentVersion";
import {
  createCet6PaperTitle,
  isCet6TimestampTitle,
} from "../exam/paperTitle";
import {
  CET6_STAGE_SPECS,
  expectedQuestionCount,
  type Cet6QuestionGroup,
} from "./structure";
import {
  auditCet6Paper,
  auditCet6Stage,
  auditReadingBPassage,
  auditReadingCPassage,
} from "./quality/audit";
import type {
  ReadingCQuestionKind,
  ReadingCSourceType,
} from "./readingCPlan";
import {
  classifyWritingOpening,
  type WritingOpeningStyle,
} from "./writingPlan";

export function normalizeWritingOpeningQuotes(content: string): string {
  const normalized = content.replace(
    /(Opening sentence\s*:\s*)"([^"\r\n]{20,})"/i,
    (_match, label: string, sentence: string) =>
      `${label}“${sentence.trim()}”`,
  );
  const opening =
    normalized.match(
      /(?:opening sentence\s*:|begins with the sentence\s*)[^“\n]*“([^”]+)”/i,
    )?.[1]?.trim() ??
    normalized.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim();
  if (!opening) return normalized.trim();
  return `For this part, you are allowed 30 minutes to write an essay that begins with the sentence “${opening}” You can make comments, cite examples or use your personal experiences to develop your essay. You should write at least 150 words but no more than 200 words.`;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; raw: string };

export function parseCet6Blueprint(reply: string): ParseResult<Cet6Blueprint> {
  const { json } = extractJson(reply);
  if (!json) return { ok: false, error: "No JSON block found.", raw: reply };
  try {
    const parsed = Cet6BlueprintSchema.safeParse(JSON.parse(json));
    return parsed.success
      ? { ok: true, value: parsed.data }
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

export function parseCet6Stage(
  stage: Cet6ContentStage,
  reply: string,
  options: {
    forcedSharedPassage?: string;
    skipQualityAudit?: boolean;
    expectedWritingOpeningStyle?: WritingOpeningStyle;
    expectedAnswerIndexes?: readonly number[];
  } = {},
): ParseResult<Question[]> {
  const result = validateQuestions(reply);
  if (!result.ok) return result;
  const spec = CET6_STAGE_SPECS[stage];
  const parsedQuestions =
    options.forcedSharedPassage == null
      ? result.questions
      : result.questions.map((question, index) => ({
          ...question,
          examSection: {
            kind: spec.kind,
            ...question.examSection,
            passage:
              index === 0 ? options.forcedSharedPassage : undefined,
          },
        }));
  const questions =
    stage === "writing"
      ? parsedQuestions.map((question) => ({
          ...question,
          content: normalizeWritingOpeningQuotes(question.content),
        }))
      : parsedQuestions;
  const errors = [
    ...validateCet6StageQuestions(stage, questions),
    ...(options.expectedAnswerIndexes
      ? expectedAnswerErrors(questions, options.expectedAnswerIndexes)
      : []),
    ...(stage === "writing" && options.expectedWritingOpeningStyle
      ? writingOpeningErrors(
          questions,
          options.expectedWritingOpeningStyle,
        )
      : []),
    ...(options.skipQualityAudit
      ? []
      : auditCet6Stage(stage, questions).errors.map(
          (check) => `${check.label}: ${check.detail ?? "未通过"}`,
        )),
  ];
  return errors.length === 0
    ? { ok: true, value: questions }
    : { ok: false, error: errors.join("\n"), raw: reply };
}

function expectedAnswerErrors(
  questions: readonly Question[],
  expected: readonly number[],
): string[] {
  if (questions.length !== expected.length) {
    return [
      `Expected ${expected.length} fixed answers, received ${questions.length} questions.`,
    ];
  }
  return questions.flatMap((question, index) =>
    question.type === "single-choice" &&
    question.correctAnswer === expected[index]
      ? []
      : [
          `Question ${index + 1} correctAnswer must be ${expected[index]}.`,
        ],
  );
}

function writingOpeningErrors(
  questions: readonly Question[],
  expectedStyle: WritingOpeningStyle,
): string[] {
  const content = questions[0]?.content ?? "";
  const opening =
    content.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim() ?? "";
  if (!opening) return ["Writing prompt has no quoted opening sentence."];
  const actual = classifyWritingOpening(opening);
  return actual === expectedStyle
    ? []
    : [
        `Writing opening sentence style must be ${expectedStyle}, received ${actual ?? "unknown"}.`,
      ];
}

const ReadingBPassageResponseSchema = z.object({
  passage: z.string().min(1000),
});

export function parseCet6ReadingBPassage(
  reply: string,
): ParseResult<string> {
  const { json } = extractJson(reply);
  if (!json) return { ok: false, error: "No JSON block found.", raw: reply };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      raw: reply,
    };
  }
  const schema = ReadingBPassageResponseSchema.safeParse(parsed);
  if (!schema.success) {
    return {
      ok: false,
      error: schema.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n"),
      raw: reply,
    };
  }
  const errors = auditReadingBPassage(schema.data.passage).errors.map(
    (check) => `${check.label}: ${check.detail ?? "未通过"}`,
  );
  return errors.length === 0
    ? { ok: true, value: schema.data.passage }
    : { ok: false, error: errors.join("\n"), raw: reply };
}

const ReadingCPassageResponseSchema = z.object({
  passage: z.string().min(1000),
});

export function parseCet6ReadingCPassage(
  reply: string,
  expectedParagraphs: number,
): ParseResult<string> {
  const { json } = extractJson(reply);
  if (!json) return { ok: false, error: "No JSON block found.", raw: reply };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      raw: reply,
    };
  }
  const schema = ReadingCPassageResponseSchema.safeParse(parsed);
  if (!schema.success) {
    return {
      ok: false,
      error: schema.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n"),
      raw: reply,
    };
  }
  const errors = auditReadingCPassage(
    schema.data.passage,
    expectedParagraphs,
  ).errors.map(
    (check) => `${check.label}: ${check.detail ?? "未通过"}`,
  );
  return errors.length === 0
    ? { ok: true, value: schema.data.passage }
    : { ok: false, error: errors.join("\n"), raw: reply };
}

export function parseCet6ReadingCQuestions(
  reply: string,
  passage: string,
  passageIndex: 0 | 1,
  sourceParagraphs: readonly number[],
  questionKinds: readonly ReadingCQuestionKind[],
  answerIndexes: readonly number[],
  source: {
    outlet: string;
    type: ReadingCSourceType;
    topic: string;
  },
): ParseResult<Question[]> {
  const result = validateQuestions(reply);
  if (!result.ok) return result;
  if (result.questions.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 Reading C questions, received ${result.questions.length}.`,
      raw: reply,
    };
  }
  const errors: string[] = [];
  const firstNumber = passageIndex === 0 ? 46 : 51;
  const questions = result.questions.map((question, index) => {
    if (question.type !== "single-choice") {
      errors.push(`Question ${firstNumber + index} must be single-choice.`);
      return question;
    }
    if (question.options.length !== 4) {
      errors.push(`Question ${firstNumber + index} must have four options.`);
    }
    if (question.correctAnswer !== answerIndexes[index]) {
      errors.push(
        `Question ${firstNumber + index} correctAnswer must be ${answerIndexes[index]}.`,
      );
    }
    return {
      ...question,
      score: 14.2,
      examSection: {
        ...question.examSection,
        kind: "cet-reading-c",
        groupId: `cet6-reading-c-passage-${passageIndex + 1}`,
        title: `Reading Section C · Passage ${passageIndex + 1}`,
        questionNumber: firstNumber + index,
        para: sourceParagraphs[index],
        questionKind: questionKinds[index],
        ...(index === 0 ? { passage, source } : {}),
      },
    };
  });
  return errors.length === 0
    ? { ok: true, value: questions }
    : { ok: false, error: errors.join("\n"), raw: reply };
}

export function validateCet6StageQuestions(
  stage: Cet6ContentStage,
  questions: readonly Question[],
): string[] {
  const spec = CET6_STAGE_SPECS[stage];
  const expected = expectedQuestionCount(stage);
  const expectedOptions =
    stage === "reading-a" ? 15 : stage === "reading-b" ? 13 : 4;
  const errors: string[] = [];

  if (questions.length !== expected) {
    errors.push(`Expected ${expected} questions, received ${questions.length}.`);
  }

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question.type !== spec.questionType) {
      errors.push(`${label} must use type ${spec.questionType}.`);
    }
    if (question.type === "single-choice") {
      if (question.options.length !== expectedOptions) {
        errors.push(
          `${label} must have exactly ${expectedOptions} options.`,
        );
      }
      if (
        question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length
      ) {
        errors.push(`${label} correctAnswer is outside the options array.`);
      }
      if (!question.explanation?.trim()) {
        errors.push(`${label} needs an explanation.`);
      }
    }
  });

  if (stage === "writing") {
    const writing = questions[0];
    if (
      writing?.type !== "essay" ||
      !writing.scoringCriteria.trim() ||
      !writing.writingGuidance?.trim() ||
      !writing.referenceAnswer?.trim()
    ) {
      errors.push(
        "Writing needs Chinese writingGuidance, non-empty scoringCriteria, and a referenceAnswer model essay.",
      );
    }
  }

  if (stage === "translation") {
    const translation = questions[0];
    if (
      translation?.type !== "short-answer" ||
      !translation.referenceAnswer.trim()
    ) {
      errors.push("Translation needs a non-empty referenceAnswer.");
    }
  }

  let offset = 0;
  for (const group of spec.groups) {
    const count = group.questionNumbers.length;
    if (count === 0) continue;
    const groupQuestions = questions.slice(offset, offset + count);
    if (groupQuestions.length !== count) {
      errors.push(`Group ${group.id} is incomplete.`);
    } else if (spec.passageRequired) {
      const passages = groupQuestions
        .map((question) => question.examSection?.passage?.trim())
        .filter((passage): passage is string => Boolean(passage));
      if (passages.length === 0) {
        errors.push(`Group ${group.id} needs a shared passage.`);
      } else if (new Set(passages.map(normalizeText)).size > 1) {
        errors.push(
          `Group ${group.id} contains conflicting shared passages.`,
        );
      }
    }
    offset += count;
  }

  if (stage === "reading-c" && questions.length === 10) {
    const first = sharedPassage(questions.slice(0, 5));
    const second = sharedPassage(questions.slice(5));
    if (first && second && normalizeText(first) === normalizeText(second)) {
      errors.push("Reading C must contain two different passages.");
    }
  }

  return errors;
}

export function normalizeCet6StageQuestions(
  stage: Cet6ContentStage,
  questions: readonly Question[],
): Question[] {
  const spec = CET6_STAGE_SPECS[stage];
  const normalizedQuestions =
    stage === "writing"
      ? questions.map((question) => ({
          ...question,
          content: normalizeWritingOpeningQuotes(question.content),
        }))
      : questions;
  const sharedOptionBank =
    stage === "reading-a" || stage === "reading-b"
      ? normalizedQuestions[0]?.examSection?.optionBank ??
        (normalizedQuestions[0]?.type === "single-choice"
          ? normalizedQuestions[0].options
          : undefined)
      : undefined;
  let offset = 0;
  return spec.groups.flatMap((group, groupIndex) => {
    const count = group.questionNumbers.length;
    const groupQuestions =
      count === 0
        ? normalizedQuestions.slice(0, 1)
        : normalizedQuestions.slice(offset, offset + count);
    if (count > 0) offset += count;
    const passage = sharedPassage(groupQuestions);

    return groupQuestions.map((question, index) => {
      const questionNumber = group.questionNumbers[index];
      return {
        ...question,
        id: `cet6-${stage}-${groupIndex + 1}-${index + 1}`,
        score: spec.scorePerQuestion,
        examSection: {
          ...question.examSection,
          kind: spec.kind,
          groupId: `cet6-${stage}-${group.id}`,
          title: group.title,
          ...(index === 0 && passage ? { passage } : { passage: undefined }),
          ...(questionNumber ? { questionNumber } : {}),
          ...(spec.hidePassageForStudent
            ? { hidePassageForStudent: true }
            : { hidePassageForStudent: undefined }),
          ...(sharedOptionBank
            ? {
                optionBank: sharedOptionBank,
                hideOptions: true,
              }
            : {}),
        },
      };
    });
  });
}

export function buildCet6Paper(
  questionsByStage: Partial<Record<Cet6ContentStage, readonly Question[]>>,
  generatedAt = new Date(),
): ExamPaper {
  const questions = Object.keys(CET6_STAGE_SPECS).flatMap((key) => {
    const stage = key as Cet6ContentStage;
    const questions = questionsByStage[stage];
    return questions ? normalizeCet6StageQuestions(stage, questions) : [];
  });
  return {
    version: 1,
    title: createCet6PaperTitle(generatedAt),
    metadata: {
      subject: "大学英语六级",
      duration: 130,
      totalScore: 710,
    },
    questions,
  };
}

export function validateCet6Paper(paper: ExamPaper): string[] {
  const errors: string[] = [];
  if (!isCet6TimestampTitle(paper.title)) {
    errors.push("Paper title must use the year/month/day/hour/minute format.");
  }
  if (paper.metadata?.duration !== 130) {
    errors.push("Exam duration must be 130 minutes.");
  }
  if (paper.metadata?.totalScore !== 710) {
    errors.push("Metadata total score must be 710.");
  }
  if (paper.questions.length !== 57) {
    errors.push(`Expected 57 questions, received ${paper.questions.length}.`);
  }

  let cursor = 0;
  const numbers: number[] = [];
  for (const stage of Object.keys(CET6_STAGE_SPECS) as Cet6ContentStage[]) {
    const spec = CET6_STAGE_SPECS[stage];
    const count = expectedQuestionCount(stage);
    const actual = paper.questions.slice(cursor, cursor + count);
    if (actual.length !== count) {
      errors.push(`${spec.labelEn} is incomplete.`);
      break;
    }
    if (actual.some((question) => question.examSection?.kind !== spec.kind)) {
      errors.push(`${spec.labelEn} has questions outside its section kind.`);
    }
    if (actual.some((question) => question.score !== spec.scorePerQuestion)) {
      errors.push(`${spec.labelEn} has an incorrect score.`);
    }
    for (const question of actual) {
      const number = question.examSection?.questionNumber;
      if (number != null) numbers.push(number);
    }
    cursor += count;
  }

  const total = paper.questions.reduce(
    (sum, question) => sum + question.score,
    0,
  );
  if (Math.abs(total - 710) > 0.001) {
    errors.push(`Question scores total ${total}, expected 710.`);
  }
  const expectedNumbers = Array.from({ length: 55 }, (_, index) => index + 1);
  if (
    numbers.length !== 55 ||
    numbers.some((number, index) => number !== expectedNumbers[index])
  ) {
    errors.push("Objective question numbers must be exactly 1-55 in order.");
  }
  if (new Set(paper.questions.map((question) => question.id)).size !== 57) {
    errors.push("Question ids must be unique.");
  }

  const student = toStudentVersion(paper);
  if (
    student.questions.some(
      (question) =>
        question.examSection?.kind.startsWith("cet-listening-") &&
        question.examSection.passage,
    )
  ) {
    errors.push("Student preview must hide listening transcripts.");
  }
  if (
    !paper.questions.some(
      (question) =>
        question.examSection?.kind.startsWith("cet-listening-") &&
        Boolean(question.examSection.passage),
    )
  ) {
    errors.push("Teacher data must retain listening transcripts.");
  }

  return errors;
}

export function validateCet6Quality(paper: ExamPaper): string[] {
  return auditCet6Paper(paper).errors.map(
    (check) => `${check.label}: ${check.detail ?? "未通过"}`,
  );
}

export function sharedPassage(
  questions: readonly Question[],
): string | undefined {
  return questions
    .map((question) => question.examSection?.passage?.trim())
    .find((passage): passage is string => Boolean(passage));
}

export function groupQuestionSlice(
  questions: readonly Question[],
  group: Cet6QuestionGroup,
  offset: number,
): Question[] {
  return questions.slice(offset, offset + group.questionNumbers.length);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
