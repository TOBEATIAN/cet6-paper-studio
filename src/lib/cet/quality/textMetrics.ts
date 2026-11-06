// Keep this identical to the mature Project_04 `scripts/lib/text.js` word set.
// The audit thresholds come from that pipeline; a different stop-word list makes
// the same paper receive different overlap percentages in the two tools.
const STOP_WORDS = new Set(
  (
    "the and are was were with from that this have has had they them their " +
    "what when which will would should could about into than then there these " +
    "those because being been your our just very only also more most some such " +
    "each both over under again after before"
  ).split(" "),
);

export function englishWords(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
}

export function wordCount(text: string): number {
  return englishWords(text).length;
}

export function chineseCount(text: string): number {
  return (text.match(/[\u3400-\u9fff]/g) ?? []).length;
}

export function hasChinese(text: string): boolean {
  return chineseCount(text) > 0;
}

export function longWordPercent(text: string): number {
  const words = englishWords(text);
  if (words.length === 0) return 0;
  return (words.filter((word) => word.length >= 8).length / words.length) * 100;
}

export function sentenceList(text: string): string[] {
  return text
    .replace(/([.!?])(?=[A-Z])/g, "$1 ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => wordCount(sentence) >= 3);
}

export function paragraphList(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function paragraphStats(text: string): {
  count: number;
  sigma: number;
  shortest: number;
  longest: number;
  shortCount: number;
  longCount: number;
} {
  const lengths = paragraphList(text).map(wordCount);
  if (lengths.length === 0) {
    return {
      count: 0,
      sigma: 0,
      shortest: 0,
      longest: 0,
      shortCount: 0,
      longCount: 0,
    };
  }
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    lengths.length;
  return {
    count: lengths.length,
    sigma: Math.sqrt(variance),
    shortest: Math.min(...lengths),
    longest: Math.max(...lengths),
    shortCount: lengths.filter((length) => length <= 35).length,
    longCount: lengths.filter((length) => length >= 90).length,
  };
}

export function contentWords(text: string): Set<string> {
  return new Set(
    englishWords(text)
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );
}

export function overlapRatio(left: string, right: string): number {
  const leftWords = contentWords(left);
  if (leftWords.size === 0) return 0;
  const rightWords = contentWords(right);
  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }
  return shared / leftWords.size;
}

export function supportSentences(text: string): string[] {
  const normalized = text.replace(/([.!?])(?=[A-Z])/g, "$1 ");
  return normalized
    .split(/\n+/)
    .flatMap((paragraph) =>
      paragraph
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter(
          (sentence) =>
            sentence.split(/\s+/).filter(Boolean).length >= 3,
        ),
    )
    .filter(Boolean);
}

export function supportOverlapRatio(option: string, passage: string): number {
  return Math.max(
    0,
    ...supportSentences(passage).map((sentence) =>
      overlapRatio(option.replace(/^[A-D]\)\s*/, ""), sentence),
    ),
  );
}

export function longestCommonWordRun(left: string, right: string): number {
  const a = englishWords(left)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2);
  const b = englishWords(right)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2);
  let best = 0;
  const row = new Array<number>(b.length + 1).fill(0);
  for (const wordA of a) {
    for (let index = b.length - 1; index >= 0; index -= 1) {
      row[index + 1] =
        wordA === b[index] ? row[index] + 1 : 0;
      best = Math.max(best, row[index + 1]);
    }
  }
  return best;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function quoteCount(text: string): {
  total: number;
  direct: number;
} {
  const normalized = text.replace(/\\"/g, "\"").replace(/[“”]/g, "\"");
  const matches = [...normalized.matchAll(/"([^"]+)"/g)].map((match) =>
    match[1].trim(),
  );
  return {
    total: matches.length,
    direct: matches.filter((quote) => wordCount(quote) >= 6).length,
  };
}

export function countArabicFigures(text: string): number {
  return (text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).length;
}

export function specificInfoCount(text: string): number {
  const normalized = text.replace(/([.!?])(?=[A-Z])/g, "$1 ");
  const hits = new Set<string>();
  const fixedPatterns = [
    /\b(?:19|20)\d{2}\b/g,
    /\b\d+(?:[.,]\d+)?%?\b/g,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|per cent|percent)\b/gi,
    /\b(?:University|Institute|Institution|Commission|Ministry|Department|Agency|Organization|Organisation|Association|Foundation|Bureau|Council|Bank|Court|Committee|Centre|Center|Laboratory|College|Academy|Parliament|Congress|Senate|Administration|G-?\d+)\b/g,
  ];
  for (const pattern of fixedPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      hits.add(match[0].toLowerCase());
    }
  }

  const stripEdges = (value: string) =>
    value.replace(/^[.,;:()[\]{}"'“”‘’]+|[.,;:()[\]{}"'“”‘’]+$/g, "");
  for (const paragraph of normalized.split(/\n+/)) {
    for (const sentence of paragraph.trim().split(/(?<=[.!?])\s+/)) {
      const tokens = sentence.split(/\s+/).filter(Boolean);
      for (let index = 1; index < tokens.length; index += 1) {
        const first = stripEdges(tokens[index]);
        if (/^[A-Z][a-z]{3,}$/.test(first)) {
          hits.add(first.toLowerCase());
        }
        const second = stripEdges(tokens[index + 1] ?? "");
        if (
          /^[A-Z][a-z]{2,}$/.test(first) &&
          /^[A-Z][a-z]{2,}$/.test(second)
        ) {
          hits.add(`${first} ${second}`.toLowerCase());
        }
      }
    }
  }
  return hits.size;
}

export function ascendingStats(letters: readonly string[]): {
  ascendingPairs: number;
  longestNonDescendingRun: number;
} {
  let ascendingPairs = 0;
  let run = 1;
  let longestNonDescendingRun = letters.length > 0 ? 1 : 0;
  for (let index = 1; index < letters.length; index += 1) {
    if (letters[index].charCodeAt(0) >= letters[index - 1].charCodeAt(0)) {
      ascendingPairs += 1;
      run += 1;
      longestNonDescendingRun = Math.max(longestNonDescendingRun, run);
    } else {
      run = 1;
    }
  }
  return { ascendingPairs, longestNonDescendingRun };
}

export function hasThreeSameLetters(letters: readonly string[]): boolean {
  return letters.some(
    (_, index) =>
      index >= 2 &&
      letters[index] === letters[index - 1] &&
      letters[index] === letters[index - 2],
  );
}

export function correctLetter(correctIndex: number): string {
  return String.fromCharCode(65 + correctIndex);
}

export function declaredAnswerLetter(explanation: string): string | null {
  const match = explanation.match(
    /(?:故选|答案为|答案)\s*[（(]?\s*([A-O])\s*[）)]?/,
  );
  return match?.[1] ?? null;
}
