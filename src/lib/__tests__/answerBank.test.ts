import { describe, expect, it } from "vitest";
import {
  entriesFromConfirmedDraft,
  lookupBankAnswers,
  mergeAnswerBank,
} from "../import/answerBank";
import { AnswerBankSchema } from "../types/answerBank";
import { ImportedPaperDraftSchema, type AnswerSearchRow } from "../types/import";

function block(
  groupId: string,
  setLabel: string,
  passage: string,
  answerOffset: number,
) {
  return {
    groupId,
    stage: "reading-c" as const,
    heading: groupId,
    examDate: "2025-06",
    setLabel,
    passage,
    questions: Array.from({ length: 5 }, (_, index) => ({
      sourceQuestionNumber: 46 + index,
      content: `${setLabel} source question ${46 + index}`,
      options: ["One context", "Two context", "Three context", "Four context"],
      answerLetter: String.fromCharCode(65 + ((index + answerOffset) % 4)),
      answerSources: [],
      explanation: "",
    })),
  };
}

function rowsForDraft(
  draft: ReturnType<typeof ImportedPaperDraftSchema.parse>,
): AnswerSearchRow[] {
  return draft.blocks.flatMap((item) =>
    item.questions
      .filter((question) => question.sourceQuestionNumber != null)
      .map((question) => ({
        stage: "reading-c" as const,
        groupId: item.groupId,
        sourceQuestionNumber: question.sourceQuestionNumber ?? 0,
        answerLetter: question.answerLetter?.toUpperCase(),
        status: "manual" as const,
        sources: [],
      })),
  );
}

describe("answer bank", () => {
  it("matches composite Reading C passages independently by signature", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "section",
      selectedStages: ["reading-c"],
      examDate: "2025-06",
      setLabel: "第一套 + 第二套",
      blocks: [
        block(
          "set-a-passage-1",
          "第一套",
          "First set passage begins with urban forests and ends with public health evidence.",
          0,
        ),
        block(
          "set-b-passage-2",
          "第二套",
          "Second set passage begins with ocean research and ends with conservation policy evidence.",
          1,
        ),
      ],
    });
    const bank = AnswerBankSchema.parse({
      entries: entriesFromConfirmedDraft(draft, rowsForDraft(draft)),
    });

    const reordered = ImportedPaperDraftSchema.parse({
      ...draft,
      blocks: [...draft.blocks].reverse(),
    });
    const result = lookupBankAnswers(reordered, bank);
    expect(result.rows).toHaveLength(10);
    expect(result.rows.every((row) => row.status === "bank")).toBe(true);
    expect(result.rows.filter((row) => row.groupId === "set-b-passage-2")[0]).toMatchObject({
      sourceQuestionNumber: 46,
      answerLetter: "B",
    });
    expect(result.rows.filter((row) => row.groupId === "set-a-passage-1")[0]).toMatchObject({
      sourceQuestionNumber: 46,
      answerLetter: "A",
    });
  });

  it("keeps conflicting bank answers blocked", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "section",
      selectedStages: ["reading-c"],
      examDate: "2025-06",
      blocks: [
        block(
          "passage-1",
          "第一套",
          "Unique passage first sentence and final sentence for matching.",
          0,
        ),
      ],
    });
    const base = AnswerBankSchema.parse({
      entries: entriesFromConfirmedDraft(draft, rowsForDraft(draft)),
    });
    const conflicting = AnswerBankSchema.parse({
      entries: base.entries.map((entry) =>
        entry.sourceQuestionNumber === 46
          ? { ...entry, id: `${entry.id}|other`, answerLetter: "D" }
          : entry,
      ),
    });
    const merged = mergeAnswerBank(base, conflicting);
    const result = lookupBankAnswers(draft, merged);
    expect(result.rows.find((row) => row.sourceQuestionNumber === 46)?.status).toBe(
      "conflict",
    );
  });

  it("never overrides answers parsed from the exam's own answer page", () => {
    const embedded = ImportedPaperDraftSchema.parse({
      mode: "section",
      selectedStages: ["reading-c"],
      examDate: "2025-06",
      setLabel: "第一套",
      blocks: [
        {
          groupId: "passage-1",
          stage: "reading-c",
          passage: "Unique embedded-key passage for matching.",
          questions: [
            {
              sourceQuestionNumber: 46,
              content: "46",
              options: ["A", "B", "C", "D"],
              answerLetter: "A",
              answerStatus: "official",
            },
          ],
        },
      ],
    });
    const bank = AnswerBankSchema.parse({
      entries: [
        {
          id: "conflict",
          examDate: "2025-06",
          setLabel: "第一套",
          stage: "reading-c",
          groupId: "passage-1",
          sourceQuestionNumber: 46,
          answerLetter: "D",
          status: "single-source",
          sources: [],
          signature: { first: "", last: "", wordCount: 0 },
          confirmedAt: "2026-11-20T00:00:00.000Z",
        },
      ],
    });
    expect(lookupBankAnswers(embedded, bank).rows[0]).toMatchObject({
      answerLetter: "A",
      status: "official",
    });
  });
});
