import { describe, expect, it } from "vitest";
import type { Question } from "../types/exam";
import {
  balanceChoiceAnswers,
  createBalancedAnswerIndexes,
} from "../cet/answerOrder";

describe("answer balancing", () => {
  it("creates balanced answer positions without three consecutive repeats", () => {
    const indexes = createBalancedAnswerIndexes([2, 2, 3, 3], "paper");
    expect(indexes).toHaveLength(10);
    expect(
      [0, 1, 2, 3].map(
        (letter) => indexes.filter((index) => index === letter).length,
      ),
    ).toEqual([2, 2, 3, 3]);
    expect(
      indexes.some(
        (value, index) =>
          index >= 2 &&
          value === indexes[index - 1] &&
          value === indexes[index - 2],
      ),
    ).toBe(false);
  });

  it("avoids a three-repeat streak across listening section boundaries", () => {
    const indexes = createBalancedAnswerIndexes(
      [2, 2, 2, 1],
      "boundary-paper",
      [0, 0],
    );
    const sequence = [0, 0, ...indexes];
    expect(
      sequence.some(
        (value, index) =>
          index >= 2 &&
          value === sequence[index - 1] &&
          value === sequence[index - 2],
      ),
    ).toBe(false);
  });

  it("keeps the complete listening answer plan at A6/B6/C6/D7", () => {
    const counts = [
      [2, 2, 2, 2],
      [2, 2, 2, 1],
      [2, 2, 2, 4],
    ] as const;
    const answers: number[] = [];
    for (const [index, stageCounts] of counts.entries()) {
      answers.push(
        ...createBalancedAnswerIndexes(
          stageCounts,
          `listening-stage-${index}`,
          answers,
        ),
      );
    }
    expect(
      [0, 1, 2, 3].map(
        (letter) => answers.filter((answer) => answer === letter).length,
      ),
    ).toEqual([6, 6, 6, 7]);
    expect(
      answers.some(
        (value, index) =>
          index >= 2 &&
          value === answers[index - 1] &&
          value === answers[index - 2],
      ),
    ).toBe(false);
  });

  it("moves the correct option and remaps explanation letters", () => {
    const question: Question = {
      id: "q1",
      type: "single-choice",
      content: "Question",
      options: ["wrong A", "correct", "wrong B", "wrong C"],
      correctAnswer: 1,
      explanation:
        "原文说 “supporting evidence”。故 B 项正确；选项 C 张冠李戴；B) 正确；A) 无中生有；C) 张冠李戴；D) 程度偏移。故选 B。",
      score: 7.1,
      examSection: { kind: "cet-listening-a", questionNumber: 1 },
    };

    const [balanced] = balanceChoiceAnswers([question], [3]);
    expect(balanced.type).toBe("single-choice");
    if (balanced.type === "single-choice") {
      expect(balanced.options).toEqual([
        "wrong A",
        "wrong B",
        "wrong C",
        "correct",
      ]);
      expect(balanced.correctAnswer).toBe(3);
      expect(balanced.explanation).toContain("D) 正确");
      expect(balanced.explanation).toContain("故 D 项正确");
      expect(balanced.explanation).toContain("选项 B 张冠李戴");
      expect(balanced.explanation).toContain("故选 D");
    }
  });
});
