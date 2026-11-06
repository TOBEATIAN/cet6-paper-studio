import type { Cet6Blueprint } from "../types/cet";

export type ReadingCQuestionKind = "detail" | "inference" | "attitude";
export type ReadingCSourceType =
  | "评论"
  | "研究报告"
  | "科普"
  | "商业"
  | "法律医学";

export interface ReadingCPassagePlan {
  index: 0 | 1;
  paragraphCount: number;
  targetParagraphWords: number[];
  sourceParagraphs: number[];
  questionKinds: ReadingCQuestionKind[];
  answerIndexes: number[];
  source: {
    outlet: string;
    type: ReadingCSourceType;
    topic: string;
  };
}

export interface ReadingCPlan {
  passages: [ReadingCPassagePlan, ReadingCPassagePlan];
}

const QUESTION_KIND_PATTERNS: Array<
  [ReadingCQuestionKind[], ReadingCQuestionKind[]]
> = [
  [
    ["detail", "detail", "inference", "detail", "attitude"],
    ["detail", "detail", "detail", "inference", "detail"],
  ],
  [
    ["detail", "inference", "detail", "inference", "attitude"],
    ["detail", "detail", "detail", "inference", "detail"],
  ],
  [
    ["detail", "detail", "inference", "detail", "attitude"],
    ["detail", "detail", "detail", "detail", "detail"],
  ],
];

const SOURCE_TYPE_PAIRS: Array<[ReadingCSourceType, ReadingCSourceType]> = [
  ["研究报告", "评论"],
  ["科普", "研究报告"],
  ["评论", "科普"],
  ["商业", "研究报告"],
];

const PASSAGE_ONE_WORDS = [20, 30, 35, 40, 55, 80, 90, 100];
const PASSAGE_TWO_WORDS = [10, 20, 30, 40, 50, 60, 70, 70, 100];
const PASSAGE_ONE_PARAGRAPHS = [2, 3, 5, 6, 8];
const PASSAGE_TWO_PARAGRAPHS = [1, 3, 5, 7, 9];

export function createReadingCPlan(
  blueprint: Cet6Blueprint,
  seedText: string,
): ReadingCPlan {
  const random = seededRandom(seedText);
  const pattern =
    QUESTION_KIND_PATTERNS[
      Math.floor(random() * QUESTION_KIND_PATTERNS.length)
    ];
  const sourceTypes =
    SOURCE_TYPE_PAIRS[Math.floor(random() * SOURCE_TYPE_PAIRS.length)];
  const topics = readingCTopics(blueprint);
  const firstAnswers = shuffle([0, 1, 2, 3, 0], random);
  const secondAnswers = shuffle([1, 1, 2, 2, 3], random);

  return {
    passages: [
      {
        index: 0,
        paragraphCount: 8,
        targetParagraphWords: PASSAGE_ONE_WORDS,
        sourceParagraphs: PASSAGE_ONE_PARAGRAPHS,
        questionKinds: pattern[0],
        answerIndexes: firstAnswers,
        source: {
          outlet: "六级智卷原创编辑部",
          type: sourceTypes[0],
          topic: topics[0],
        },
      },
      {
        index: 1,
        paragraphCount: 9,
        targetParagraphWords: PASSAGE_TWO_WORDS,
        sourceParagraphs: PASSAGE_TWO_PARAGRAPHS,
        questionKinds: pattern[1],
        answerIndexes: secondAnswers,
        source: {
          outlet: "六级智卷原创编辑部",
          type: sourceTypes[1],
          topic: topics[1],
        },
      },
    ],
  };
}

function readingCTopics(blueprint: Cet6Blueprint): [string, string] {
  if (blueprint.topics.readingC) {
    return [
      blueprint.topics.readingC.first,
      blueprint.topics.readingC.second,
    ];
  }
  return [
    `${blueprint.topics.reading}. Use the first close-reading theme.`,
    `${blueprint.topics.reading}. Use the second close-reading theme.`,
  ];
}

function seededRandom(seedText: string): () => number {
  let state = 0x811c9dc5;
  for (const character of seedText) {
    state ^= character.codePointAt(0) ?? 0;
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}
