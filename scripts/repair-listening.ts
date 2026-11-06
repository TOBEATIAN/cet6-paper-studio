import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { extractJson } from "../src/lib/api/extractJson";
import { createBalancedAnswerIndexes } from "../src/lib/cet/answerOrder";
import { parseCet6Stage } from "../src/lib/cet/generate";
import { QuestionSchema, type Question } from "../src/lib/types/exam";

const PAPER_ID = "eb32c436-372b-40f6-8f54-ad4a9b6ac830";
const REPAIR_DIR = "E:\\Download\\CET-6\\.repair-eb32c436";
const apiKey = process.env.CET6_LIVE_DEEPSEEK_KEY;
if (!apiKey) throw new Error("CET6_LIVE_DEEPSEEK_KEY is not set");
fs.mkdirSync(REPAIR_DIR, { recursive: true });
const model = process.env.CET6_REPAIR_MODEL || "deepseek-v4-pro";

type Stage = "listening-a" | "listening-b" | "listening-c";
interface GroupSpec {
  stage: Stage;
  index: number;
  numbers: number[];
  score: number;
  groupId: string;
  title: string;
  noun: string;
  topic: string;
  targetWords: string;
  dialogue: boolean;
}

const groups: GroupSpec[] = [
  {
    stage: "listening-a",
    index: 0,
    numbers: [1, 2, 3, 4],
    score: 7.1,
    groupId: "conversation-1",
    title: "Listening Section A · Conversation 1",
    noun: "conversation",
    topic: "A student and a campus accessibility adviser assess a sensor-based quiet-study room booking system, including booking fairness, noise readings and alternatives for students without phones.",
    targetWords: "380-400",
    dialogue: true,
  },
  {
    stage: "listening-a",
    index: 1,
    numbers: [5, 6, 7, 8],
    score: 7.1,
    groupId: "conversation-2",
    title: "Listening Section A · Conversation 2",
    noun: "conversation",
    topic: "Two colleagues debate an edible rooftop garden at a university, focusing on crop yields, volunteer scheduling and building maintenance.",
    targetWords: "380-400",
    dialogue: true,
  },
  {
    stage: "listening-b",
    index: 0,
    numbers: [9, 10, 11],
    score: 7.1,
    groupId: "passage-1",
    title: "Listening Section B · Passage 1",
    noun: "passage",
    topic: "A coastal town combines artificial reefs with local fishing logs to restore marine habitats while protecting small-boat livelihoods.",
    targetWords: "330-360",
    dialogue: false,
  },
  {
    stage: "listening-b",
    index: 1,
    numbers: [12, 13, 14, 15],
    score: 7.1,
    groupId: "passage-2",
    title: "Listening Section B · Passage 2",
    noun: "passage",
    topic: "A hospital runs an interpreter-on-wheels service for patients with limited English, focusing on scheduling, privacy and emergency response.",
    targetWords: "330-360",
    dialogue: false,
  },
  {
    stage: "listening-c",
    index: 0,
    numbers: [16, 17, 18],
    score: 14.2,
    groupId: "recording-1",
    title: "Listening Section C · Recording 1",
    noun: "recording",
    topic: "A lecture explains how street trees and permeable pavements reduce urban heat, using temperature measurements and neighborhood equity evidence.",
    targetWords: "430-470",
    dialogue: false,
  },
  {
    stage: "listening-c",
    index: 1,
    numbers: [19, 20, 21],
    score: 14.2,
    groupId: "recording-2",
    title: "Listening Section C · Recording 2",
    noun: "recording",
    topic: "A public radio station restores obsolete analog audio archives, covering equipment scarcity, rights clearance and volunteer training.",
    targetWords: "430-470",
    dialogue: false,
  },
  {
    stage: "listening-c",
    index: 2,
    numbers: [22, 23, 24, 25],
    score: 14.2,
    groupId: "recording-3",
    title: "Listening Section C · Recording 3",
    noun: "recording",
    topic: "A museum redesigns exhibit labels for visitors with low vision, using tactile maps, audio guides and structured user testing.",
    targetWords: "430-470",
    dialogue: false,
  },
];

const listeningAAnswers = createBalancedAnswerIndexes(
  [2, 2, 2, 2],
  `${PAPER_ID}\nlistening-a\nlistening-answers`,
);
const listeningBAnswers = createBalancedAnswerIndexes(
  [2, 2, 2, 1],
  `${PAPER_ID}\nlistening-b\nlistening-answers`,
  listeningAAnswers.slice(-2),
);
const listeningCAnswers = createBalancedAnswerIndexes(
  [2, 2, 2, 4],
  `${PAPER_ID}\nlistening-c\nlistening-answers`,
  [...listeningAAnswers, ...listeningBAnswers].slice(-2),
);

function answerFor(number: number): number {
  if (number <= 8) return listeningAAnswers[number - 1]!;
  if (number <= 15) return listeningBAnswers[number - 9]!;
  return listeningCAnswers[number - 16]!;
}

function groupCache(spec: GroupSpec): string {
  return path.join(REPAIR_DIR, `${spec.stage}-group-${spec.index + 1}.json`);
}

function stageCache(stage: Stage): string {
  return path.join(REPAIR_DIR, `${stage}.json`);
}

function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.tmp-${Date.now()}`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.renameSync(temporary, file);
}

function cachedGroup(spec: GroupSpec): Question[] | null {
  const file = groupCache(spec);
  if (!fs.existsSync(file)) return null;
  try {
    return z.array(QuestionSchema).parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

async function complete(prompt: string, label: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      console.log(`[listen] ${label}: request ${attempt}`);
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are an experienced CET-6 listening assessment writer. Return only one valid JSON object.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 32_768,
          stream: false,
        }),
        signal: AbortSignal.timeout(180_000),
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}: ${raw.slice(0, 800)}`);
      }
      const parsed = JSON.parse(raw) as {
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; reasoning_content?: string };
        }>;
        usage?: unknown;
      };
      const content = parsed.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(
          `DeepSeek returned empty content: ${JSON.stringify({
            finishReason: parsed.choices?.[0]?.finish_reason,
            usage: parsed.usage,
            reasoningCharacters:
              parsed.choices?.[0]?.message?.reasoning_content?.length ?? 0,
          })}`,
        );
      }
      console.log(`[listen] ${label}: response ${content.length} chars`);
      return content;
    } catch (error) {
      lastError = error;
      console.error(
        `[listen] ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < 8) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(20_000, attempt * 2_500)),
        );
      }
    }
  }
  throw lastError;
}

function groupPrompt(spec: GroupSpec): string {
  const answerMap = spec.numbers
    .map((number) => `Q${number}=${String.fromCharCode(65 + answerFor(number))}`)
    .join(", ");
  const voiceRule = spec.dialogue
    ? "The transcript must use alternating `Woman:` and `Man:` labels with at least two turns from each speaker."
    : "Use one clear narrator/speaker voice. Do not include speaker labels in the passage.";
  const kind =
    spec.stage === "listening-a"
      ? "cet-listening-a"
      : spec.stage === "listening-b"
        ? "cet-listening-b"
        : "cet-listening-c";
  return `Write one original CET-6 Listening ${spec.noun} and exactly ${spec.numbers.length} single-choice questions.

Topic: ${spec.topic}
Transcript length: ${spec.targetWords} English words.
${voiceRule}

Quality rules:
- The transcript must be coherent, natural, original, and contain enough exact detail for every answer.
- Use 15%-18.8% words of eight or more letters in this group.
- Each question stem should be 10-12 words.
- Each option should be about 7-9 words; within each question the longest-minus-shortest spread must be at most 6 words.
- The correct option must not systematically be the longest.
- Options must be genuinely plausible, but only one may be correct.
- Every explanation must be in Simplified Chinese, quote at least 8 English words copied exactly from the transcript, share at least two content words with the correct option, briefly explain why each of the three distractors is wrong, and end with the exact form “故选 X。”.
- X must match that question's zero-based correctAnswer and the fixed answer map.
- Do not copy real CET material.

Fixed answers: ${answerMap}
Question numbers: ${spec.numbers.join(", ")}
examSection.kind: ${kind}
examSection.groupId: ${spec.groupId}
examSection.title: ${spec.title}
score per question: ${spec.score}

Return:
{"questions":[{"id":"group-1","type":"single-choice","content":"stem","options":["...","...","...","..."],"correctAnswer":0,"explanation":"中文解析，引用英文…故选 A。","score":${spec.score},"examSection":{"kind":"${kind}","groupId":"${spec.groupId}","title":"${spec.title}","questionNumber":${spec.numbers[0]},"passage":"full transcript"}}]}

Put the full transcript in examSection.passage on the first question only. Omit it from the remaining questions. Return exactly ${spec.numbers.length} questions and no prose outside JSON.`;
}

function normalizeGroup(spec: GroupSpec, questions: Question[]): Question[] {
  return questions.map((question, index) => ({
    ...question,
    id: `${spec.stage}-${spec.groupId}-${index + 1}`,
    type: "single-choice",
    score: spec.score,
    examSection: {
      ...question.examSection,
      kind: spec.stage === "listening-a"
        ? "cet-listening-a"
        : spec.stage === "listening-b"
          ? "cet-listening-b"
          : "cet-listening-c",
      groupId: spec.groupId,
      title: spec.title,
      questionNumber: spec.numbers[index],
      passage: index === 0 ? question.examSection?.passage : undefined,
    },
  }));
}

async function generateGroup(spec: GroupSpec, correction?: string): Promise<Question[]> {
  const cached = correction ? null : cachedGroup(spec);
  if (cached) {
    console.log(`[listen] ${spec.stage} group ${spec.index + 1}: reuse cache`);
    return cached;
  }
  let repair = correction;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const prompt = `${groupPrompt(spec)}${repair ? `\n\nPrevious attempt failed these checks. Fix them and return the complete group again:\n${repair}` : ""}`;
    const reply = await complete(
      prompt,
      `${spec.stage} group ${spec.index + 1} content ${attempt}`,
    );
    const extracted = extractJson(reply);
    if (!extracted.json) {
      repair = "No valid JSON object was returned.";
      continue;
    }
    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(extracted.json);
    } catch (error) {
      repair = error instanceof Error ? error.message : String(error);
      continue;
    }
    const parsed = z
      .object({ questions: z.array(QuestionSchema).length(spec.numbers.length) })
      .safeParse(jsonValue);
    if (!parsed.success) {
      repair = parsed.error.message;
      continue;
    }
    const questions = normalizeGroup(spec, parsed.data.questions);
    const answersOk = questions.every(
      (question, index) =>
        question.type === "single-choice" &&
        question.correctAnswer === answerFor(spec.numbers[index]!),
    );
    if (!answersOk) {
      repair = `Use this exact fixed answer map: ${spec.numbers.map((number) => `Q${number}=${String.fromCharCode(65 + answerFor(number))}`).join(", ")}.`;
      continue;
    }
    atomicWrite(groupCache(spec), JSON.stringify(questions, null, 2));
    console.log(`[listen] ${spec.stage} group ${spec.index + 1}: saved`);
    return questions;
  }
  throw new Error(`${spec.stage} group ${spec.index + 1} failed`);
}

async function buildStage(stage: Stage): Promise<void> {
  if (fs.existsSync(stageCache(stage))) {
    console.log(`[listen] ${stage}: already complete`);
    return;
  }
  const stageGroups = groups.filter((group) => group.stage === stage);
  let repair: string | undefined;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const questions: Question[] = [];
    for (const group of stageGroups) {
      const relevant =
        repair == null ||
        group.numbers.some((number) => repair?.includes(`Q${number}`));
      questions.push(
        ...(await generateGroup(group, relevant ? repair : undefined)),
      );
    }
    const reply = `\`\`\`json\n${JSON.stringify({ questions })}\n\`\`\``;
    const parsed = parseCet6Stage(stage, reply, {
      expectedAnswerIndexes: stageGroups
        .flatMap((group) => group.numbers)
        .map(answerFor),
    });
    if (parsed.ok) {
      atomicWrite(stageCache(stage), JSON.stringify(parsed.value, null, 2));
      console.log(`[listen] ${stage}: complete`);
      return;
    }
    repair = parsed.error;
    console.error(`[listen] ${stage} attempt ${attempt}: ${parsed.error}`);
  }
  throw new Error(`${stage} combined validation failed after 8 attempts`);
}

async function main(): Promise<void> {
  await buildStage("listening-a");
  await buildStage("listening-b");
  await buildStage("listening-c");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
