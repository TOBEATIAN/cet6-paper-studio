import type { Question } from "../types/exam";
import { declaredAnswerLetter } from "./quality/textMetrics";

type ChoiceQuestion = Extract<Question, { type: "single-choice" }>;

export function createBalancedAnswerIndexes(
  counts: readonly [number, number, number, number],
  seedText: string,
  precedingAnswers: readonly number[] = [],
): number[] {
  const values = counts.flatMap((count, index) =>
    Array.from({ length: count }, () => index),
  );
  const random = seededRandom(seedText);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const indexes = shuffle([...values], random);
    const sequence = [...precedingAnswers.slice(-2), ...indexes];
    if (
      sequence.every(
        (value, index) =>
          index < 2 ||
          value !== sequence[index - 1] ||
          value !== sequence[index - 2],
      )
    ) {
      return indexes;
    }
  }
  return values;
}

export function createReadingAAnswerIndexes(seedText: string): number[] {
  const random = seededRandom(seedText);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const indexes = shuffle(
      Array.from({ length: 15 }, (_, index) => index),
      random,
    ).slice(0, 10);
    let ascendingPairs = 0;
    let ascendingRun = 1;
    let valid = true;
    for (let position = 1; position < indexes.length; position += 1) {
      if (indexes[position] >= indexes[position - 1]) {
        ascendingPairs += 1;
        ascendingRun += 1;
        if (ascendingRun >= 3) {
          valid = false;
          break;
        }
      } else {
        ascendingRun = 1;
      }
    }
    if (valid && ascendingPairs <= 5) return indexes;
  }
  return [0, 5, 2, 9, 7, 12, 4, 14, 10, 6];
}

/**
 * Move each correct option to a planned final letter while preserving option
 * content. Option-order changes are mirrored in the explanation's A)-D) labels
 * and the final “故选 X” declaration.
 */
export function balanceChoiceAnswers(
  questions: readonly Question[],
  targetIndexes: readonly number[],
): Question[] {
  if (questions.length !== targetIndexes.length) {
    throw new Error("Answer plan length must match question count.");
  }
  return questions.map((question, questionIndex) => {
    if (question.type !== "single-choice") {
      throw new Error("Answer balancing only supports single-choice questions.");
    }
    const target = targetIndexes[questionIndex];
    return moveCorrectAnswer(question, target);
  });
}

function moveCorrectAnswer(question: ChoiceQuestion, target: number): Question {
  if (target < 0 || target >= question.options.length) {
    throw new Error("Target answer index is outside the options array.");
  }
  if (target === question.correctAnswer) return question;

  const newOptions = Array<string>(question.options.length);
  newOptions[target] = question.options[question.correctAnswer];
  const mapping = new Map<number, number>();
  mapping.set(question.correctAnswer, target);

  let slot = 0;
  for (let oldIndex = 0; oldIndex < question.options.length; oldIndex += 1) {
    if (oldIndex === question.correctAnswer) continue;
    if (slot === target) slot += 1;
    newOptions[slot] = question.options[oldIndex];
    mapping.set(oldIndex, slot);
    slot += 1;
  }

  const explanation = remapExplanationLetters(
    question.explanation ?? "",
    mapping,
    target,
  );
  return {
    ...question,
    options: newOptions,
    correctAnswer: target,
    explanation,
  };
}

function remapExplanationLetters(
  explanation: string,
  mapping: ReadonlyMap<number, number>,
  target: number,
): string {
  if (!explanation) return explanation;
  let remapped = explanation.replace(
    /\b([A-D])([)）.、])/g,
    (whole, letter: string, suffix: string) => {
      const oldIndex = letter.charCodeAt(0) - 65;
      const next = mapping.get(oldIndex);
      return next == null ? whole : `${String.fromCharCode(65 + next)}${suffix}`;
    },
  );
  remapped = remapped.replace(
    /\b([A-D])(?=\s*项)/g,
    (whole, letter: string) => {
      const next = mapping.get(letter.charCodeAt(0) - 65);
      return next == null ? whole : String.fromCharCode(65 + next);
    },
  );
  remapped = remapped.replace(
    /((?:选项|答案选项)\s*)([A-D])/g,
    (whole, prefix: string, letter: string) => {
      const next = mapping.get(letter.charCodeAt(0) - 65);
      return next == null ? whole : `${prefix}${String.fromCharCode(65 + next)}`;
    },
  );
  const declared = declaredAnswerLetter(remapped);
  if (declared) {
    remapped = remapped.replace(
      /((?:故选|答案为|答案)\s*[（(]?\s*)([A-D])(\s*[）)]?)/,
      `$1${String.fromCharCode(65 + target)}$3`,
    );
  }
  return remapped;
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
