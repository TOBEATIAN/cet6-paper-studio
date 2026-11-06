import type { Question } from "../types/exam";

const PARAGRAPH_COUNT = 13;
const QUESTION_COUNT = 10;
const FALLBACK_SOURCE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const FALLBACK_FINAL_INDEXES = [3, 0, 7, 2, 9, 1, 6, 4, 8, 5] as const;

export interface ReadingBAnswerPlan {
  /** Natural paragraph order sent to the model while it writes statements. */
  sourceIndexes: number[];
  /** Final answer order after the complete statement set is shuffled. */
  finalIndexes: number[];
}

/**
 * Select ten distinct paragraphs from A-M, leaving three distractors. The
 * model writes in paragraph order; the application then shuffles the complete
 * questions into the final non-monotonic answer order.
 */
export function createReadingBAnswerPlan(seedText: string): ReadingBAnswerPlan {
  const random = seededRandom(seedText);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const sourceIndexes = shuffle(
      Array.from({ length: PARAGRAPH_COUNT }, (_, index) => index),
      random,
    )
      .slice(0, QUESTION_COUNT)
      .sort((left, right) => left - right);
    const finalIndexes = shuffle([...sourceIndexes], random);
    if (isValidFinalOrder(finalIndexes)) {
      return { sourceIndexes, finalIndexes };
    }
  }
  return {
    sourceIndexes: [...FALLBACK_SOURCE_INDEXES],
    finalIndexes: [...FALLBACK_FINAL_INDEXES],
  };
}

export function arrangeReadingBQuestions(
  questions: readonly Question[],
  finalIndexes: readonly number[],
):
  | { ok: true; value: Question[] }
  | { ok: false; error: string } {
  const byAnswer = new Map<number, Question>();
  for (const question of questions) {
    if (question.type !== "single-choice") {
      return { ok: false, error: "Reading B questions must be single-choice." };
    }
    if (byAnswer.has(question.correctAnswer)) {
      return {
        ok: false,
        error: `Reading B reused paragraph index ${question.correctAnswer}; select ten different paragraphs.`,
      };
    }
    byAnswer.set(question.correctAnswer, question);
  }
  const missing = finalIndexes.filter((index) => !byAnswer.has(index));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Reading B statements do not match the assigned paragraph plan. Missing indexes: ${missing.join(", ")}.`,
    };
  }
  return {
    ok: true,
    value: finalIndexes.map((answerIndex, questionIndex) => {
      const question = byAnswer.get(answerIndex);
      if (!question) {
        throw new Error("Reading B answer map changed unexpectedly.");
      }
      return {
        ...question,
        examSection: {
          ...question.examSection,
          kind: "cet-reading-b",
          questionNumber: 36 + questionIndex,
        },
      };
    }),
  };
}

function isValidFinalOrder(indexes: readonly number[]): boolean {
  if (indexes.length !== QUESTION_COUNT) return false;
  if (new Set(indexes).size !== QUESTION_COUNT) return false;
  if (indexes.some((index) => index < 0 || index >= PARAGRAPH_COUNT)) {
    return false;
  }
  let ascendingPairs = 0;
  let ascendingRun = 1;
  for (let position = 1; position < indexes.length; position += 1) {
    if (indexes[position] > indexes[position - 1]) {
      ascendingPairs += 1;
      ascendingRun += 1;
      if (ascendingRun >= 3) return false;
    } else {
      ascendingRun = 1;
    }
  }
  return (
    indexes.some(
      (value, position) => position > 0 && value < indexes[position - 1],
    ) && ascendingPairs <= 5
  );
}

function seededRandom(seedText: string): () => number {
  let state = 0x811c9dc5;
  for (const character of seedText) {
    state ^= character.codePointAt(0) ?? 0;
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

