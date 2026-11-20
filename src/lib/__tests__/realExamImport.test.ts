import { describe, expect, it } from "vitest";
import {
  applyAnswerRows,
  answerTableForDraft,
  importedDraftIssues,
  importedDraftToPaper,
  mergeAnswerRows,
  mergeImportedPages,
} from "../import/realExamImport";
import { ImportedPaperDraftSchema } from "../types/import";

const evidence = (url: string) => ({
  title: "CET answer key",
  url,
  evidence: "46-50 A B C D A",
});

describe("real-exam import helpers", () => {
  it("merges continued passages without duplicating question numbers", () => {
    const draft = mergeImportedPages(
      [
        {
          title: "2025年6月大学英语六级考试真题",
          examDate: "2025-06",
          setLabel: "第二套",
          blocks: [
            {
              groupId: "reading-c-passage-1",
              stage: "reading-c",
              heading: "Passage One",
              examDate: "2025-06",
              setLabel: "第二套",
              passage: "First paragraph.",
              questions: [
                {
                  sourceQuestionNumber: 46,
                  content: "Question 46?",
                  options: ["A1", "B1", "C1", "D1"],
                  answerSources: [],
                  explanation: "",
                },
              ],
            },
          ],
          warnings: [],
        },
        {
          title: "",
          examDate: "",
          setLabel: "",
          blocks: [
            {
              groupId: "reading-c-passage-1",
              stage: "reading-c",
              heading: "",
              examDate: "",
              setLabel: "",
              passage: "Second paragraph.",
              questions: [
                {
                  sourceQuestionNumber: 46,
                  content: "",
                  options: [],
                  answerLetter: "A",
                  answerSources: [],
                  explanation: "",
                },
                {
                  sourceQuestionNumber: 47,
                  content: "Question 47?",
                  options: ["A2", "B2", "C2", "D2"],
                  answerSources: [],
                  explanation: "",
                },
              ],
            },
          ],
          warnings: ["Split passage detected"],
        },
      ],
      {
        mode: "section",
        selectedStages: ["reading-c"],
        sourceFileName: "paper.pdf",
      },
    );
    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0].passage).toContain("First paragraph.");
    expect(draft.blocks[0].passage).toContain("Second paragraph.");
    expect(draft.blocks[0].questions).toHaveLength(2);
    expect(draft.blocks[0].questions[0]).toMatchObject({
      content: "Question 46?",
      answerLetter: "A",
    });
  });

  it("renumbers composite Reading C while retaining source numbers", () => {
    const questions = (start: number) =>
      Array.from({ length: 5 }, (_, index) => ({
        sourceQuestionNumber: start + index,
        content: `Source question ${start + index}`,
        options: ["One context", "Two context", "Three context", "Four context"],
        answerLetter: "A",
        explanation: "",
      }));
    const draft = ImportedPaperDraftSchema.parse({
      mode: "section",
      selectedStages: ["reading-c"],
      title: "Composite Reading C",
      examDate: "2025-06",
      setLabel: "第一套 + 第二套",
      sourceFileName: "combined.pdf",
      blocks: [
        {
          groupId: "set-a-passage-1",
          stage: "reading-c",
          heading: "Passage One",
          passage: "Passage one text.",
          questions: questions(46),
        },
        {
          groupId: "set-b-passage-2",
          stage: "reading-c",
          heading: "Passage Two",
          passage: "Passage two text.",
          questions: questions(46),
        },
      ],
      warnings: [],
    });
    const paper = importedDraftToPaper(draft, { answersConfirmed: true });
    expect(paper.questions.map((question) => question.examSection?.questionNumber)).toEqual([
      46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
    ]);
    expect(
      paper.questions.map(
        (question) =>
          question.examSection?.sourceExam?.sourceQuestionNumber,
      ),
    ).toEqual([46, 47, 48, 49, 50, 46, 47, 48, 49, 50]);
    expect(paper.practiceScope?.mode).toBe("imported");
    expect(paper.questions[0].answerProvenance).toMatchObject({
      status: "provided",
      confirmed: true,
    });
  });

  it("distinguishes consensus, single-source and conflicting answers", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "section",
      selectedStages: ["reading-c"],
      blocks: [
        {
          groupId: "passage-1",
          stage: "reading-c",
          heading: "Passage One",
          passage: "Passage",
          questions: [
            {
              sourceQuestionNumber: 46,
              content: "46",
              options: ["A", "B", "C", "D"],
            },
            {
              sourceQuestionNumber: 47,
              content: "47",
              options: ["A", "B", "C", "D"],
            },
            {
              sourceQuestionNumber: 48,
              content: "48",
              options: ["A", "B", "C", "D"],
            },
          ],
        },
      ],
    });
    const result = mergeAnswerRows(
      draft,
      JSON.stringify({
        answers: [
          {
            stage: "reading-c",
        groupId: "passage-1",
            sourceQuestionNumber: 46,
            answerLetter: "A",
            sources: [
              evidence("https://one.example/answers"),
              evidence("https://two.example/answers"),
            ],
          },
          {
            stage: "reading-c",
            sourceQuestionNumber: 47,
            answerLetter: "B",
            sources: [evidence("https://one.example/answers")],
          },
          {
            stage: "reading-c",
            sourceQuestionNumber: 48,
            answerLetter: "C",
            sources: [evidence("https://one.example/answers")],
          },
          {
            stage: "reading-c",
            sourceQuestionNumber: 48,
            answerLetter: "D",
            sources: [evidence("https://two.example/answers")],
          },
        ],
      }),
      "test query",
    );
    expect(result.rows[0].status).toBe("consensus");
    expect(result.rows[1].status).toBe("single-source");
    expect(result.rows[2].status).toBe("conflict");
    expect(answerTableForDraft(draft).rows.every((row) => row.status === "missing")).toBe(true);
  });

  it("applies manually confirmed answers to a draft", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "section",
      blocks: [
        {
          groupId: "passage-1",
          stage: "reading-c",
          questions: [
            {
              sourceQuestionNumber: 46,
              content: "46",
              options: ["A", "B", "C", "D"],
            },
          ],
        },
      ],
    });
    const next = applyAnswerRows(draft, [
      {
        stage: "reading-c",
        groupId: "passage-1",
        sourceQuestionNumber: 46,
        answerLetter: "D",
        status: "manual",
        sources: [],
      },
    ]);
    expect(next.blocks[0].questions[0].answerLetter).toBe("D");
    expect(next.blocks[0].questions[0].answerStatus).toBe("manual");
  });

  it("accepts an official full set that intentionally omits listening", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "full",
      setLabel: "第三套",
      blocks: [
        {
          groupId: "writing",
          stage: "writing",
          questions: [{ content: "Writing prompt" }],
        },
        {
          groupId: "translation",
          stage: "translation",
          questions: [{ content: "Translation prompt" }],
        },
      ],
    });
    expect(importedDraftIssues(draft)).toEqual([]);
  });
});
