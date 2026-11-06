import { describe, expect, it } from "vitest";
import type { ExamPaper, Question } from "../types/exam";
import { defaultAppConfig } from "../types/config";
import {
  formatBankedClozePassage,
  formatReadingBParagraphLabel,
  normalizeWordBank,
  splitPassageParagraphs,
  useTwoColumnReadingOptions,
} from "../exam/cetReadingLayout";
import {
  buildPaperBlocks,
  paginateMeasuredBlocks,
} from "../exam/pagination";
import { buildCet6StagePrompt } from "../cet/pipelinePrompts";

const settings = defaultAppConfig().settings;

function choice(
  id: string,
  questionNumber: number,
  kind:
    | "cet-reading-a"
    | "cet-reading-b"
    | "cet-reading-c"
    | "cet-listening-a"
    | "cet-listening-b"
    | "cet-listening-c",
  content: string,
  extra: {
    groupId?: string;
    passage?: string;
    options?: string[];
    optionBank?: string[];
  } = {},
): Question {
  return {
    id,
    type: "single-choice",
    content,
    options: extra.options ?? ["One", "Two", "Three", "Four"],
    correctAnswer: 0,
    explanation: "中文解析。",
    score: 7.1,
    examSection: {
      kind,
      questionNumber,
      groupId: extra.groupId,
      passage: extra.passage,
      optionBank: extra.optionBank,
      hideOptions: kind === "cet-reading-a" || kind === "cet-reading-b",
    },
  };
}

function readingPaper(): ExamPaper {
  const readingA = Array.from({ length: 10 }, (_, index) =>
    choice(
      `a${index + 1}`,
      26 + index,
      "cet-reading-a",
      `Blank ${26 + index}`,
      index === 0
        ? {
            groupId: "banked-cloze",
            passage:
              "The first ____26____ is clear.\nThe next ____27____ follows.",
            optionBank: [
              "limitation",
              "prohibited",
              "examine",
              "procedure",
              "E) principle",
              "F) voluntary",
              "G) regular",
              "H) inspection",
              "I) steady",
              "J) earlier",
              "K) uncertain",
              "L) supervised",
              "M) refusal",
              "N) complained",
              "O) supplier",
            ],
          }
        : {},
    ),
  );
  const readingB = Array.from({ length: 10 }, (_, index) =>
    choice(
      `b${index + 1}`,
      36 + index,
      "cet-reading-b",
      `Statement ${36 + index}.`,
      index === 0
        ? {
            groupId: "matching",
            passage: "A) First paragraph.\n\nB) Second paragraph.",
          }
        : {},
    ),
  );
  const readingC = Array.from({ length: 5 }, (_, index) =>
    choice(
      `c1-${index + 1}`,
      46 + index,
      "cet-reading-c",
      `First passage question ${46 + index}?`,
      index === 0
        ? {
            groupId: "passage-one",
            passage: "First paragraph.\n\nSecond paragraph.",
            options: ["Short A", "Short B", "Short C", "Short D"],
          }
        : {},
    ),
  ).concat(
    Array.from({ length: 5 }, (_, index) =>
      choice(
        `c2-${index + 1}`,
        51 + index,
        "cet-reading-c",
        `Second passage question ${51 + index}?`,
        index === 0
          ? {
              groupId: "passage-two",
              passage: "Third paragraph.\n\nFourth paragraph.",
              options: [
                "A much longer answer that must remain on its own line.",
                "Another long answer that also needs the full page width.",
                "A third long answer with enough words to avoid a narrow column.",
                "A fourth long answer with enough detail to stay single-column.",
              ],
            }
          : {},
      ),
    ),
  );

  return {
    version: 1,
    title: "2026年10月29日六级模拟卷",
    questions: [...readingA, ...readingB, ...readingC],
  };
}

describe("CET-6 reading layout helpers", () => {
  it("bolds Reading B paragraph labels without changing the text", () => {
    expect(formatReadingBParagraphLabel("A. First paragraph.")).toBe(
      "**A.** First paragraph.",
    );
    expect(formatReadingBParagraphLabel("M：Final paragraph.")).toBe(
      "**M：** Final paragraph.",
    );
    expect(formatReadingBParagraphLabel("No label.")).toBe("No label.");
  });

  it("normalizes word-bank labels and converts numbered blanks to safe underlines", () => {
    expect(
      normalizeWordBank(["alpha", "beta", "gamma", "delta", "E) principle"]),
    ).toEqual(["alpha", "beta", "gamma", "delta", "principle"]);
    expect(formatBankedClozePassage("An ____26____ and (27) __27__.")).toBe(
      "An ++26++ and (27) ++27++.",
    );
  });

  it("splits long passages only at real line boundaries", () => {
    expect(splitPassageParagraphs(" A) One. \n\n B) Two.\n C) Three. ")).toEqual([
      "A) One.",
      "B) Two.",
      "C) Three.",
    ]);
  });

  it("uses two columns only for four short Reading C options", () => {
    expect(useTwoColumnReadingOptions(["A short", "B short", "C short", "D short"]))
      .toBe(true);
    expect(
      useTwoColumnReadingOptions([
        "x".repeat(60),
        "B short",
        "C short",
        "D short",
      ]),
    ).toBe(false);
  });
});

describe("CET-6 reading block order", () => {
  it("prints Reading A article before one bank and omits placeholder stems", () => {
    const blocks = buildPaperBlocks(readingPaper(), settings, false);
    const section = blocks.findIndex((block) => block.id === "section-cet-reading-a");
    const passages = blocks
      .map((block, index) =>
        block.kind === "reading-passage" && block.sectionKind === "cet-reading-a"
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    const bank = blocks.findIndex((block) => block.id === "word-bank-cet-reading-a");
    const placeholderQuestions = blocks.filter(
      (block) =>
        block.kind === "question" &&
        block.question.examSection?.kind === "cet-reading-a",
    );

    expect(section).toBeGreaterThanOrEqual(0);
    expect(passages).toHaveLength(2);
    expect(bank).toBeGreaterThan(passages[passages.length - 1] ?? -1);
    expect(placeholderQuestions).toEqual([]);
  });

  it("places the full Reading B article before individually paginable statements 36-45", () => {
    const blocks = buildPaperBlocks(readingPaper(), settings, false);
    const passages = blocks
      .map((block, index) =>
        block.kind === "reading-passage" && block.sectionKind === "cet-reading-b"
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    const statements = blocks.filter(
      (block) =>
        block.kind === "question" &&
        block.question.examSection?.kind === "cet-reading-b",
    );
    const statementStart = blocks.findIndex(
      (block) => block.id === statements[0]?.id,
    );
    const numbers = statements.map((block) =>
      block.kind === "question"
        ? block.question.examSection?.questionNumber
        : undefined,
    );

    expect(passages).toHaveLength(2);
    expect(statementStart).toBeGreaterThan(
      passages[passages.length - 1] ?? -1,
    );
    expect(statements).toHaveLength(10);
    expect(numbers).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);

    const readingBStart = blocks.findIndex(
      (block) => block.id === "section-cet-reading-b",
    );
    const readingBBlocks = blocks.slice(readingBStart);
    const heights = Object.fromEntries(
      readingBBlocks.map((block) => [block.id, 10]),
    );
    const pages = paginateMeasuredBlocks(readingBBlocks, 50, heights);
    expect(
      pages[0]?.blocks.some(
        (block) =>
          block.kind === "question" &&
          block.question.examSection?.kind === "cet-reading-b",
      ),
    ).toBe(true);
  });

  it("keeps the two Reading C passages with their own question groups", () => {
    const blocks = buildPaperBlocks(readingPaper(), settings, false);
    const partTitles = blocks
      .filter(
        (
          block,
        ): block is Extract<(typeof blocks)[number], { kind: "reading-passage" }> =>
          block.kind === "reading-passage" &&
          block.sectionKind === "cet-reading-c",
      )
      .map((block) => block.partTitle);
    const questionNumbers = blocks
      .filter(
        (
          block,
        ): block is Extract<(typeof blocks)[number], { kind: "question" }> =>
          block.kind === "question" &&
          block.question.examSection?.kind === "cet-reading-c",
      )
      .map((block) => block.number);

    expect(partTitles.filter(Boolean)).toEqual(["Passage One", "Passage Two"]);
    expect(questionNumbers).toEqual([46, 47, 48, 49, 50, 51, 52, 53, 54, 55]);
  });
});

describe("CET-6 listening group order", () => {
  it("labels conversations, passages, and recordings before their own ranges", () => {
    const groups = [
      {
        kind: "cet-listening-a" as const,
        start: 1,
        counts: [4, 4],
        ids: ["c1", "c2"],
      },
      {
        kind: "cet-listening-b" as const,
        start: 9,
        counts: [4, 3],
        ids: ["p1", "p2"],
      },
      {
        kind: "cet-listening-c" as const,
        start: 16,
        counts: [3, 3, 4],
        ids: ["r1", "r2", "r3"],
      },
    ];
    const questions = groups.flatMap((group) =>
      group.ids.flatMap((groupId, groupIndex) =>
        Array.from({ length: group.counts[groupIndex] }, (_, index) => {
          const questionNumber =
            group.start +
            group.counts
              .slice(0, groupIndex)
              .reduce((sum, count) => sum + count, 0) +
            index;
          return (
          choice(
            `${groupId}-${index + 1}`,
            questionNumber,
            group.kind,
            `Question ${questionNumber}`,
            { groupId },
          ));
        }),
      ),
    );
    const blocks = buildPaperBlocks(
      {
        version: 1,
        title: "2026年10月29日六级模拟卷",
        questions,
      },
      settings,
      false,
    );
    const headings = blocks
      .filter(
        (
          block,
        ): block is Extract<(typeof blocks)[number], { kind: "group-heading" }> =>
          block.kind === "group-heading",
      )
      .map((block) => [block.title, block.questionRange]);

    expect(headings).toEqual([
      ["Conversation One", "Questions 1 to 4 are based on the conversation you have just heard."],
      ["Conversation Two", "Questions 5 to 8 are based on the conversation you have just heard."],
      ["Passage One", "Questions 9 to 12 are based on the passage you have just heard."],
      ["Passage Two", "Questions 13 to 15 are based on the passage you have just heard."],
      ["Recording One", "Questions 16 to 18 are based on the recording you have just heard."],
      ["Recording Two", "Questions 19 to 21 are based on the recording you have just heard."],
      ["Recording Three", "Questions 22 to 25 are based on the recording you have just heard."],
    ]);
  });
});

describe("Reading C generation contract", () => {
  it("tells the model to put a passage only on the first question per group", () => {
    const prompt = buildCet6StagePrompt("reading-c", {
      title: "Blueprint",
      topics: {
        writing: "writing",
        listening: "listening",
        reading: "reading",
        translation: "translation",
      },
    })
      .map((message) => message.content)
      .join("\n");

    expect(prompt).toContain(
      "Put the complete passage only on the first question of each passage group",
    );
    expect(prompt).toContain("other four questions in that group must omit");
  });
});
