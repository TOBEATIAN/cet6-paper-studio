const WORD_BANK_PREFIX = /^\s*[A-ZＡ-Ｚ]\s*[).、:：．]\s*/;
const NUMBERED_BLANK =
  /[_＿]{2,}\s*[（(]?\s*(\d{1,2})\s*[）)]?\s*[_＿]{2,}/g;

/**
 * Remove labels accidentally embedded in a shared word-bank entry. The renderer
 * owns the A-O labels, so entries such as `E) principle` must not become
 * `E. E) principle`.
 */
export function normalizeWordBank(words: readonly string[]): string[] {
  return words.map((word) => word.replace(WORD_BANK_PREFIX, "").trim());
}

/**
 * Turn numbered underscore placeholders into the Markdown renderer's safe
 * underline syntax. The surrounding CSS gives each blank a writing-sized line.
 */
export function formatBankedClozePassage(passage: string): string {
  return passage.replace(NUMBERED_BLANK, (_match, number: string) => `++${number}++`);
}

/** Split a long article into independently paginable paragraphs. */
export function splitPassageParagraphs(passage: string): string[] {
  return passage
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** Render Reading B paragraph letters in bold without changing stored content. */
export function formatReadingBParagraphLabel(text: string): string {
  return text.replace(
    /^\s*([A-O])\s*[).、:：．]\s*/,
    (match, letter: string) => {
      const mark = match.match(/[).、:：．]/)?.[0] ?? ".";
      return `**${letter}${mark}** `;
    },
  );
}

/** Match the exam's short-option two-column balance without squeezing long text. */
export function useTwoColumnReadingOptions(
  options: readonly string[],
): boolean {
  return (
    options.length === 4 &&
    options.every((option) => option.trim().length <= 48)
  );
}

export function passagePartTitle(index: number): string {
  return index === 0
    ? "Passage One"
    : index === 1
      ? "Passage Two"
      : `Passage ${index + 1}`;
}

export function questionRangeText(numbers: readonly number[]): string | undefined {
  if (numbers.length === 0) return undefined;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last
    ? `Question ${first} is based on the following passage.`
    : `Questions ${first} to ${last} are based on the following passage.`;
}
