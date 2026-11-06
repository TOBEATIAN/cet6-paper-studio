const PROTECTED_DOTS = [
  /\b(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Mt|Apt|Dept|Fig|Figs|Vol|vs)\./g,
  /\bNo\.(?=\s*\d)/g,
  /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./g,
  /\be\.g\./g,
  /\bi\.e\./g,
  /\bPh\.D\./g,
  /\bU\.S\./g,
  /\bU\.K\./g,
  /\b\d{1,2}(?::\d{2})?\s*[ap]\.m\./gi,
  /\b[A-Z]\./g,
  /\d+\.\d+/g,
] as const;

const DOT_SENTINEL = "\uE000";
const END_SENTENCE_RE = /(?<=[.!?])(?:["'”’）)\]]*)\s+(?=["'“‘（(\[]?[A-Z0-9])/g;

/** Normalize text before sentence-level TTS without changing its wording. */
export function normalizeSpeechText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;!?])(?=[^\s"'”’）)\]])/g, "$1 ")
    .trim();
}

/**
 * Expand common written abbreviations for speech only. The paper keeps the
 * original wording; this representation is used solely for TTS requests.
 */
export function prepareSpeechForTts(text: string): string {
  return normalizeSpeechText(text)
    .replace(
      /\b(?:Woman|Man|Women|Men|Host|Hostess|Guest|Narrator|W|M)\s*:\s*/gi,
      "",
    )
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\bPh\.D\./g, "P H D")
    .replace(/\bU\.S\./g, "U S")
    .replace(/\bU\.K\./g, "U K")
    .replace(/\bNo\.(?=\s*\d)/g, "Number")
    .replace(/\b(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|Mt|Apt|Dept|Fig|Figs|Vol|vs)\./g, (value) => {
      const abbreviation = value.slice(0, -1).toLowerCase();
      return SPEECH_ABBREVIATIONS[abbreviation] ?? value;
    })
    .replace(
      /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./g,
      "$1",
    )
    .replace(
      /\b(\d{1,2}(?::\d{2})?)\s*([ap])\.m\./gi,
      (_value, time: string, period: string) =>
        `${time} ${period.toUpperCase()}M`,
    );
}

const SPEECH_ABBREVIATIONS: Record<string, string> = {
  mr: "Mister",
  mrs: "Missus",
  ms: "Miz",
  mx: "Mix",
  dr: "Doctor",
  prof: "Professor",
  sr: "Senior",
  jr: "Junior",
  mt: "Mount",
  apt: "Apartment",
  dept: "Department",
  fig: "Figure",
  figs: "Figures",
  vol: "Volume",
  vs: "versus",
};

/**
 * Split spoken text into sentence-sized TTS requests while keeping decimals and
 * common English abbreviations intact. Each returned item normally contains one
 * sentence, so the cloud model does not choose its own long sentence breaks.
 * Oversized sentences are split at
 * punctuation first, then at word boundaries.
 */
export function splitSpeechSentences(text: string, maxChars = 500): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];
  if (maxChars < 40) {
    throw new Error("maxChars must be at least 40");
  }

  let protectedText = normalized;
  for (const pattern of PROTECTED_DOTS) {
    protectedText = protectedText.replace(pattern, (value) =>
      value.replace(/\./g, DOT_SENTINEL),
    );
  }

  const sentences = protectedText
    .split(END_SENTENCE_RE)
    .map((sentence) => sentence.split(DOT_SENTINEL).join(".").trim())
    .filter(Boolean);

  return sentences.flatMap((sentence) => splitOversizedSentence(sentence, maxChars));
}

function splitOversizedSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];

  const chunks: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars + 1);
    const candidates = [
      lastMatchEnd(window, /[;:]\s+/g),
      lastMatchEnd(window, /,\s+/g),
      lastMatchEnd(window, /\s+/g),
    ].filter((index) => index >= 40);
    const splitAt = candidates[0] ?? maxChars;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function lastMatchEnd(text: string, pattern: RegExp): number {
  let end = -1;
  for (const match of text.matchAll(pattern)) {
    end = (match.index ?? 0) + match[0].length;
  }
  return end;
}
