import { describe, expect, it } from "vitest";
import { buildListeningSpeechPlan, parseConversationTurns } from "../tts/plan";
import type { ExamPaper } from "../types/exam";

function listeningQuestion(
  id: string,
  number: number,
  passage: string | undefined,
  groupId = "conversation-one",
  kind = "cet-listening-a",
) {
  return {
    id,
    type: "single-choice" as const,
    content: `What is said in question ${number}?`,
    options: ["A", "B", "C", "D"],
    correctAnswer: 0,
    score: 7.1,
    examSection: {
      kind,
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

    const plan = buildListeningSpeechPlan(paper, 165);
    expect(plan.targetWpm).toBe(165);
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

  it("alternates B/C material and uses the opposite announcer voice", () => {
    const paper: ExamPaper = {
      version: 1,
      title: "Listening specialty",
      questions: [
        listeningQuestion(
          "b1",
          9,
          "Passage one transcript.",
          "passage-1",
          "cet-listening-b",
        ),
        listeningQuestion(
          "b2",
          12,
          "Passage two transcript.",
          "passage-2",
          "cet-listening-b",
        ),
        listeningQuestion(
          "c1",
          16,
          "Recording one transcript.",
          "recording-1",
          "cet-listening-c",
        ),
        listeningQuestion(
          "c2",
          19,
          "Recording two transcript.",
          "recording-2",
          "cet-listening-c",
        ),
        listeningQuestion(
          "c3",
          22,
          "Recording three transcript.",
          "recording-3",
          "cet-listening-c",
        ),
      ],
    };
    const plan = buildListeningSpeechPlan(paper, 165);
    const byId = (id: string) =>
      plan.segments.find((segment) => segment.id === id);

    expect(byId("opening")?.text).toContain("Sections B and C");
    expect(byId("passage-1-material-1-1")?.role).toBe("female");
    expect(byId("passage-1-title")?.role).toBe("male");
    expect(byId("passage-1-announcement")?.role).toBe("male");
    expect(byId("passage-1-question-9")?.role).toBe("male");
    expect(byId("passage-2-material-1-1")?.role).toBe("male");
    expect(byId("passage-2-title")?.role).toBe("female");
    expect(byId("recording-1-material-1-1")?.role).toBe("female");
    expect(byId("recording-1-question-16")?.role).toBe("male");
    expect(byId("recording-2-material-1-1")?.role).toBe("male");
    expect(byId("recording-2-question-19")?.role).toBe("female");
    expect(byId("recording-3-material-1-1")?.role).toBe("female");
    expect(byId("recording-3-question-22")?.role).toBe("male");
  });

  it("plans one-material specialty audio with singular directions", () => {
    const paper: ExamPaper = {
      version: 1,
      title: "Listening specialty",
      questions: [
        listeningQuestion(
          "b1",
          9,
          "Passage one transcript.",
          "passage-1",
          "cet-listening-b",
        ),
        listeningQuestion(
          "b2",
          10,
          undefined,
          "passage-1",
          "cet-listening-b",
        ),
        listeningQuestion(
          "b3",
          11,
          undefined,
          "passage-1",
          "cet-listening-b",
        ),
      ],
    };
    const plan = buildListeningSpeechPlan(paper, 165);

    expect(
      plan.segments.find((segment) => segment.id === "cet-listening-b-directions")
        ?.text,
    ).toContain("you will hear one passage");
    expect(
      plan.segments.filter((segment) => segment.id.endsWith("-announcement")),
    ).toHaveLength(1);
    expect(
      plan.segments.filter((segment) => segment.pauseAfterMs === 13_100),
    ).toHaveLength(3);
  });
});
