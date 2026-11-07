import { describe, expect, it } from "vitest";
import type { Question } from "../types/exam";
import {
  applyReadingCRiskDecisions,
  collectReadingCRisks,
  isValidReadingCRiskReview,
} from "../cet/readingCRisk";
import { auditCet6Stage } from "../cet/quality/audit";

const passage =
  "Miriam Chen led a six-week daylight pilot for 120 pupils.\nThe final report found a 30 percent reduction in missed classes among participating pupils.\nIt also noted three rooms with projector glare.";

function riskyQuestion(): Question {
  return {
    id: "q46",
    type: "single-choice",
    score: 14.2,
    content:
      "What did the final report say about missed classes during the daylight pilot?",
    options: [
      "The report found a 30 percent reduction in missed classes among participating pupils.",
      "The report found a 30 percent reduction in missed classes among all pupils everywhere.",
      "The pilot moved every lesson into brighter rooms.",
      "The pilot ended all projector glare in classrooms.",
    ],
    correctAnswer: 0,
    explanation: "中文解析。",
    examSection: {
      kind: "cet-reading-c",
      groupId: "passage-1",
      questionNumber: 46,
      para: 2,
      questionKind: "detail",
      passage,
    },
  };
}

describe("Reading C strong-distractor adjudication", () => {
  it("detects same-sentence and dominant-distractor risks", () => {
    const risks = collectReadingCRisks([riskyQuestion()]);

    expect(risks).toHaveLength(1);
    expect(risks[0].letter).toBe("B");
    expect(risks[0].types).toEqual(
      expect.arrayContaining(["same-sentence", "dual-support"]),
    );
    expect(risks[0].supportSentence).toContain("30 percent");
  });

  it("rejects generic reviews and accepts a verbatim passage anchor", () => {
    const question = riskyQuestion();
    const risks = collectReadingCRisks([question]);
    const generic = applyReadingCRiskDecisions([question], risks, [
      {
        questionNumber: 46,
        letter: "B",
        decision: "keep",
        errorType: "程度偏移",
        passageEvidence: "30 percent reduction in missed classes",
        optionError: "不够准确",
        distinguishingReason: "不如正确项",
      },
    ]);
    expect(generic.unresolved).toHaveLength(1);
    expect(generic.questions[0].examSection?.readingCRiskReviews).toBeUndefined();
    const blocked = auditCet6Stage("reading-c", generic.questions).checks.find(
      (check) => check.id === "reading-c:same-sentence-review",
    );
    expect(blocked?.passed).toBe(false);

    const resolved = applyReadingCRiskDecisions([question], risks, [
      {
        questionNumber: 46,
        letter: "B",
        decision: "keep",
        errorType: "程度偏移",
        passageEvidence: "30 percent reduction in missed classes",
        optionError:
          "all pupils everywhere changes the measured participating-pupil group into an unlimited population",
        distinguishingReason:
          "The question asks what the report found for participating pupils; the option changes the scope to every pupil everywhere.",
      },
    ]);
    expect(resolved.unresolved).toHaveLength(0);
    const review = resolved.questions[0].examSection?.readingCRiskReviews?.[0];
    expect(review?.errorType).toBe("程度偏移");
    expect(review && isValidReadingCRiskReview(risks[0], review)).toBe(true);
    const passed = auditCet6Stage("reading-c", resolved.questions).checks.find(
      (check) => check.id === "reading-c:same-sentence-review",
    );
    expect(passed?.passed).toBe(true);
  });

  it("rejects evidence that is not an exact passage phrase", () => {
    const question = riskyQuestion();
    const risk = collectReadingCRisks([question])[0];
    expect(
      isValidReadingCRiskReview(risk, {
        types: ["same-sentence", "dual-support"],
        option: risk.option,
        correctOption: risk.correctOption,
        errorType: "程度偏移",
        passageEvidence: "all pupils missed almost every class",
        optionError:
          "all pupils everywhere changes the measured participating-pupil group",
        distinguishingReason:
          "The option changes the measured participating-pupil scope into an unlimited population.",
      }),
    ).toBe(false);
  });
});
