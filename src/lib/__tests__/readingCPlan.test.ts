import { describe, expect, it } from "vitest";
import type { Cet6Blueprint } from "../types/cet";
import {
  createReadingCPlan,
  readingCHistoryEntryFromQuestions,
  type ReadingCHistoryEntry,
} from "../cet/readingCPlan";
import type { Question } from "../types/exam";

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

    const paragraphCounts = plan.passages.map(
      (passage) => passage.paragraphCount,
    );
    expect(paragraphCounts.every((count) => count >= 6 && count <= 12)).toBe(
      true,
    );
    expect(paragraphCounts[0]).not.toBe(paragraphCounts[1]);
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

  it("rotates away from the latest kind pattern and source-type pair", () => {
    const baseline = createReadingCPlan(blueprint, "history-aware-paper");
    const history: ReadingCHistoryEntry[] = [
      {
        questionKinds: baseline.passages.flatMap(
          (passage) => passage.questionKinds,
        ),
        sourceTypes: [
          baseline.passages[0].source.type,
          baseline.passages[1].source.type,
        ],
        paragraphCounts: [8, 9],
      },
    ];
    const next = createReadingCPlan(
      blueprint,
      "history-aware-paper",
      history,
    );

    expect(next.passages.flatMap((passage) => passage.questionKinds)).not.toEqual(
      history[0].questionKinds,
    );
    expect([
      next.passages[0].source.type,
      next.passages[1].source.type,
    ]).not.toEqual(history[0].sourceTypes);
    expect(next.passages.map((passage) => passage.paragraphCount)).not.toEqual(
      history[0].paragraphCounts,
    );
  });

  it("keeps every source type within two uses across recent papers", () => {
    const baseline = createReadingCPlan(blueprint, "source-history-paper");
    const history: ReadingCHistoryEntry[] = [
      {
        questionKinds: baseline.passages.flatMap(
          (passage) => passage.questionKinds,
        ),
        sourceTypes: ["研究报告", "评论"],
        paragraphCounts: [8, 9],
      },
      {
        questionKinds: baseline.passages.flatMap(
          (passage) => passage.questionKinds,
        ),
        sourceTypes: ["研究报告", "评论"],
        paragraphCounts: [8, 9],
      },
      {
        questionKinds: baseline.passages.flatMap(
          (passage) => passage.questionKinds,
        ),
        sourceTypes: ["科普", "法律医学"],
        paragraphCounts: [8, 9],
      },
      {
        questionKinds: baseline.passages.flatMap(
          (passage) => passage.questionKinds,
        ),
        sourceTypes: ["科普", "商业"],
        paragraphCounts: [8, 9],
      },
    ];
    const next = createReadingCPlan(
      blueprint,
      "source-history-paper",
      history,
    );
    const counts = new Map<string, number>();
    for (const type of [
      ...history.flatMap((entry) => entry.sourceTypes),
      ...next.sourceTypes,
    ]) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("extracts only aggregate history metadata from an existing paper", () => {
    const plan = createReadingCPlan(blueprint, "history-extraction");
    const questions = plan.passages.flatMap((passage) =>
      passage.questionKinds.map(
        (kind, offset): Question => ({
          id: `q${46 + passage.index * 5 + offset}`,
          type: "single-choice",
          content: `Question ${offset + 1}`,
          options: ["one two three", "one two four", "one two five", "one two six"],
          correctAnswer: passage.answerIndexes[offset],
          score: 14.2,
          examSection: {
            kind: "cet-reading-c",
            groupId: `passage-${passage.index + 1}`,
            questionNumber: 46 + passage.index * 5 + offset,
            questionKind: kind,
            passage:
              offset === 0
                ? Array.from(
                    { length: passage.paragraphCount },
                    (_, index) => `Paragraph ${index + 1}`,
                  ).join("\n")
                : undefined,
            source: offset === 0 ? passage.source : undefined,
          },
        }),
      ),
    );
    const history = readingCHistoryEntryFromQuestions(questions);

    expect(history).toEqual({
      questionKinds: plan.passages.flatMap((passage) => passage.questionKinds),
      sourceTypes: plan.sourceTypes,
      paragraphCounts: plan.passages.map(
        (passage) => passage.paragraphCount,
      ) as [number, number],
    });
    expect(JSON.stringify(history)).not.toContain("Paragraph 1");
  });
});
