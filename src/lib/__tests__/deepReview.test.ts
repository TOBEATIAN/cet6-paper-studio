import { describe, expect, it } from "vitest";
import { analyzeReview } from "../review/analysis";
import {
  buildDeepReviewMessages,
  buildSingleAnswerReviewMessages,
  parseDeepReviewReply,
  reviewSchedule,
} from "../review/deepReview";
import type { ExamPaper } from "../types/exam";

function paper(): ExamPaper {
  return {
    version: 1,
    title: "测试六级卷",
    questions: [
      {
        id: "q1",
        type: "single-choice",
        content: "Why did the town restore the market?",
        options: [
          "To attract private offices.",
          "To support daily public use.",
          "To close the bus station.",
          "To reduce local employment.",
        ],
        correctAnswer: 1,
        explanation:
          "原文说 “restore the market for daily public use”，故选 B。A 无据；C 与原文相反；D 无据。",
        score: 7.1,
        examSection: {
          kind: "cet-listening-a",
          groupId: "g1",
          questionNumber: 1,
          passage:
            "The town restored its market for daily public use, not to attract private offices.",
        },
      },
      {
        id: "writing",
        type: "essay",
        content:
          "Directions: Write an essay. Opening sentence: “Universities should teach students to serve the public good.”",
        writingGuidance: "先说明公共责任，再给具体例子。",
        scoringCriteria: "按官方五档定档。",
        score: 106.5,
        examSection: { kind: "cet-writing" },
      },
      {
        id: "translation",
        type: "short-answer",
        content: "这座市场方便了居民的日常生活。",
        referenceAnswer: "The market makes daily life easier for local residents.",
        scoringPoints: ["daily life", "local residents"],
        score: 106.5,
        examSection: { kind: "cet-translation" },
      },
    ],
  };
}

describe("deep review workflow", () => {
  it("sends the selected option, passage, official rubric, and four layers", () => {
    const source = paper();
    const analysis = analyzeReview(source, {
      answers: { "1": "A" },
      writingAnswer: "Public universities should help communities.",
      translationAnswer: "This market helps residents.",
    });
    const messages = buildDeepReviewMessages({
      paper: source,
      analysis,
      reviewCreatedAt: "2026-11-01T09:00:00.000Z",
      reviewNotes: "Q1 我当时很确定。",
      readingArticleCard: "C1 生词：restore = 修复",
      previousReviews: [
        {
          createdAt: "2026-10-30T09:00:00.000Z",
          objectiveScore: 400,
          writingScore: 8,
          translationScore: 7,
          totalScore: 506.5,
          errorTypes: ["无据"],
        },
      ],
    });
    const prompt = messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("事实、归因、模式、动作");
    expect(prompt).toContain("学生选择：A — To attract private offices.");
    expect(prompt).toContain("标准答案：B — To support daily public use.");
    expect(prompt).toContain("14 分档（13-15）");
    expect(prompt).toContain("先自己拆，再用 AI 对");
    expect(prompt).toContain("Q1 我当时很确定。");
    expect(prompt).toContain("无据");
  });

  it("creates the established D+1/3/7/16/35 schedule", () => {
    expect(reviewSchedule("2026-11-01T09:00:00.000Z")).toEqual([
      { label: "D+1", date: "2026-11-02" },
      { label: "D+3", date: "2026-11-04" },
      { label: "D+7", date: "2026-11-08" },
      { label: "D+16", date: "2026-11-17" },
      { label: "D+35", date: "2026-12-06" },
    ]);
  });

  it("keeps the one-click revision on the same official rubric", () => {
    const source = paper();
    const writing = source.questions.find(
      (question) => question.examSection?.kind === "cet-writing",
    );
    if (!writing) throw new Error("fixture changed");
    const prompt = buildSingleAnswerReviewMessages(
      "writing",
      writing,
      "Public universities should help communities.",
    )
      .map((message) => message.content)
      .join("\n");

    expect(prompt).toContain("先定档、再定档内分");
    expect(prompt).toContain("14 分档（13-15）");
    expect(prompt).toContain("S1 句法骨架");
    expect(prompt).toContain("离下一档差什么");
  });

  it("parses the structured report and keeps legacy text as a fallback", () => {
    const report =
      Array.from({ length: 9 }, (_, index) => `## ${index} 栏目${index}`).join(
        "\n",
      ) +
      "\nD+1 D+3 D+7 D+16 D+35\n" +
      "完整报告。".repeat(30);
    expect(
      parseDeepReviewReply(
        JSON.stringify({
          markdown: report,
          writingScore: 8,
          translationScore: 7,
          errorTypes: ["无据", "无据", "与原文相反"],
        }),
      ),
    ).toEqual({
      markdown: report,
      writingScore: 8,
      translationScore: 7,
      errorTypes: ["无据", "与原文相反"],
    });
    expect(parseDeepReviewReply(report)).toEqual({
      markdown: report,
      errorTypes: [],
    });
  });

  it("rejects a long prose answer that omits the required review sections", () => {
    expect(() =>
      parseDeepReviewReply("这段文字足够长，但没有规定的复盘栏目。".repeat(12)),
    ).toThrow(/缺少复盘栏目/);
  });
});
