export type WritingOpeningStyle =
  | "time"
  | "with"
  | "participle"
  | "it-is"
  | "people"
  | "there-is"
  | "in-era"
  | "to";

export interface WritingOpeningPlan {
  style: WritingOpeningStyle;
  instruction: string;
}

const OPENING_STYLES: WritingOpeningPlan[] = [
  {
    style: "time",
    instruction:
      "Begin the supplied sentence with Nowadays, Today, or In recent years.",
  },
  {
    style: "with",
    instruction:
      "Begin the supplied sentence with a natural With + noun-phrase construction.",
  },
  {
    style: "participle",
    instruction:
      "Begin the supplied sentence with Faced with..., Living in..., or a natural participial phrase.",
  },
  {
    style: "it-is",
    instruction:
      "Begin the supplied sentence with It is widely accepted/believed that...",
  },
  {
    style: "people",
    instruction:
      "Begin the supplied sentence with People are now increasingly aware...",
  },
  {
    style: "there-is",
    instruction:
      "Begin the supplied sentence with There is a growing awareness...",
  },
  {
    style: "in-era",
    instruction:
      "Begin the supplied sentence with In an era of..., followed by a need or value judgment.",
  },
  {
    style: "to",
    instruction:
      "Begin the supplied sentence with a To + infinitive purpose phrase.",
  },
];

export function createWritingOpeningPlan(seedText: string): WritingOpeningPlan {
  return chooseWritingOpeningPlan(seedText, []);
}

/**
 * Choose an opening form while respecting the real-paper rotation rules:
 * adjacent papers differ, and no form appears more than twice in five papers.
 */
export function chooseWritingOpeningPlan(
  seedText: string,
  previousStyles: readonly WritingOpeningStyle[],
): WritingOpeningPlan {
  const hash = [...seedText].reduce(
    (value, character) =>
      Math.imul(value ^ (character.codePointAt(0) ?? 0), 0x01000193),
    0x811c9dc5,
  );
  const start = (hash >>> 0) % OPENING_STYLES.length;
  const recent = previousStyles.slice(0, 4);
  for (let offset = 0; offset < OPENING_STYLES.length; offset += 1) {
    const candidate =
      OPENING_STYLES[(start + offset) % OPENING_STYLES.length];
    if (recent[0] === candidate.style) continue;
    if (
      recent.filter((style) => style === candidate.style).length >= 2
    ) {
      continue;
    }
    return candidate;
  }
  return OPENING_STYLES[start];
}

export function classifyWritingOpening(
  sentence: string,
): WritingOpeningStyle | null {
  const text = sentence.trim();
  if (/^(?:Nowadays|Today|In recent years)\b/i.test(text)) return "time";
  if (/^With\b/i.test(text)) return "with";
  if (/^(?:Faced with|Living in|While\b)/i.test(text)) return "participle";
  if (/^It is\b/i.test(text)) return "it-is";
  if (/^People\b/i.test(text)) return "people";
  if (/^There is a growing awareness\b/i.test(text)) return "there-is";
  if (/^In an era of\b/i.test(text)) return "in-era";
  if (/^To\b/i.test(text)) return "to";
  return null;
}
