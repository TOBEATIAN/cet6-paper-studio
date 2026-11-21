import { describe, expect, it } from "vitest";
import {
  buildCet6ReadingCSingleRiskRepairPrompt,
  buildCet6SpecialtyBlueprintPrompt,
  buildCet6StagePrompt,
} from "../cet/pipelinePrompts";
import {
  buildCet6Paper,
  parseCet6ReadingCQuestion,
  parseCet6ReadingCQuestions,
  validateCet6StageQuestions,
} from "../cet/generate";
import type { Question } from "../types/exam";
import { SpecialtyStageTopicsSchema } from "../types/cet";
import type { Cet6ContentStage } from "../types/cet";
import { cet6StageGroups } from "../cet/structure";

describe("specialty generation", () => {
  it("builds a blueprint prompt only for selected stages", () => {
    const prompt = buildCet6SpecialtyBlueprintPrompt(
      ["listening-b", "reading-a"],
      {
        ...SpecialtyStageTopicsSchema.parse({}),
        "listening-b": "校园科技",
      },
    )
      .map((message) => message.content)
      .join("\n");
    expect(prompt).toContain("Develop only these listening cases: listening-b");
    expect(prompt).toContain("Develop only these reading forms: reading-a");
    expect(prompt).toContain("Set writing to Not selected");
    expect(prompt).toContain("- listening-b: 校园科技");
  });

  it("builds a single-article Reading C specialty blueprint", () => {
    const prompt = buildCet6SpecialtyBlueprintPrompt(
      ["reading-c"],
      {
        ...SpecialtyStageTopicsSchema.parse({}),
        "reading-c": {
          first: "每日进步1%",
          second: "Not selected",
        },
      },
    )
      .map((message) => message.content)
      .join("\n");
    expect(prompt).toContain("single close-reading article focus");
    expect(prompt).toContain("Specialty Reading C contains one article and Q46-50 only");
    expect(prompt).not.toContain("Develop two distinct Reading C");
  });

  it("scopes each specialty listening section to one material and its first group", () => {
    const cases = {
      a1: "campus bike repair",
      a2: "not used",
      b1: "library noise study",
      b2: "not used",
      c1: "urban cooling lecture",
      c2: "not used",
      c3: "not used",
    };
    const blueprint = {
      title: "Listening specialty",
      topics: {
        writing: "unused",
        listening: "selected",
        listeningCases: cases,
        reading: "unused",
        translation: "unused",
      },
    };
    const expected = [
      ["listening-a", 4, "Put exactly one complete conversation transcript"],
      [
        "listening-b",
        3,
        "Put exactly one complete listening-passage transcript",
      ],
      ["listening-c", 4, "Put exactly one complete lecture/talk transcript"],
    ] as const satisfies ReadonlyArray<
      readonly [Cet6ContentStage, number, string]
    >;
    for (const [stage, count, material] of expected) {
      const prompt = buildCet6StagePrompt(
        stage,
        blueprint,
        undefined,
        {
          listeningSingleGroup: true,
          listeningAnswerIndexes:
            count === 4 ? [0, 1, 2, 3] : [0, 1, 2],
        },
      )
        .map((message) => message.content)
        .join("\n");
      expect(prompt).toContain(`exact question count: ${count}`);
      expect(prompt).toContain(material);
      expect(prompt).toContain("Do not develop the other listening cases");
    }
    expect(
      cet6StageGroups("listening-a", { listeningSingleGroup: true })[0]
        .questionNumbers,
    ).toEqual([1, 2, 3, 4]);
    expect(
      cet6StageGroups("listening-b", { listeningSingleGroup: true })[0]
        .questionNumbers,
    ).toEqual([9, 10, 11]);
    expect(
      cet6StageGroups("listening-c", { listeningSingleGroup: true })[0]
        .questionNumbers,
    ).toEqual([22, 23, 24, 25]);
  });

  it("uses the selected three- or four-question listening material", () => {
    const topics = {
      ...SpecialtyStageTopicsSchema.parse({}),
      "listening-b": "campus",
      "listening-c": "science",
    };
    const counts = {
      "listening-b": 4 as const,
      "listening-c": 3 as const,
    };
    expect(
      cet6StageGroups("listening-b", {
        listeningSingleGroup: true,
        listeningQuestionCounts: counts,
      })[0].questionNumbers,
    ).toEqual([12, 13, 14, 15]);
    expect(
      cet6StageGroups("listening-c", {
        listeningSingleGroup: true,
        listeningQuestionCounts: counts,
      })[0].questionNumbers,
    ).toEqual([16, 17, 18]);
    const blueprintPrompt = buildCet6SpecialtyBlueprintPrompt(
      ["listening-b", "listening-c"],
      topics,
      counts,
    )
      .map((message) => message.content)
      .join("\n");
    expect(blueprintPrompt).toContain("b2 for Listening B");
    expect(blueprintPrompt).toContain("c1 for Listening C");
    const stagePrompt = buildCet6StagePrompt(
      "listening-b",
      {
        title: "Listening practice",
        topics: {
          writing: "unused",
          listening: "selected",
          listeningCases: {
            a1: "unused",
            a2: "unused",
            b1: "three-question passage",
            b2: "four-question passage",
            c1: "unused",
            c2: "unused",
            c3: "unused",
          },
          reading: "unused",
          translation: "unused",
        },
      },
      undefined,
      {
        listeningSingleGroup: true,
        listeningQuestionCounts: counts,
        listeningAnswerIndexes: [0, 1, 2, 3],
      },
    )
      .map((message) => message.content)
      .join("\n");
    expect(stagePrompt).toContain("exact question count: 4");
    expect(stagePrompt).toContain("B2: four-question passage");
    expect(stagePrompt).toContain("numbering 12-15");
  });

  it("preserves section numbering and score for a one-section paper", () => {
    const questions: Question[] = Array.from({ length: 7 }, (_, index) => ({
      id: `b-${index + 1}`,
      type: "single-choice" as const,
      content: `Question ${index + 9}`,
      options: ["One", "Two", "Three", "Four"],
      correctAnswer: index % 4,
      explanation: "故选 A。",
      score: 7.1,
      examSection: {
        kind: "cet-listening-b",
        groupId: index < 3 ? "passage-1" : "passage-2",
        questionNumber: index + 9,
        ...(index === 0 || index === 3
          ? { passage: `Transcript ${index < 3 ? 1 : 2}.` }
          : {}),
      },
    }));
    const paper = buildCet6Paper(
      { "listening-b": questions },
      new Date("2026-11-19T12:00:00Z"),
      {
        mode: "specialty",
        selectedStages: ["listening-b"],
        stageTopics: SpecialtyStageTopicsSchema.parse({}),
        focusTopic: "campus",
      },
    );
    expect(paper.questions.map((question) => question.examSection?.questionNumber)).toEqual([
      9, 10, 11,
    ]);
    expect(paper.metadata?.totalScore).toBeCloseTo(21.3, 6);
    expect(paper.metadata?.duration).toBe(30);
    expect(paper.practiceScope).toMatchObject({
      mode: "specialty",
      selectedStages: ["listening-b"],
    });
  });

  it("moves the correct Reading C content to the planned answer letter", () => {
    const reply = JSON.stringify({
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `q${46 + index}`,
        type: "single-choice",
        content: `Question ${46 + index} asks about the fixed passage.`,
        options: [
          `Correct option ${index + 1} synthesized across two clauses.`,
          `Wrong actor option ${index + 1} grounded in another clause.`,
          `Wrong scope option ${index + 1} grounded in the passage.`,
          `Wrong time option ${index + 1} grounded in the passage.`,
        ],
        correctAnswer: 0,
        explanation:
          "A) 对应原文但需改写。 B) 人物错误。 C) 范围错误。 D) 时间错误。故选 A。",
        score: 14.2,
      })),
    });
    const parsed = parseCet6ReadingCQuestions(
      reply,
      "Fixed passage",
      0,
      [1, 2, 3, 4, 5],
      ["detail", "detail", "detail", "inference", "attitude"],
      [1, 2, 3, 0, 1],
      { outlet: "The Atlantic", type: "评论", topic: "practice" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const choices = parsed.value.filter(
      (
        question,
      ): question is Extract<Question, { type: "single-choice" }> =>
        question.type === "single-choice",
    );
    expect(choices.map((question) => question.correctAnswer)).toEqual([
      1, 2, 3, 0, 1,
    ]);
    expect(choices[0].options[1]).toContain("Correct option 1");
    expect(choices[0].explanation).toContain("故选 B");
    expect(
      validateCet6StageQuestions("reading-c", parsed.value, {
        readingCSinglePassage: true,
      }),
    ).toEqual([]);
  });

  it("parses one repaired Reading C question without rewriting its group", () => {
    const reply = JSON.stringify({
      questions: [
        {
          id: "repaired-q48",
          type: "single-choice",
          content:
            "What contrast does the passage draw between steady practice and brief intensive study?",
          options: [
            "Steady practice leaves only vivid memories of hard work.",
            "Brief intensive study guarantees stronger retention in every case.",
            "Steady practice builds modest fluency while brief study mainly feels effortful.",
            "Both approaches produce identical retention whenever total hours match.",
          ],
          correctAnswer: 0,
          explanation:
            "A) 正确概括。 B) 绝对化。 C) 张冠李戴。 D) 无中生有。故选 A。",
          score: 14.2,
        },
      ],
    });
    const parsed = parseCet6ReadingCQuestion(
      reply,
      "A fixed passage.",
      0,
      2,
      4,
      "detail",
      2,
      { outlet: "六级智卷原创编辑部", type: "研究报告", topic: "practice" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.type !== "single-choice") return;
    expect(parsed.value.correctAnswer).toBe(2);
    expect(parsed.value.examSection?.questionNumber).toBe(48);
    expect(parsed.value.options[2]).toContain(
      "Steady practice leaves only vivid memories",
    );
  });

  it("repairs a strong-distractor risk as one exact question", () => {
    const prompt = buildCet6ReadingCSingleRiskRepairPrompt(
      {
        index: 0,
        paragraphCount: 8,
        targetParagraphWords: [20, 30, 35, 40, 55, 80, 90, 100],
        sourceParagraphs: [2, 3, 5, 6, 8],
        questionKinds: ["detail", "detail", "inference", "detail", "attitude"],
        answerIndexes: [1, 2, 3, 0, 1],
        source: {
          outlet: "六级智卷原创编辑部",
          type: "研究报告",
          topic: "practice",
        },
      },
      "A frozen article passage.",
      {
        id: "cet6-reading-c-1-5",
        type: "single-choice",
        content: "What is the passage's attitude toward daily percentages?",
        options: ["One", "Two", "Three", "Four"],
        correctAnswer: 1,
        explanation: "中文解析。故选 B。",
        score: 14.2,
        examSection: {
          kind: "cet-reading-c",
          groupId: "passage-1",
          questionNumber: 50,
          para: 7,
          questionKind: "attitude",
        },
      },
      4,
      "Q50-D is too strongly supported and must be rewritten.",
    )
      .map((message) => message.content)
      .join("\n");
    expect(prompt).toContain("Repair only Reading Section C question 50");
    expect(prompt).toContain("Return exactly one question object");
    expect(prompt).toContain("Q50-D is too strongly supported");
    expect(prompt).not.toContain("Return exactly five questions");
  });
});
