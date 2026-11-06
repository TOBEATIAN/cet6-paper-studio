import type { ExamPaper, Question } from "../types/exam";
import { prepareSpeechForTts, splitSpeechSentences } from "./text";

export type SpeechRole = "female" | "male" | "narrator";

export interface SpeechSegment {
  id: string;
  role: SpeechRole;
  text: string;
  pauseAfterMs: number;
  section:
    | "opening"
    | "cet-listening-a"
    | "cet-listening-b"
    | "cet-listening-c";
}

export interface ListeningSpeechPlan {
  version: 1;
  targetWpm: number;
  segments: SpeechSegment[];
}

const TURN_GAP_MS = 400;
const SENTENCE_GAP_MS = 160;
const GROUP_TITLE_PAUSE_MS = 650;
const MATERIAL_TO_ANNOUNCEMENT_MS = 1700;
const ANNOUNCEMENT_TO_QUESTION_MS = 400;
const QUESTION_GAP_MS = 13_100;

const DIRECTIONS = {
  "cet-listening-a":
    "In this section, you will hear two long conversations. At the end of each conversation, you will hear four questions. Both the conversation and the questions will be spoken only once. After you hear a question, you must choose the best answer from the four choices marked A, B, C and D. Then mark the corresponding letter on Answer Sheet 1 with a single line through the centre.",
  "cet-listening-b":
    "Section B, directions. In this section, you will hear two passages. At the end of each passage, you will hear three or four questions. Both the passage and the questions will be spoken only once. After you hear a question, you must choose the best answer from the four choices marked A, B, C and D. Then mark the corresponding letter on Answer Sheet 1 with a single line through the centre.",
  "cet-listening-c":
    "Section C, directions. In this section, you will hear three recordings of lectures or talks followed by three or four questions. The recordings will be played only once. After you hear a question, you must choose the best answer from the four choices marked A, B, C and D. Then mark the corresponding letter on Answer Sheet 1 with a single line through the centre.",
} as const;

const NOUNS = {
  "cet-listening-a": "conversation",
  "cet-listening-b": "passage",
  "cet-listening-c": "recording",
} as const;

const GROUP_TITLES = {
  "cet-listening-a": ["Conversation One", "Conversation Two"],
  "cet-listening-b": ["Passage One", "Passage Two"],
  "cet-listening-c": ["Recording One", "Recording Two", "Recording Three"],
} as const;

type ListeningKind = keyof typeof DIRECTIONS;
type ChoiceQuestion = Extract<Question, { type: "single-choice" }>;

interface ListeningGroup {
  key: string;
  kind: ListeningKind;
  title: string;
  passage: string;
  questions: ChoiceQuestion[];
}

interface SpokenTurn {
  role: Exclude<SpeechRole, "narrator">;
  text: string;
}

export function buildListeningSpeechPlan(
  paper: ExamPaper,
  targetWpm: number,
): ListeningSpeechPlan {
  if (!Number.isFinite(targetWpm) || targetWpm < 140 || targetWpm > 200) {
    throw new Error("targetWpm must be between 140 and 200");
  }

  const segments: SpeechSegment[] = [
    {
      id: "opening",
      role: "narrator",
      text: "College English Test, Band 6, Part Two, Listening Comprehension, Section A.",
      pauseAfterMs: 600,
      section: "opening",
    },
  ];

  for (const kind of Object.keys(DIRECTIONS) as ListeningKind[]) {
    const groups = collectGroups(paper, kind);
    if (groups.length === 0) continue;
    segments.push({
      id: `${kind}-directions`,
      role: "narrator",
      text: DIRECTIONS[kind],
      pauseAfterMs: 800,
      section: kind,
    });

    groups.forEach((group, groupIndex) => {
      const title =
        GROUP_TITLES[kind][groupIndex] ??
        group.title ??
        `${kind} ${groupIndex + 1}`;
      const turns =
        kind === "cet-listening-a"
          ? parseConversationTurns(group.passage)
          : [{ role: "narrator" as SpeechRole, text: group.passage }];

      segments.push({
        id: `${group.key}-title`,
        role: "narrator",
        text: title,
        pauseAfterMs: GROUP_TITLE_PAUSE_MS,
        section: kind,
      });

      turns.forEach((turn, turnIndex) => {
        const sentences = splitSpeechSentences(
          prepareSpeechForTts(turn.text),
          500,
        );
        sentences.forEach((sentence, sentenceIndex) => {
          segments.push({
            id: `${group.key}-material-${turnIndex + 1}-${sentenceIndex + 1}`,
            role: turn.role,
            text: sentence,
            pauseAfterMs: SENTENCE_GAP_MS,
            section: kind,
          });
        });
        if (turnIndex < turns.length - 1) {
          const last = segments[segments.length - 1];
          if (last) last.pauseAfterMs = Math.max(last.pauseAfterMs, TURN_GAP_MS);
        }
      });

      const lastMaterial = segments[segments.length - 1];
      if (lastMaterial) {
        lastMaterial.pauseAfterMs = MATERIAL_TO_ANNOUNCEMENT_MS;
      }
      const numbers = group.questions
        .map((question) => question.examSection?.questionNumber)
        .filter((number): number is number => number != null);
      segments.push({
        id: `${group.key}-announcement`,
        role: "narrator",
        text: `Questions ${numbers[0]} to ${numbers[numbers.length - 1]} are based on the ${NOUNS[kind]} you have just heard.`,
        pauseAfterMs: ANNOUNCEMENT_TO_QUESTION_MS,
        section: kind,
      });

      group.questions.forEach((question) => {
        const number = question.examSection?.questionNumber;
        if (number == null) return;
        segments.push({
          id: `${group.key}-question-${number}`,
          role: "narrator",
          text: `Question ${number}. ${prepareSpeechForTts(
            normalizeQuestionStem(question.content),
          )}`,
          pauseAfterMs: QUESTION_GAP_MS,
          section: kind,
        });
      });
    });

  }

  return { version: 1, targetWpm, segments };
}

export function parseConversationTurns(
  transcript: string,
): Array<{ role: SpeechRole; text: string }> {
  const turns: SpokenTurn[] = [];
  let current: SpokenTurn | null = null;

  for (const rawLine of transcript.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(
      /^(Woman|Man|Women|Men|Host|Hostess|Guest|Narrator|W|M)\s*:\s*(.+)$/i,
    );
    if (match) {
      const label = match[1].toLowerCase();
      current = {
        role:
          label.startsWith("w") ||
          label === "host" ||
          label === "hostess" ||
          label === "narrator"
            ? "female"
            : "male",
        text: match[2].trim(),
      };
      turns.push(current);
    } else if (current) {
      current.text = `${current.text} ${line}`.trim();
    } else {
      current = { role: "male", text: line };
      turns.push(current);
    }
  }

  return turns.length > 0
    ? turns
    : [{ role: "narrator", text: transcript.trim() }];
}

function collectGroups(paper: ExamPaper, kind: ListeningKind): ListeningGroup[] {
  const buckets = new Map<string, ChoiceQuestion[]>();
  for (const question of paper.questions) {
    if (
      question.type !== "single-choice" ||
      question.examSection?.kind !== kind ||
      question.examSection.questionNumber == null
    ) {
      continue;
    }
    const key =
      question.examSection.groupId?.trim() ||
      question.examSection.title?.trim() ||
      `${kind}-ungrouped`;
    buckets.set(key, [...(buckets.get(key) ?? []), question]);
  }

  return [...buckets.entries()]
    .map(([key, questions]) => {
      const ordered = [...questions].sort(
        (left, right) =>
          (left.examSection?.questionNumber ?? 0) -
          (right.examSection?.questionNumber ?? 0),
      );
      const passage =
        ordered
          .map((question) => question.examSection?.passage?.trim())
          .find(Boolean) ?? "";
      return {
        key,
        kind,
        title: ordered[0]?.examSection?.title ?? "",
        passage,
        questions: ordered,
      };
    })
    .filter((group) => group.passage && group.questions.length > 0)
    .sort(
      (left, right) =>
        (left.questions[0]?.examSection?.questionNumber ?? 0) -
        (right.questions[0]?.examSection?.questionNumber ?? 0),
    );
}

function normalizeQuestionStem(stem: string): string {
  return stem.replace(/^\s*Q?\d+\s*[.、:：]\s*/i, "").trim();
}
