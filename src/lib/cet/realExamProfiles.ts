/**
 * Aggregate CET-6 Reading Section C profiles derived from the user's 2022+
 * real-paper library. No exam passage, question, option, answer, or explanation
 * is stored here; these are statistical calibration targets only.
 *
 * Source of truth for the figures:
 * Project_04_专门学习/Project_02_六级/模拟卷/命题规范.md appendices A-5/A-7/A-8.
 */
export interface RealExamReadingCProfile {
  label: string;
  scope: string;
  passageWords: readonly [number, number];
  paragraphSigma: readonly [number, number];
  longestSentence: readonly [number, number];
  shortSentences: readonly [number, number];
  longWordPercent: readonly [number, number];
  specifics: readonly [number, number];
  optionAverage: readonly [number, number];
  longOptionQuestions: readonly [number, number];
  shortOptionQuestions: readonly [number, number];
  supportOverlapPercent?: number;
}

export const REAL_EXAM_READING_C_PROFILES_2022_PLUS: readonly RealExamReadingCProfile[] =
  [
    {
      label: "2022.06-1",
      scope: "Passage One / Passage Two",
      passageWords: [448, 446],
      paragraphSigma: [19.3, 27.8],
      longestSentence: [37, 43],
      shortSentences: [6, 4],
      longWordPercent: [23.7, 16.4],
      specifics: [0, 21],
      optionAverage: [9.8, 9.8],
      longOptionQuestions: [7, 7],
      shortOptionQuestions: [0, 0],
    },
    {
      label: "2022.06-2",
      scope: "Passage One / Passage Two",
      passageWords: [442, 444],
      paragraphSigma: [24.9, 31.5],
      longestSentence: [51, 34],
      shortSentences: [2, 4],
      longWordPercent: [19.0, 23.2],
      specifics: [7, 1],
      optionAverage: [8.43, 8.43],
      longOptionQuestions: [5, 5],
      shortOptionQuestions: [2, 2],
    },
    {
      label: "2022.09",
      scope: "Word option shape; 2022+ article band",
      passageWords: [373, 448],
      paragraphSigma: [13.1, 28.6],
      longestSentence: [31, 68],
      shortSentences: [0, 8],
      longWordPercent: [16.9, 23.9],
      specifics: [0, 21],
      optionAverage: [8.1, 8.1],
      longOptionQuestions: [4, 4],
      shortOptionQuestions: [0, 1],
    },
    {
      label: "2022.12-2025.12",
      scope: "seven exam sittings, OCR corpus",
      passageWords: [373, 447],
      paragraphSigma: [13.1, 28.6],
      longestSentence: [31, 68],
      shortSentences: [0, 8],
      longWordPercent: [16.9, 23.9],
      specifics: [0, 42],
      optionAverage: [8.1, 9.1],
      longOptionQuestions: [4, 5],
      shortOptionQuestions: [0, 2],
    },
    {
      label: "2026.6-1",
      scope: "Passage One / Passage Two",
      passageWords: [448, 437],
      paragraphSigma: [26.2, 13.1],
      longestSentence: [53, 38],
      shortSentences: [7, 7],
      longWordPercent: [19.6, 16.9],
      specifics: [6, 16],
      optionAverage: [8.12, 8.12],
      longOptionQuestions: [4, 4],
      shortOptionQuestions: [1, 1],
      supportOverlapPercent: 34,
    },
    {
      label: "2026.6-2",
      scope: "Passage One / Passage Two",
      passageWords: [448, 447],
      paragraphSigma: [22.8, 25.7],
      longestSentence: [46, 68],
      shortSentences: [5, 5],
      longWordPercent: [20.3, 17.0],
      specifics: [0, 1],
      optionAverage: [8.38, 8.38],
      longOptionQuestions: [5, 5],
      shortOptionQuestions: [2, 2],
      supportOverlapPercent: 35,
    },
    {
      label: "2026.6-3",
      scope: "Passage One / Passage Two",
      passageWords: [443, 444],
      paragraphSigma: [28.6, 25.9],
      longestSentence: [64, 31],
      shortSentences: [0, 8],
      longWordPercent: [19.6, 23.9],
      specifics: [5, 9],
      optionAverage: [9.1, 9.1],
      longOptionQuestions: [5, 5],
      shortOptionQuestions: [0, 0],
      supportOverlapPercent: 39,
    },
  ];

export function readingCRealExamReferenceText(): string {
  return REAL_EXAM_READING_C_PROFILES_2022_PLUS.map(
    (profile) =>
      `${profile.label} (${profile.scope}): words ${profile.passageWords.join(
        "/",
      )}; paragraph sigma ${profile.paragraphSigma.join(
        "/",
      )}; longest sentence ${profile.longestSentence.join(
        "/",
      )}; short sentences ${profile.shortSentences.join(
        "/",
      )}; >=8-letter words ${profile.longWordPercent.join(
        "/",
      )}%; specifics ${profile.specifics.join(
        "/",
      )}; option average ${profile.optionAverage.join(
        "/",
      )}; long-option questions ${profile.longOptionQuestions.join(
        "/",
      )}; short-option questions ${profile.shortOptionQuestions.join("/")}${
        profile.supportOverlapPercent == null
          ? ""
          : `; correct-option overlap ${profile.supportOverlapPercent}%`
      }.`,
  ).join("\n");
}
