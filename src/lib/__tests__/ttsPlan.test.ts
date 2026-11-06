import { describe, expect, it } from "vitest";
import { buildListeningSpeechPlan, parseConversationTurns } from "../tts/plan";
import type { ExamPaper } from "../types/exam";

function listeningQuestion(
  id: string,
  number: number,
  passage: string | undefined,
  groupId = "conversation-one",
) {
  return {
    id,
    type: "single-choice" as const,
    content: `What is said in question ${number}?`,
    options: ["A", "B", "C", "D"],
    correctAnswer: 0,
    score: 7.1,
    examSection: {
      kind: "cet-listening-a",
      groupId,
      questionNumber: number,
      passage,
    },
  };
}

describe("listening speech plan", () => {
  it("parses speaker turns", () => {
    expect(
      parseConversationTurns(
        "Woman: I lost my card.\nMan: When did it happen?\nIt was yesterday.",
      ),
    ).toEqual([
      { role: "female", text: "I lost my card." },
      { role: "male", text: "When did it happen? It was yesterday." },
    ]);
    expect(parseConversationTurns("Host: Welcome.\nGuest: Thank you.")).toEqual([
      { role: "female", text: "Welcome." },
      { role: "male", text: "Thank you." },
    ]);
  });

  it("keeps the group title separate from material and preserves answer pauses", () => {
    const passage =
      "Woman: Good morning. I need a new card.\nMan: I can help with that.";
    const paper: ExamPaper = {
      version: 1,
      title: "Test",
      questions: [
        listeningQuestion("q1", 1, passage),
        listeningQuestion("q2", 2, undefined),
      ],
    };

    const plan = buildListeningSpeechPlan(paper, 170);
    expect(plan.targetWpm).toBe(170);
    expect(
      plan.segments.find((segment) => segment.id === "conversation-one-title")
        ?.text,
    ).toBe("Conversation One");
    expect(
      plan.segments.find((segment) => segment.id === "conversation-one-title")
        ?.pauseAfterMs,
    ).toBe(650);
    expect(
      plan.segments.find((segment) => segment.id.includes("material-1-1"))?.text,
    ).toBe("Good morning.");
    expect(
      plan.segments.filter((segment) => segment.pauseAfterMs === 13_100),
    ).toHaveLength(2);
    expect(
      plan.segments.some((segment) =>
        segment.text.startsWith(
          "Questions 1 to 2 are based on the conversation",
        ),
      ),
    ).toBe(true);
    expect(
      plan.segments.some((segment) => /\b(?:Host|Guest):/.test(segment.text)),
    ).toBe(false);
  });

  it("rejects an unsupported speed", () => {
    expect(() =>
      buildListeningSpeechPlan({ version: 1, title: "Test", questions: [] }, 120),
    ).toThrow("targetWpm must be between 140 and 200");
  });
});
