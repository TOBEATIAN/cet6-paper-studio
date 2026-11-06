import type { ExamPaper, Question, QuestionType } from "../types/exam";
import { inferQuestionTypeStrategy } from "./questionTypeStrategy";

/** Display order shared by preview and exports; absent types are skipped. */
export const QUESTION_TYPE_ORDER: readonly QuestionType[] = [
  "single-choice",
  "multiple-choice",
  "true-false",
  "fill-in-blank",
  "short-answer",
  "essay",
  "calculation",
];

export const QUESTION_TYPE_LABEL_ZH: Record<QuestionType, string> = {
  "single-choice": "单选题",
  "multiple-choice": "多选题",
  "true-false": "判断题",
  "fill-in-blank": "填空题",
  "short-answer": "简答题",
  essay: "论述题",
  calculation: "计算题",
};

const CN_ORDINALS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
];

const ENGLISH_SECTION_ORDER = [
  "english-vocabulary-choice",
  "english-cloze",
  "english-reading",
  "english-translation",
  "english-composition",
] as const;

const CET_SECTION_ORDER = [
  "cet-writing",
  "cet-listening-a",
  "cet-listening-b",
  "cet-listening-c",
  "cet-reading-a",
  "cet-reading-b",
  "cet-reading-c",
  "cet-translation",
] as const;

const ENGLISH_SECTION_LABELS: Record<(typeof ENGLISH_SECTION_ORDER)[number], string> = {
  "english-vocabulary-choice": "语法与词汇单选",
  "english-cloze": "完形填空",
  "english-reading": "阅读理解",
  "english-translation": "翻译",
  "english-composition": "作文",
};

const CET_SECTION_LABELS: Record<(typeof CET_SECTION_ORDER)[number], string> = {
  "cet-writing": "Part I　Writing　(30 minutes)",
  "cet-listening-a": "Part II　Listening Comprehension · Section A",
  "cet-listening-b": "Part II　Listening Comprehension · Section B",
  "cet-listening-c": "Part II　Listening Comprehension · Section C",
  "cet-reading-a": "Part III　Reading Comprehension · Section A",
  "cet-reading-b": "Part III　Reading Comprehension · Section B",
  "cet-reading-c": "Part III　Reading Comprehension · Section C",
  "cet-translation": "Part IV　Translation",
};

export interface PaperQuestionSection {
  key: string;
  type: QuestionType;
  ordinal: string;
  title: string;
  questions: Question[];
  score: number;
  passage?: string;
  kind?: string;
  hidePassageForStudent?: boolean;
  optionBank?: string[];
  bankPos?: string[];
  instructions?: string;
}

export interface PaperSectionScoreSummary {
  count: number;
  totalScore: number;
  perQuestionScore: number | null;
}

export function cnOrdinal(index: number): string {
  return CN_ORDINALS[index] ?? String(index + 1);
}

export function groupQuestionsByType(paper: ExamPaper): PaperQuestionSection[] {
  if (isCet6Paper(paper)) {
    return groupCetSections(paper);
  }
  if (isEnglishPaper(paper)) {
    return groupEnglishSections(paper);
  }

  return groupByQuestionType(paper);
}

function groupCetSections(paper: ExamPaper): PaperQuestionSection[] {
  const groups = new Map<
    string,
    {
      kind: (typeof CET_SECTION_ORDER)[number];
      title?: string;
      passage?: string;
      hidePassageForStudent?: boolean;
      questions: Question[];
      firstIndex: number;
    }
  >();

  paper.questions.forEach((question, index) => {
    const kind = cetSectionKind(question.examSection?.kind);
    if (!kind) return;
    const key = kind;
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
      existing.title ??= question.examSection?.title;
      existing.passage ??= question.examSection?.passage;
      existing.hidePassageForStudent ??=
        question.examSection?.hidePassageForStudent;
      return;
    }
    groups.set(key, {
      kind,
      title: CET_SECTION_LABELS[kind],
      passage: undefined,
      hidePassageForStudent:
        question.examSection?.hidePassageForStudent,
      questions: [question],
      firstIndex: index,
    });
  });

  return Array.from(groups.entries())
    .sort((a, b) => {
      const orderA = CET_SECTION_ORDER.indexOf(a[1].kind);
      const orderB = CET_SECTION_ORDER.indexOf(b[1].kind);
      return orderA === orderB
        ? a[1].firstIndex - b[1].firstIndex
        : orderA - orderB;
    })
    .map(([key, group], index) =>
      makeSection({
        key,
        type: group.questions[0].type,
        label: CET_SECTION_LABELS[group.kind],
        questions: group.questions,
        index,
        passage: undefined,
        kind: group.kind,
        hidePassageForStudent: group.hidePassageForStudent,
        optionBank: group.questions[0]?.examSection?.optionBank,
        bankPos: group.questions[0]?.examSection?.bankPos,
        instructions: cetInstructions(group.kind),
        noOrdinal: true,
      }),
    );
}

function groupByQuestionType(paper: ExamPaper): PaperQuestionSection[] {
  const sections: PaperQuestionSection[] = [];
  const labels = questionTypeLabelsForPaper(paper);

  for (const type of QUESTION_TYPE_ORDER) {
    const questions = paper.questions.filter((question) => question.type === type);
    if (questions.length === 0) continue;
    const ordinal = cnOrdinal(sections.length);
    sections.push({
      key: type,
      type,
      ordinal,
      title: `${ordinal}、${labels[type]}`,
      questions,
      score: questions.reduce((sum, question) => sum + question.score, 0),
    });
  }

  return sections;
}

function groupEnglishSections(paper: ExamPaper): PaperQuestionSection[] {
  const englishGroups = new Map<string, {
    kind: (typeof ENGLISH_SECTION_ORDER)[number];
    title?: string;
    passage?: string;
    questions: Question[];
    firstIndex: number;
  }>();
  const fallbackQuestions: Question[] = [];

  paper.questions.forEach((question, index) => {
    const kind = englishSectionKind(question.examSection?.kind);
    if (!kind) {
      fallbackQuestions.push(question);
      return;
    }
    const key = `${kind}:${question.examSection?.groupId ?? kind}`;
    const existing = englishGroups.get(key);
    if (existing) {
      existing.questions.push(question);
      existing.title ??= question.examSection?.title;
      existing.passage ??= question.examSection?.passage;
      return;
    }
    englishGroups.set(key, {
      kind,
      title: question.examSection?.title,
      passage: question.examSection?.passage,
      questions: [question],
      firstIndex: index,
    });
  });

  const orderedGroups = Array.from(englishGroups.entries()).sort((a, b) => {
    const orderA = ENGLISH_SECTION_ORDER.indexOf(a[1].kind);
    const orderB = ENGLISH_SECTION_ORDER.indexOf(b[1].kind);
    return orderA === orderB ? a[1].firstIndex - b[1].firstIndex : orderA - orderB;
  });

  const sections: PaperQuestionSection[] = orderedGroups.map(([key, group], index) =>
    makeSection({
      key,
      type: group.questions[0].type,
      label: group.title ?? ENGLISH_SECTION_LABELS[group.kind],
      questions: group.questions,
      index,
      passage: group.passage,
    }),
  );

  if (fallbackQuestions.length === 0) return sections;

  for (const fallback of groupByQuestionType({ ...paper, questions: fallbackQuestions })) {
    const ordinal = cnOrdinal(sections.length);
    sections.push({
      ...fallback,
      ordinal,
      title: `${ordinal}、${fallback.title.replace(/^.*?、/, "")}`,
    });
  }

  return sections;
}

function makeSection({
  key,
  type,
  label,
  questions,
  index,
  passage,
  kind,
  hidePassageForStudent,
  optionBank,
  bankPos,
  instructions,
  noOrdinal = false,
}: {
  key: string;
  type: QuestionType;
  label: string;
  questions: Question[];
  index: number;
  passage?: string;
  kind?: string;
  hidePassageForStudent?: boolean;
  optionBank?: string[];
  bankPos?: string[];
  instructions?: string;
  noOrdinal?: boolean;
}): PaperQuestionSection {
  const ordinal = cnOrdinal(index);
  return {
    key,
    type,
    ordinal,
    title: noOrdinal ? label : `${ordinal}、${label}`,
    questions,
    score: questions.reduce((sum, question) => sum + question.score, 0),
    passage,
    kind,
    hidePassageForStudent,
    optionBank,
    bankPos,
    instructions,
  };
}

function cetInstructions(kind: (typeof CET_SECTION_ORDER)[number]): string {
  const map: Record<(typeof CET_SECTION_ORDER)[number], string> = {
    "cet-writing": "",
    "cet-listening-a":
      "In this section, you will hear two long conversations. Each conversation and its questions are spoken only once.",
    "cet-listening-b":
      "In this section, you will hear two passages. Each passage and its questions are spoken only once.",
    "cet-listening-c":
      "In this section, you will hear three recordings. Each recording and its questions are spoken only once.",
    "cet-reading-a":
      "Read the passage and choose one word from the bank for each numbered blank.",
    "cet-reading-b":
      "Match each statement with the paragraph that contains the corresponding information.",
    "cet-reading-c":
      "Read each passage and choose the best answer to each question.",
    "cet-translation":
      "Translate the following passage from Chinese into English in 30 minutes.",
  };
  return map[kind];
}

function englishSectionKind(
  kind: string | undefined,
): (typeof ENGLISH_SECTION_ORDER)[number] | null {
  return ENGLISH_SECTION_ORDER.find((candidate) => candidate === kind) ?? null;
}

function cetSectionKind(
  kind: string | undefined,
): (typeof CET_SECTION_ORDER)[number] | null {
  return CET_SECTION_ORDER.find((candidate) => candidate === kind) ?? null;
}

export function isCet6Paper(paper: ExamPaper): boolean {
  const text = [paper.title, paper.metadata?.subject]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return /(cet[-\s]?6|大学英语六级|六级模拟|六级整卷)/.test(text);
}

function isEnglishPaper(paper: ExamPaper): boolean {
  return (
    inferQuestionTypeStrategy({
      requestText: [paper.title, paper.metadata?.subject].filter(Boolean).join("\n"),
    })?.strategy.id === "english-language"
  );
}

export function questionTypeLabelsForPaper(
  paper: ExamPaper,
): Record<QuestionType, string> {
  const match = inferQuestionTypeStrategy({
    requestText: [paper.title, paper.metadata?.subject].filter(Boolean).join("\n"),
  });
  return {
    ...QUESTION_TYPE_LABEL_ZH,
    ...(match?.strategy.sectionLabels ?? {}),
  };
}

export function sectionScoreSummary(
  questions: readonly Question[],
): PaperSectionScoreSummary {
  const totalScore = questions.reduce((sum, question) => sum + question.score, 0);
  const firstScore = questions[0]?.score;
  const perQuestionScore =
    firstScore != null && questions.every((question) => question.score === firstScore)
      ? firstScore
      : null;
  return {
    count: questions.length,
    totalScore,
    perQuestionScore,
  };
}
