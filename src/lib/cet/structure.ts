import type { QuestionType } from "../types/exam";
import type { Cet6ContentStage } from "../types/cet";

export interface Cet6QuestionGroup {
  id: string;
  title: string;
  questionNumbers: readonly number[];
}

export interface Cet6StageSpec {
  stage: Cet6ContentStage;
  kind: string;
  labelZh: string;
  labelEn: string;
  questionType: QuestionType;
  scorePerQuestion: number;
  groups: readonly Cet6QuestionGroup[];
  passageRequired: boolean;
  hidePassageForStudent: boolean;
}

function numbers(start: number, count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}

export const CET6_STAGE_SPECS: Record<Cet6ContentStage, Cet6StageSpec> = {
  writing: {
    stage: "writing",
    kind: "cet-writing",
    labelZh: "写作",
    labelEn: "Writing",
    questionType: "essay",
    scorePerQuestion: 106.5,
    groups: [
      {
        id: "writing",
        title: "Part I　Writing　(30 minutes)",
        questionNumbers: [],
      },
    ],
    passageRequired: false,
    hidePassageForStudent: false,
  },
  "listening-a": {
    stage: "listening-a",
    kind: "cet-listening-a",
    labelZh: "听力 A",
    labelEn: "Listening Section A",
    questionType: "single-choice",
    scorePerQuestion: 7.1,
    groups: [
      {
        id: "conversation-1",
        title: "Listening Section A · Conversation 1",
        questionNumbers: numbers(1, 4),
      },
      {
        id: "conversation-2",
        title: "Listening Section A · Conversation 2",
        questionNumbers: numbers(5, 4),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: true,
  },
  "listening-b": {
    stage: "listening-b",
    kind: "cet-listening-b",
    labelZh: "听力 B",
    labelEn: "Listening Section B",
    questionType: "single-choice",
    scorePerQuestion: 7.1,
    groups: [
      {
        id: "passage-1",
        title: "Listening Section B · Passage 1",
        questionNumbers: numbers(9, 3),
      },
      {
        id: "passage-2",
        title: "Listening Section B · Passage 2",
        questionNumbers: numbers(12, 4),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: true,
  },
  "listening-c": {
    stage: "listening-c",
    kind: "cet-listening-c",
    labelZh: "听力 C",
    labelEn: "Listening Section C",
    questionType: "single-choice",
    scorePerQuestion: 14.2,
    groups: [
      {
        id: "recording-1",
        title: "Listening Section C · Recording 1",
        questionNumbers: numbers(16, 3),
      },
      {
        id: "recording-2",
        title: "Listening Section C · Recording 2",
        questionNumbers: numbers(19, 3),
      },
      {
        id: "recording-3",
        title: "Listening Section C · Recording 3",
        questionNumbers: numbers(22, 4),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: true,
  },
  "reading-a": {
    stage: "reading-a",
    kind: "cet-reading-a",
    labelZh: "选词填空",
    labelEn: "Reading Section A",
    questionType: "single-choice",
    scorePerQuestion: 3.55,
    groups: [
      {
        id: "banked-cloze",
        title: "Reading Section A · Banked Cloze",
        questionNumbers: numbers(26, 10),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: false,
  },
  "reading-b": {
    stage: "reading-b",
    kind: "cet-reading-b",
    labelZh: "段落匹配",
    labelEn: "Reading Section B",
    questionType: "single-choice",
    scorePerQuestion: 7.1,
    groups: [
      {
        id: "matching",
        title: "Reading Section B · Paragraph Matching",
        questionNumbers: numbers(36, 10),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: false,
  },
  "reading-c": {
    stage: "reading-c",
    kind: "cet-reading-c",
    labelZh: "仔细阅读",
    labelEn: "Reading Section C",
    questionType: "single-choice",
    scorePerQuestion: 14.2,
    groups: [
      {
        id: "passage-1",
        title: "Reading Section C · Passage 1",
        questionNumbers: numbers(46, 5),
      },
      {
        id: "passage-2",
        title: "Reading Section C · Passage 2",
        questionNumbers: numbers(51, 5),
      },
    ],
    passageRequired: true,
    hidePassageForStudent: false,
  },
  translation: {
    stage: "translation",
    kind: "cet-translation",
    labelZh: "翻译",
    labelEn: "Translation",
    questionType: "short-answer",
    scorePerQuestion: 106.5,
    groups: [{ id: "translation", title: "Part IV　Translation", questionNumbers: [] }],
    passageRequired: false,
    hidePassageForStudent: false,
  },
};

export function expectedQuestionCount(stage: Cet6ContentStage): number {
  return CET6_STAGE_SPECS[stage].groups.reduce(
    (sum, group) => sum + Math.max(1, group.questionNumbers.length),
    0,
  );
}

export function contentStageNumber(stage: Cet6ContentStage): number {
  return (
    ["blueprint", ...CET6_PIPELINE_ORDER].indexOf(stage) + 1
  );
}

const CET6_PIPELINE_ORDER = [
  "writing",
  "listening-a",
  "listening-b",
  "listening-c",
  "reading-a",
  "reading-b",
  "reading-c",
  "translation",
] as const;
