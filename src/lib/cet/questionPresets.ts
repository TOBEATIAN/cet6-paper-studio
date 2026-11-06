import type { Question } from "../types/exam";
import {
  CET6_CONTENT_STAGES,
  type Cet6ContentStage,
} from "../types/cet";
import { CET6_STAGE_SPECS } from "./structure";

const CET6_SECTION_LABELS: Record<Cet6ContentStage, string> = {
  writing: "Part I　Writing　(30 minutes)",
  "listening-a": "Part II　Listening·Section A",
  "listening-b": "Part II　Listening·Section B",
  "listening-c": "Part II　Listening·Section C",
  "reading-a": "Part III　Reading·Section A",
  "reading-b": "Part III　Reading·Section B",
  "reading-c": "Part III　Reading·Section C",
  translation: "Part IV　Translation",
};

export function cet6StageFromQuestion(
  question: Question,
): Cet6ContentStage | null {
  return (
    CET6_CONTENT_STAGES.find(
      (stage) =>
        CET6_STAGE_SPECS[stage].kind === question.examSection?.kind,
    ) ?? null
  );
}

export function createCet6Question(
  stage: Cet6ContentStage,
  id: string,
): Question {
  const spec = CET6_STAGE_SPECS[stage];
  const base = {
    id,
    score: spec.scorePerQuestion,
    examSection: {
      kind: spec.kind,
      groupId: `manual-${stage}`,
      title: CET6_SECTION_LABELS[stage],
    },
  };
  const options = optionCountForStage(stage);
  switch (spec.questionType) {
    case "single-choice":
      return {
        ...base,
        type: "single-choice",
        content: "",
        options: Array.from({ length: options }, () => ""),
        correctAnswer: 0,
      };
    case "short-answer":
      return {
        ...base,
        type: "short-answer",
        content: "",
        referenceAnswer: "",
      };
    case "essay":
      return {
        ...base,
        type: "essay",
        content: "",
        writingGuidance: "",
        scoringCriteria: "",
      };
    default:
      throw new Error(`Unsupported CET-6 question type: ${spec.questionType}`);
  }
}

export function changeCet6QuestionStage(
  current: Question,
  stage: Cet6ContentStage,
): Question {
  const next = createCet6Question(stage, current.id);
  if (current.type !== next.type) {
    return { ...next, content: current.content };
  }
  return {
    ...current,
    score: next.score,
    examSection: {
      ...current.examSection,
      ...next.examSection,
      kind: CET6_STAGE_SPECS[stage].kind,
    },
  };
}

export function normalizeCet6QuestionForSave(question: Question): Question {
  const stage = cet6StageFromQuestion(question);
  if (!stage) return question;
  if (stage === "reading-a" || stage === "reading-b") {
    if (question.type !== "single-choice") return question;
    const expected = stage === "reading-a" ? 15 : 13;
    const options =
      question.options.length === expected
        ? question.options
        : Array.from({ length: expected }, (_, index) =>
            question.options[index] ?? "",
          );
    return {
      ...question,
      options,
      examSection: {
        ...question.examSection,
        kind: CET6_STAGE_SPECS[stage].kind,
        optionBank:
          question.examSection?.optionBank?.length === expected
            ? question.examSection.optionBank
            : options,
        hideOptions: true,
        ...(stage === "reading-a"
          ? {
              bankPos:
                question.examSection?.bankPos?.length === expected
                  ? question.examSection.bankPos
                  : Array.from(
                      { length: expected },
                      () => "n" as const,
                    ),
            }
          : {}),
      },
    };
  }
  return {
    ...question,
    examSection: {
      ...question.examSection,
      kind: CET6_STAGE_SPECS[stage].kind,
    },
  };
}

function optionCountForStage(stage: Cet6ContentStage): number {
  return stage === "reading-a" || stage === "reading-b" ? 15 : 4;
}
