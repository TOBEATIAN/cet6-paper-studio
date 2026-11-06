import { describe, expect, it } from "vitest";
import type { Cet6Blueprint } from "../types/cet";
import { createReadingCPlan } from "../cet/readingCPlan";

const blueprint: Cet6Blueprint = {
  title: "Reading C plan",
  topics: {
    writing: "Testing",
    listening: "Testing",
    reading: "Repair culture and sleep science",
    readingC: {
      first: "Repair cafes and product longevity",
      second: "Sleep consistency and academic performance",
    },
    translation: "Testing",
  },
};

describe("Reading C generation plan", () => {
  it("creates two different passages with exam-valid question distributions", () => {
    const plan = createReadingCPlan(blueprint, "paper-1");
    const kinds = plan.passages.flatMap((passage) => passage.questionKinds);

    expect(plan.passages.map((passage) => passage.paragraphCount)).toEqual([
      8, 9,
    ]);
    expect(plan.passages[0].targetParagraphWords.reduce((a, b) => a + b)).toBe(
      450,
    );
    expect(plan.passages[1].targetParagraphWords.reduce((a, b) => a + b)).toBe(
      450,
    );
    for (const passage of plan.passages) {
      const lengths = passage.targetParagraphWords;
      const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
      const sigma = Math.sqrt(
        lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) /
          lengths.length,
      );
      expect(sigma).toBeGreaterThanOrEqual(26);
      expect(sigma).toBeLessThanOrEqual(28.6);
      expect(lengths[lengths.length - 1]).toBeGreaterThanOrEqual(100);
      expect(passage.sourceParagraphs).toHaveLength(5);
      expect(
        passage.sourceParagraphs.every(
          (paragraph, index) =>
            paragraph >= 1 &&
            paragraph <= passage.paragraphCount &&
            (index === 0 ||
              paragraph >= passage.sourceParagraphs[index - 1]),
        ),
      ).toBe(true);
    }
    expect(kinds.filter((kind) => kind === "detail").length).toBeGreaterThanOrEqual(6);
    expect(kinds.filter((kind) => kind === "detail").length).toBeLessThanOrEqual(8);
    expect(kinds.filter((kind) => kind === "inference").length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((kind) => kind === "inference").length).toBeLessThanOrEqual(3);
    expect(kinds.filter((kind) => kind === "attitude").length).toBe(1);
    expect(plan.passages[0].questionKinds[4]).toBe("attitude");
    expect(plan.passages[0].source.type).not.toBe(plan.passages[1].source.type);
  });

  it("keeps one paper stable while varying answer positions by paper", () => {
    const first = createReadingCPlan(blueprint, "paper-1");
    expect(createReadingCPlan(blueprint, "paper-1")).toEqual(first);
    expect(createReadingCPlan(blueprint, "paper-2").passages[0].answerIndexes)
      .not.toEqual(first.passages[0].answerIndexes);
  });

  it("balances the ten Reading C answers across A-D", () => {
    const indexes = createReadingCPlan(
      blueprint,
      "paper-balance",
    ).passages.flatMap((passage) => passage.answerIndexes);
    const counts = indexes.reduce<Record<number, number>>((result, index) => {
      result[index] = (result[index] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({ 0: 2, 1: 3, 2: 3, 3: 2 });
  });
});
