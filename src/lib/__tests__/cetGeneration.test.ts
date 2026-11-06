import { describe, expect, it } from "vitest";
import type { Question } from "../types/exam";
import {
  CET6_CONTENT_STAGES,
  type Cet6ContentStage,
} from "../types/cet";
import {
  buildCet6Paper,
  normalizeWritingOpeningQuotes,
  parseCet6Blueprint,
  parseCet6ReadingBPassage,
  parseCet6Stage,
  validateCet6Paper,
  validateCet6StageQuestions,
} from "../cet/generate";
import {
  CET6_STAGE_SPECS,
  expectedQuestionCount,
} from "../cet/structure";
import {
  buildCet6ReadingBPassagePrompt,
  buildCet6ReadingCPassagePrompt,
  buildCet6ReadingCQuestionsPrompt,
  buildCet6StagePrompt,
} from "../cet/pipelinePrompts";
import {
  arrangeReadingBQuestions,
  createReadingBAnswerPlan,
} from "../cet/readingBPlan";
import { createReadingCPlan } from "../cet/readingCPlan";
import { toStudentVersion } from "../exam/studentVersion";
import { groupQuestionsByType } from "../exam/paperSections";
import { createCet6PaperTitle } from "../exam/paperTitle";

const blueprint = {
  title: "Test blueprint",
  topics: {
    writing: "AI and academic integrity",
    listening: "Campus technology and scientific discovery",
    reading: "Urban agriculture and digital work",
    translation: "Traditional Chinese crafts",
  },
};

function rawStage(stage: Cet6ContentStage): Question[] {
  const spec = CET6_STAGE_SPECS[stage];
  if (stage === "writing") {
    return [
      {
        id: "writing",
        type: "essay",
        content:
          "Write an essay on how students should use artificial intelligence responsibly.",
        writingGuidance:
          "开头点明人工智能使用需要边界；主体讨论学术诚信与能力提升；结尾提出学校和学生各自可行的做法。",
        score: 106.5,
        scoringCriteria: "Clear position, coherent structure, and accurate language.",
      },
    ];
  }
  if (stage === "translation") {
    return [
      {
        id: "translation",
        type: "short-answer",
        content: "纸伞制作是中国传统手工艺的重要组成部分。".repeat(10),
        referenceAnswer:
          "Paper umbrella making is an important part of traditional Chinese handicrafts.",
        scoringPoints: ["Accurate main idea", "Natural English"],
        score: 106.5,
      },
    ];
  }

  let offset = 0;
  return spec.groups.flatMap((group, groupIndex) =>
    group.questionNumbers.map((questionNumber, index) => {
      offset += 1;
      return {
        id: `raw-${stage}-${offset}`,
        type: "single-choice" as const,
        content: `What does the speaker suggest in item ${questionNumber}?`,
        options: ["First", "Second", "Third", "Fourth"],
        correctAnswer: index % 4,
        explanation:
          "The answer follows from the stated cause; the other choices misstate its scope.",
        score: spec.scorePerQuestion,
        examSection: {
          kind: spec.kind,
          groupId: `${stage}-${groupIndex}`,
          title: group.title,
          questionNumber,
          ...(index === 0
            ? { passage: `${stage} group ${groupIndex + 1} shared passage.` }
            : {}),
        },
      };
    }),
  );
}

function completeStageMap(): Record<Cet6ContentStage, Question[]> {
  return Object.fromEntries(
    CET6_CONTENT_STAGES.map((stage) => [stage, rawStage(stage)]),
  ) as Record<Cet6ContentStage, Question[]>;
}

describe("CET-6 staged structure", () => {
  it("renders the supplied writing sentence with Chinese double quotes", () => {
    const ascii =
      'Directions: Write an essay. Opening sentence: "Faced with a changing world, students must learn to listen before they speak and reflect before they act."';
    const normalized = normalizeWritingOpeningQuotes(ascii);

    expect(normalized).toBe(
      "For this part, you are allowed 30 minutes to write an essay that begins with the sentence “Faced with a changing world, students must learn to listen before they speak and reflect before they act.” You can make comments, cite examples or use your personal experiences to develop your essay. You should write at least 150 words but no more than 200 words.",
    );
    expect(normalized).not.toContain(
      'Opening sentence: "Faced with a changing world',
    );
  });

  it("defines the fixed eight-stage order and 57-question total", () => {
    expect(CET6_CONTENT_STAGES).toEqual([
      "writing",
      "listening-a",
      "listening-b",
      "listening-c",
      "reading-a",
      "reading-b",
      "reading-c",
      "translation",
    ]);
    expect(
      CET6_CONTENT_STAGES.reduce(
        (sum, stage) => sum + expectedQuestionCount(stage),
        0,
      ),
    ).toBe(57);
  });

  it("builds a valid 710-point paper in fixed section order", () => {
    const generatedAt = new Date(2026, 9, 29, 21, 40);
    const paper = buildCet6Paper(completeStageMap(), generatedAt);

    expect(paper.title).toBe(createCet6PaperTitle(generatedAt));
    expect(paper.title).toBe("2026年10月29日六级模拟卷");
    expect(paper.questions).toHaveLength(57);
    expect(paper.questions[0]?.examSection?.title).toBe(
      "Part I　Writing　(30 minutes)",
    );
    expect(
      paper.questions.reduce((sum, question) => sum + question.score, 0),
    ).toBeCloseTo(710, 6);
    expect(validateCet6Paper(paper)).toEqual([]);
    expect(
      [...new Set(groupQuestionsByType(paper).map((section) => section.kind))],
    ).toEqual([
      "cet-writing",
      "cet-listening-a",
      "cet-listening-b",
      "cet-listening-c",
      "cet-reading-a",
      "cet-reading-b",
      "cet-reading-c",
      "cet-translation",
    ]);
  });

  it("keeps transcripts for teachers and removes them from student view", () => {
    const paper = buildCet6Paper(completeStageMap());
    const teacherTranscripts = paper.questions.filter(
      (question) =>
        question.examSection?.kind.startsWith("cet-listening-") &&
        question.examSection.passage,
    );
    const studentTranscripts = toStudentVersion(paper).questions.filter(
      (question) =>
        question.examSection?.kind.startsWith("cet-listening-") &&
        question.examSection.passage,
    );

    expect(teacherTranscripts.length).toBeGreaterThan(0);
    expect(studentTranscripts).toEqual([]);
  });

  it("rejects extra choices and missing explanations before merging", () => {
    const questions = rawStage("listening-a");
    const first = questions[0];
    if (first.type !== "single-choice") throw new Error("fixture changed");
    first.options.push("Unexpected extra option");
    delete first.explanation;

    const reply = `\`\`\`json\n${JSON.stringify({ questions })}\n\`\`\``;
    const result = parseCet6Stage("listening-a", reply);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("exactly 4 options");
      expect(result.error).toContain("needs an explanation");
    }
  });

  it("rejects a writing stage without the required model essay", () => {
    const errors = validateCet6StageQuestions("writing", rawStage("writing"));

    expect(errors.join("\n")).toContain("referenceAnswer model essay");
  });

  it("parses a fenced blueprint", () => {
    const reply = `\`\`\`json\n${JSON.stringify(blueprint)}\n\`\`\``;
    expect(parseCet6Blueprint(reply)).toEqual({ ok: true, value: blueprint });
  });

  it("puts exact counts, numbers, and transcript guidance in stage prompts", () => {
    const messages = buildCet6StagePrompt("listening-c", blueprint);
    const prompt = messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("exact question count: 10");
    expect(prompt).toContain("numbering 16-18");
    expect(prompt).toContain("numbering 19-21");
    expect(prompt).toContain("numbering 22-25");
    expect(prompt).toContain("complete lecture/talk transcripts");
    expect(prompt).toContain("Listening explanation hard requirement");
    expect(prompt).toContain("exact final");

    const fixedMessages = buildCet6StagePrompt(
      "listening-c",
      blueprint,
      undefined,
      {
        listeningAnswerIndexes: [0, 1, 2, 3, 0, 1, 2, 3, 2, 3],
      },
    );
    const fixedPrompt = fixedMessages
      .map((message) => message.content)
      .join("\n");
    expect(fixedPrompt).toContain("Q16=A(correctAnswer 0)");
    expect(fixedPrompt).toContain("Q25=D(correctAnswer 3)");
    expect(fixedPrompt).toContain("must use that same letter");
  });

  it("fixes Reading B answer positions and generates the passage separately", () => {
    const plan = createReadingBAnswerPlan(blueprint.title);
    const indexes = plan.sourceIndexes;
    expect(new Set(indexes).size).toBe(10);
    expect(plan.finalIndexes).toHaveLength(10);
    expect(new Set(plan.finalIndexes).size).toBe(10);
    expect(
      plan.finalIndexes.some(
        (value, index) => index > 0 && value < plan.finalIndexes[index - 1],
      ),
    ).toBe(true);

    const messages = buildCet6StagePrompt(
      "reading-b",
      blueprint,
      undefined,
      { readingBPassage: "A. Fixed passage." },
    );
    const prompt = messages.map((message) => message.content).join("\n");
    expect(prompt).toContain(
      `Q36=${String.fromCharCode(65 + indexes[0])}(correctAnswer ${indexes[0]})`,
    );
    expect(prompt).toContain(
      `Q45=${String.fromCharCode(65 + indexes[9])}(correctAnswer ${indexes[9]})`,
    );
    expect(prompt).toContain(
      "the application will shuffle the complete questions",
    );
    expect(prompt).toContain("do not include");
    expect(prompt).toContain("examSection.passage in the JSON");
    expect(prompt).toContain("Question 39 must begin");
    expect(prompt).toContain("9-20 English words");
    expect(prompt).toContain("median of 12-16 words");

    const passagePrompt = buildCet6ReadingBPassagePrompt(blueprint)
      .map((message) => message.content)
      .join("\n");
    expect(passagePrompt).toContain("Exactly 13 paragraphs labelled A. through M.");
    expect(passagePrompt).toContain("Include 9 direct quotations");
    expect(passagePrompt).toContain("work/society component");

    const focusedPrompt = buildCet6ReadingBPassagePrompt({
      ...blueprint,
      topics: {
        ...blueprint.topics,
        readingB: "Repair cafes and the right-to-repair movement",
      },
    })
      .map((message) => message.content)
      .join("\n");
    expect(focusedPrompt).toContain(
      "Repair cafes and the right-to-repair movement",
    );
  });

  it("varies Reading B answers by paper while keeping retries stable", () => {
    const first = createReadingBAnswerPlan("paper-a");
    expect(createReadingBAnswerPlan("paper-a")).toEqual(first);
    expect(createReadingBAnswerPlan("paper-b")).not.toEqual(first);
    expect(first.sourceIndexes).toHaveLength(10);
    expect(new Set(first.sourceIndexes).size).toBe(10);
    expect(first.finalIndexes).toHaveLength(10);
    expect(new Set(first.finalIndexes).size).toBe(10);
    expect(
      first.finalIndexes.some(
        (value, index) => index > 0 && value < first.finalIndexes[index - 1],
      ),
    ).toBe(true);
    let ascendingPairs = 0;
    let ascendingRun = 1;
    let longestAscendingRun = 1;
    for (let index = 1; index < first.finalIndexes.length; index += 1) {
      if (first.finalIndexes[index] > first.finalIndexes[index - 1]) {
        ascendingPairs += 1;
        ascendingRun += 1;
        longestAscendingRun = Math.max(longestAscendingRun, ascendingRun);
      } else {
        ascendingRun = 1;
      }
    }
    expect(ascendingPairs).toBeLessThanOrEqual(5);
    expect(longestAscendingRun).toBeLessThan(3);
  });

  it("keeps statement targets while reordering the final questions", () => {
    const plan = createReadingBAnswerPlan("paper-order");
    const sourceQuestions: Question[] = plan.sourceIndexes.map(
      (answerIndex, index) => ({
        id: `rb-${answerIndex}`,
        type: "single-choice",
        content: `Statement ${index + 1}`,
        options: Array.from({ length: 15 }, (_, option) =>
          String.fromCharCode(65 + option),
        ),
        correctAnswer: answerIndex,
        explanation: `“evidence” 定位该段，故选 ${String.fromCharCode(65 + answerIndex)}。`,
        score: 7.1,
        examSection: {
          kind: "cet-reading-b",
          groupId: "matching",
          questionNumber: 36 + index,
        },
      }),
    );

    const arranged = arrangeReadingBQuestions(
      sourceQuestions,
      plan.finalIndexes,
    );
    expect(arranged.ok).toBe(true);
    if (arranged.ok) {
      expect(
        arranged.value.map((question) =>
          question.type === "single-choice" ? question.correctAnswer : -1,
        ),
      ).toEqual(plan.finalIndexes);
      expect(
        arranged.value.map((question) => question.examSection?.questionNumber),
      ).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
    }
  });

  it("rejects a truncated Reading B passage before statement generation", () => {
    const result = parseCet6ReadingBPassage(
      '```json\n{"passage":"A short passage."}\n```',
    );
    expect(result.ok).toBe(false);
  });

  it("puts Reading C passage metrics, question kinds, and answers in the prompt", () => {
    const plan = createReadingCPlan(
      {
        ...blueprint,
        topics: {
          ...blueprint.topics,
          readingC: {
            first: "Repair cafes and product longevity",
            second: "Sleep consistency and learning",
          },
        },
      },
      "reading-c-test",
    );
    const passagePrompt = buildCet6ReadingCPassagePrompt(plan.passages[0])
      .map((message) => message.content)
      .join("\n");
    expect(passagePrompt).toContain("Exactly 8 natural paragraphs");
    expect(passagePrompt).toContain("total target is 450 English words");
    expect(passagePrompt).toContain("final paragraph must be one unbroken paragraph of at least 100 words");

    const questionPrompt = buildCet6ReadingCQuestionsPrompt(
      blueprint,
      plan.passages[0],
      "A. fixed passage",
    )
      .map((message) => message.content)
      .join("\n");
    expect(questionPrompt).toContain("Question numbers: 46-50");
    expect(questionPrompt).toContain(
      `Q46=${String.fromCharCode(65 + plan.passages[0].answerIndexes[0])}`,
    );
    expect(questionPrompt).toContain(
      `Q46=paragraph ${plan.passages[0].sourceParagraphs[0]}`,
    );
    expect(questionPrompt).toContain("Q50=attitude");
    expect(questionPrompt).toContain("must begin: \"What does [a full person name] think of");
  });
});
