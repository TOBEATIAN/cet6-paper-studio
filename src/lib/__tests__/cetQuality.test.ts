import { describe, expect, it } from "vitest";
import type { ExamPaper, Question } from "../types/exam";
import {
  auditCet6Stage,
  auditReadingBPassage,
} from "../cet/quality/audit";
import {
  contentWords,
  specificInfoCount,
  supportOverlapRatio,
  wordCount,
} from "../cet/quality/textMetrics";
import { analyzeReview, parseImportedAnswers } from "../review/analysis";
import { createCet6PaperTitle } from "../exam/paperTitle";
import { applyTranslationGlossary } from "../exam/translationGlossary";

function listeningQuestions(): Question[] {
  let n = 1;
  return [0, 1].flatMap((group) =>
    Array.from({ length: 4 }, (_, index) => ({
      id: `q-${n}`,
      type: "single-choice" as const,
      content: `What is the main purpose of the conversation item ${n}?`,
      options: ["One", "Two", "Three", "Four"],
      correctAnswer: index % 4,
      explanation: `原文说 “supporting evidence”，故选 ${"ABCD"[index % 4]}。A) 无中生有；B) 程度偏移；C) 张冠李戴；D) 答非所问。`,
      score: 7.1,
      examSection: {
        kind: "cet-listening-a",
        groupId: `g-${group}`,
        questionNumber: n++,
        ...(index === 0 ? { passage: "Woman: short dialogue. Man: short reply." } : {}),
      },
    })),
  );
}

describe("CET-6 quality audit", () => {
  it("uses the mature Project_04 stop-word and support-sentence definition", () => {
    expect([...contentWords("about before clarity influence")].sort()).toEqual([
      "clarity",
      "influence",
    ]);

    const copiedPassage =
      "Sleep researchers at a university in Singapore recruited 148 volunteers. " +
      "The nappers outperformed the other two groups on every measure of attention.";
    expect(
      supportOverlapRatio(
        "The nappers outperformed the other two groups on every measure of attention.",
        copiedPassage,
      ),
    ).toBe(1);

    const synthesisedPassage =
      "The first study found that sleep helps memory. " +
      "A second study reported that rest improves attention. " +
      "Together they suggest that short naps can repair damage.";
    expect(
      supportOverlapRatio(
        "Naps may assist memory without replacing a full night of sleep.",
        synthesisedPassage,
      ),
    ).toBe(0.25);
  });

  it("rejects under-length listening material", () => {
    const report = auditCet6Stage("listening-a", listeningQuestions());
    expect(report.passed).toBe(false);
    expect(report.errors.map((check) => check.id)).toContain("listening-a:length");
  });

  it("rejects English-only explanations", () => {
    const questions = listeningQuestions().map((question) => ({
      ...question,
      explanation: "The answer is supported by the transcript.",
    }));
    const report = auditCet6Stage("listening-a", questions);
    expect(report.errors.map((check) => check.id)).toContain(
      "listening-a:explanations-chinese",
    );
  });

  it("uses Reading B question options when optionBank has not been normalized yet", () => {
    const passage = Array.from(
      { length: 13 },
      (_, index) =>
        `${String.fromCharCode(65 + index)}. ` +
        "A distinct paragraph sentence with enough words for matching. ".repeat(3),
    ).join("\n");
    const questions = Array.from({ length: 10 }, (_, index) => ({
      id: `reading-b-${index + 1}`,
      type: "single-choice" as const,
      content: `Statement ${index + 1} with a locatable detail.`,
      options: Array.from({ length: 13 }, (_, optionIndex) =>
        String.fromCharCode(65 + optionIndex),
      ),
      correctAnswer: index,
      explanation: "定位原文 “distinct paragraph”，故选 A。",
      score: 7.1,
      examSection: {
        kind: "cet-reading-b",
        groupId: "matching",
        questionNumber: 36 + index,
        ...(index === 0 ? { passage } : {}),
      },
    }));

    const report = auditCet6Stage("reading-b", questions);
    const bankCheck = report.checks.find(
      (check) => check.id === "reading-b:bank",
    );
    expect(bankCheck?.passed).toBe(true);
    const lengthCheck = report.checks.find(
      (check) => check.id === "reading-b:statement-length",
    );
    expect(lengthCheck?.passed).toBe(false);
  });

  it("identifies the exact question and explanation defect", () => {
    const questions = listeningQuestions();
    const question = questions[4];
    if (question?.type !== "single-choice") {
      throw new Error("fixture changed");
    }
    question.explanation =
      "English-only explanation without a supporting quotation or declaration.";
    const report = auditCet6Stage("listening-a", questions);
    const check = report.checks.find(
      (item) => item.id === "listening-a:explanations-chinese",
    );
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("Q5");
    expect(check?.detail).toContain("缺中文解析");
    expect(check?.detail).toContain("缺英文原文引述");
    expect(check?.detail).toContain("缺“故选 A”");
  });

  it("rejects a correct-option claim that contradicts the answer key", () => {
    const questions = listeningQuestions();
    const question = questions[0];
    if (question?.type !== "single-choice") {
      throw new Error("fixture changed");
    }
    question.correctAnswer = 1;
    question.explanation =
      "原文说 “supporting evidence”，故A项正确。故选 B。A) 无中生有；C) 程度偏移；D) 张冠李戴。";
    const report = auditCet6Stage("listening-a", questions);
    const check = report.checks.find(
      (item) => item.id === "listening-a:explanations-chinese",
    );
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("正文把 A 项写成正确项，应为 B 项");
  });

  it("accepts a Reading B passage with 13 paragraphs and attributed quotes", () => {
    const paragraphs = Array.from({ length: 13 }, (_, index) => {
      const letter = String.fromCharCode(65 + index);
      const quote =
        index < 9
          ? ` Dr. Alice Smith said, "This neighbourhood programme gives residents a practical route into shared decisions every month."`
          : "";
      return `${letter}. ${"community programme supports volunteers ".repeat(5)}${quote}`;
    });
    let passage = paragraphs.join("\n");
    const missing = 1200 - wordCount(passage);
    if (missing > 0) {
      passage = passage.replace("A. ", `A. ${"local ".repeat(missing)}`);
    }

    const report = auditReadingBPassage(passage);
    expect(report.passed).toBe(true);
  });
});

describe("specific-information metric", () => {
  it("matches the established real-paper counting definition", () => {
    expect(
      specificInfoCount(
        "In 2019 the Department of Health reported 37% of adults and eight drugs.\n" +
          "Matt Hancock said the figure, Thalidomide, rose to 130 countries.",
      ),
    ).toBe(8);
    expect(
      specificInfoCount(
        "Children's use of social media is a problem.That doesn't mean it should be stopped.\n" +
          "Although the research does not prove that social media causes depression, the finding matters.",
      ),
    ).toBe(0);
    expect(
      specificInfoCount(
        "Sleep researchers at a university in Singapore reported the result.\n" +
          "Second, the effect was clear.",
      ),
    ).toBe(1);
  });
});

describe("review analysis", () => {
  const paper: ExamPaper = {
    version: 1,
    title: "test",
    questions: [
      {
        id: "q1",
        type: "single-choice",
        content: "Question one",
        options: ["A", "B", "C", "D"],
        correctAnswer: 1,
        explanation: "中文解析",
        score: 7.1,
        examSection: {
          kind: "cet-listening-a",
          questionNumber: 1,
        },
      },
      {
        id: "q2",
        type: "single-choice",
        content: "Question two",
        options: ["A", "B", "C", "D"],
        correctAnswer: 2,
        explanation: "中文解析",
        score: 7.1,
        examSection: {
          kind: "cet-listening-b",
          questionNumber: 2,
        },
      },
    ],
  };

  it("parses answer imports and computes objective results", () => {
    const answers = parseImportedAnswers("1 B\n2 A");
    expect(answers).toEqual({ "1": "B", "2": "A" });
    const analysis = analyzeReview(paper, {
      answers: answers ?? {},
      writingAnswer: "",
      translationAnswer: "",
    });
    expect(analysis.answered).toBe(2);
    expect(analysis.correct).toBe(1);
    expect(analysis.objectiveScore).toBeCloseTo(7.1);
    expect(analysis.wrong[0]?.questionNumber).toBe(2);
  });

  it("treats untouched objective questions as correct by default", () => {
    const analysis = analyzeReview(paper, {
      answers: {},
      writingAnswer: "",
      translationAnswer: "",
    });
    expect(analysis.answered).toBe(2);
    expect(analysis.correct).toBe(2);
    expect(analysis.objectiveScore).toBeCloseTo(14.2);
    expect(analysis.wrong).toEqual([]);
  });
});

describe("timestamp paper titles", () => {
  it("uses year, month, day, hour, and minute", () => {
    expect(createCet6PaperTitle(new Date(2026, 9, 29, 21, 7))).toBe(
      "2026年10月29日六级模拟卷",
    );
  });

  it("inserts translation hints after the first Chinese occurrence", () => {
    expect(
      applyTranslationGlossary("糖画是一种民间技艺，糖画很受欢迎。", [
        { zh: "糖画", en: "sugar painting" },
      ]),
    ).toBe("糖画(sugar painting)是一种民间技艺，糖画很受欢迎。");
  });
});
