import type { Cet6Blueprint } from "../types/cet";
import type { Question } from "../types/exam";

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
  sourceTypes: [ReadingCSourceType, ReadingCSourceType];
}

export interface ReadingCHistoryEntry {
  questionKinds: ReadingCQuestionKind[];
  sourceTypes: [ReadingCSourceType, ReadingCSourceType];
  paragraphCounts: [number, number];
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
  ["商业", "法律医学"],
  ["法律医学", "科普"],
  ["商业", "评论"],
];

interface ParagraphSkeleton {
  first: {
    count: number;
    words: number[];
    sourceParagraphs: number[];
  };
  second: {
    count: number;
    words: number[];
    sourceParagraphs: number[];
  };
}

const PARAGRAPH_SKELETONS: ParagraphSkeleton[] = [
  {
    first: {
      count: 8,
      words: [20, 30, 35, 40, 55, 80, 90, 100],
      sourceParagraphs: [2, 3, 5, 6, 8],
    },
    second: {
      count: 9,
      words: [10, 20, 30, 40, 50, 60, 70, 70, 100],
      sourceParagraphs: [1, 3, 5, 7, 9],
    },
  },
  {
    first: {
      count: 7,
      words: [20, 30, 60, 70, 80, 85, 105],
      sourceParagraphs: [1, 3, 4, 5, 7],
    },
    second: {
      count: 10,
      words: [10, 20, 25, 30, 35, 40, 50, 60, 70, 110],
      sourceParagraphs: [1, 3, 5, 7, 9],
    },
  },
  {
    first: {
      count: 8,
      words: [20, 30, 35, 40, 55, 80, 90, 100],
      sourceParagraphs: [2, 3, 5, 6, 8],
    },
    second: {
      count: 10,
      words: [10, 20, 25, 30, 35, 40, 50, 60, 70, 110],
      sourceParagraphs: [1, 3, 5, 7, 9],
    },
  },
  {
    first: {
      count: 7,
      words: [20, 30, 60, 70, 80, 85, 105],
      sourceParagraphs: [1, 3, 4, 5, 7],
    },
    second: {
      count: 9,
      words: [10, 20, 30, 40, 50, 60, 70, 70, 100],
      sourceParagraphs: [1, 3, 5, 7, 9],
    },
  },
];

export function createReadingCPlan(
  blueprint: Cet6Blueprint,
  seedText: string,
  history: readonly ReadingCHistoryEntry[] = [],
): ReadingCPlan {
  const random = seededRandom(seedText);
  const pattern = chooseQuestionKindPattern(random, history);
  const sourceTypes = chooseSourceTypePair(random, history);
  const skeleton = chooseParagraphSkeleton(random, history);
  const topics = readingCTopics(blueprint);
  const firstAnswers = shuffle([0, 1, 2, 3, 0], random);
  const secondAnswers = shuffle([1, 1, 2, 2, 3], random);

  return {
    sourceTypes,
    passages: [
      {
        index: 0,
        paragraphCount: skeleton.first.count,
        targetParagraphWords: skeleton.first.words,
        sourceParagraphs: skeleton.first.sourceParagraphs,
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
        paragraphCount: skeleton.second.count,
        targetParagraphWords: skeleton.second.words,
        sourceParagraphs: skeleton.second.sourceParagraphs,
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

export function readingCHistoryEntryFromQuestions(
  questions: readonly Question[],
): ReadingCHistoryEntry | null {
  const readingC = questions
    .filter((question) => question.examSection?.kind === "cet-reading-c")
    .sort(
      (left, right) =>
        (left.examSection?.questionNumber ?? 0) -
        (right.examSection?.questionNumber ?? 0),
    );
  const questionKinds = readingC
    .map((question) => question.examSection?.questionKind)
    .filter(
      (kind): kind is ReadingCQuestionKind =>
        kind === "detail" || kind === "inference" || kind === "attitude",
    );
  if (questionKinds.length !== 10) return null;

  const groups = new Map<string, Question[]>();
  for (const question of readingC) {
    const groupId = question.examSection?.groupId;
    if (!groupId) continue;
    const group = groups.get(groupId) ?? [];
    group.push(question);
    groups.set(groupId, group);
  }
  const orderedGroups = [...groups.values()].sort(
    (left, right) =>
      (left[0]?.examSection?.questionNumber ?? 0) -
      (right[0]?.examSection?.questionNumber ?? 0),
  );
  if (orderedGroups.length !== 2) return null;
  const sourceTypes = orderedGroups.map(
    (group) => group[0]?.examSection?.source?.type,
  );
  const isSourceType = (type: string | undefined): type is ReadingCSourceType =>
    type === "评论" ||
    type === "研究报告" ||
    type === "科普" ||
    type === "商业" ||
    type === "法律医学";
  if (!sourceTypes.every(isSourceType)) return null;

  const paragraphCounts = orderedGroups.map((group) => {
    const passage =
      group.find((question) => question.examSection?.passage)?.examSection
        ?.passage ?? "";
    return passage.split(/\n+/).filter(Boolean).length;
  });
  if (paragraphCounts.some((count) => count < 6 || count > 12)) return null;
  return {
    questionKinds,
    sourceTypes: sourceTypes as [ReadingCSourceType, ReadingCSourceType],
    paragraphCounts: paragraphCounts as [number, number],
  };
}

function chooseParagraphSkeleton(
  random: () => number,
  history: readonly ReadingCHistoryEntry[],
): ParagraphSkeleton {
  const start = Math.floor(random() * PARAGRAPH_SKELETONS.length);
  const previous = history[0]?.paragraphCounts.join("/");
  for (let offset = 0; offset < PARAGRAPH_SKELETONS.length; offset += 1) {
    const candidate =
      PARAGRAPH_SKELETONS[(start + offset) % PARAGRAPH_SKELETONS.length];
    if (`${candidate.first.count}/${candidate.second.count}` !== previous) {
      return candidate;
    }
  }
  return PARAGRAPH_SKELETONS[start];
}

function chooseQuestionKindPattern(
  random: () => number,
  history: readonly ReadingCHistoryEntry[],
): [ReadingCQuestionKind[], ReadingCQuestionKind[]] {
  const start = Math.floor(random() * QUESTION_KIND_PATTERNS.length);
  const previousKinds = history[0]?.questionKinds;
  const previousSignature = previousKinds?.join(",");
  for (let offset = 0; offset < QUESTION_KIND_PATTERNS.length; offset += 1) {
    const candidate =
      QUESTION_KIND_PATTERNS[(start + offset) % QUESTION_KIND_PATTERNS.length];
    if (candidate.flat().join(",") !== previousSignature) return candidate;
  }
  return QUESTION_KIND_PATTERNS[start];
}

function chooseSourceTypePair(
  random: () => number,
  history: readonly ReadingCHistoryEntry[],
): [ReadingCSourceType, ReadingCSourceType] {
  const start = Math.floor(random() * SOURCE_TYPE_PAIRS.length);
  const recentTypes = history.flatMap((entry) => entry.sourceTypes);
  const previousPair = history[0]?.sourceTypes.join("|");
  let best = SOURCE_TYPE_PAIRS[start];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let offset = 0; offset < SOURCE_TYPE_PAIRS.length; offset += 1) {
    const candidate =
      SOURCE_TYPE_PAIRS[(start + offset) % SOURCE_TYPE_PAIRS.length];
    const counts = new Map<ReadingCSourceType, number>();
    for (const type of [...recentTypes, ...candidate]) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const maxCount = Math.max(0, ...counts.values());
    const overLimit = [...counts.values()].filter((count) => count > 2).length;
    const repeatedPair = candidate.join("|") === previousPair ? 1 : 0;
    const score = overLimit * 100 + maxCount * 10 + repeatedPair;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
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
