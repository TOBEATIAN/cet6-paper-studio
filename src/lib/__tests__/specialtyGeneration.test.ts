import { describe, expect, it } from "vitest";
import { buildCet6SpecialtyBlueprintPrompt } from "../cet/pipelinePrompts";
import {
  buildCet6Paper,
  parseCet6ReadingCQuestion,
  parseCet6ReadingCQuestions,
  validateCet6StageQuestions,
} from "../cet/generate";
import type { Question } from "../types/exam";
import { SpecialtyStageTopicsSchema } from "../types/cet";

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
      9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(paper.metadata?.totalScore).toBeCloseTo(49.7, 6);
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
});
