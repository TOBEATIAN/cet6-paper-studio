import { readFileSync } from "node:fs";
import { Agent } from "undici";
import type { ApiMessage } from "../src/lib/types/library";
import type {
  Cet6Blueprint,
  Cet6ContentStage,
} from "../src/lib/types/cet";
import type { Question } from "../src/lib/types/exam";
import { parseCet6Stage } from "../src/lib/cet/generate";
import {
  buildCet6RepairMessage,
  buildCet6StagePrompt,
} from "../src/lib/cet/pipelinePrompts";
import { createReadingAAnswerIndexes } from "../src/lib/cet/answerOrder";
import { createWritingOpeningPlan } from "../src/lib/cet/writingPlan";
import {
  chineseCount,
  longWordPercent,
  wordCount,
} from "../src/lib/cet/quality/textMetrics";

const apiKey = process.env.CET6_LIVE_DEEPSEEK_KEY;
if (!apiKey) throw new Error("CET6_LIVE_DEEPSEEK_KEY is not set");

const checkpointPath =
  process.argv[2] ??
  "E:\\Download\\CET-6\\generation\\cet6\\0343719e-c85d-499d-bb82-af28a0b2ec2a.json";
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as {
  paperId?: string;
  blueprint?: Cet6Blueprint;
};
if (!checkpoint.blueprint) throw new Error("checkpoint has no blueprint");
const blueprint = checkpoint.blueprint;
const paperId = checkpoint.paperId ?? "full-stage-probe";
const dispatcher = new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 120_000,
  bodyTimeout: 300_000,
});

async function complete(messages: ApiMessage[]): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-flash",
          messages,
          max_tokens: 65_536,
          stream: false,
        }),
        dispatcher,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(
          `DeepSeek HTTP ${response.status}: ${raw.slice(0, 1000)}`,
        );
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
          `DeepSeek returned no content: ${JSON.stringify({
            finishReason: parsed.choices?.[0]?.finish_reason,
            usage: parsed.usage,
            reasoningCharacters:
              parsed.choices?.[0]?.message?.reasoning_content?.length ?? 0,
          })}`,
        );
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError;
}

const writingStyle = createWritingOpeningPlan(
  `${paperId}\n${blueprint.title}\nwriting`,
).style;
const readingAAnswers = createReadingAAnswerIndexes(
  `${paperId}\n${blueprint.title}\nreading-a`,
);

const defaultStages: Cet6ContentStage[] = [
  "writing",
  "listening-a",
  "listening-b",
  "listening-c",
  "reading-a",
  "translation",
];
const requestedStages = process.argv.slice(3) as Cet6ContentStage[];
const stages =
  requestedStages.length > 0
    ? defaultStages.filter((stage) => requestedStages.includes(stage))
    : defaultStages;
if (stages.length === 0) {
  throw new Error(`No known stage requested: ${requestedStages.join(", ")}`);
}

for (const stage of stages) {
  let correction: string | undefined;
  let repairSource: string | undefined;
  let parsedQuestions: Question[] | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const baseMessages = buildCet6StagePrompt(stage, blueprint, correction, {
        readingAAnswerIndexes:
          stage === "reading-a" ? readingAAnswers : undefined,
        writingOpeningStyle: stage === "writing" ? writingStyle : undefined,
      });
    const reply = await complete(
      repairSource
        ? [
            ...baseMessages,
            buildCet6RepairMessage(repairSource, correction ?? "Unknown error"),
          ]
        : baseMessages,
    );
    const parsed = parseCet6Stage(stage, reply, {
      expectedAnswerIndexes:
        stage === "reading-a" ? readingAAnswers : undefined,
      expectedWritingOpeningStyle:
        stage === "writing" ? writingStyle : undefined,
    });
    console.log(
      `${stage} attempt ${attempt}: ${parsed.ok ? "PASS" : "FAIL"}`,
    );
    if (parsed.ok) {
      parsedQuestions = parsed.value;
      break;
    }
    correction = parsed.error;
    repairSource = reply;
    console.error(parsed.error);
  }
  if (!parsedQuestions) {
    throw new Error(`${stage} failed after 5 attempts`);
  }
  if (stage === "writing") {
    const writing = parsedQuestions[0];
    if (writing?.type === "essay") {
      const given =
        writing.content.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim() ?? "";
      console.log(
        JSON.stringify({
          openingStyle: writingStyle,
          givenWords: wordCount(given),
          givenLongWordPercent: Number(longWordPercent(given).toFixed(1)),
        }),
      );
    }
  } else if (stage.startsWith("listening")) {
    const answers = parsedQuestions.flatMap((question) =>
      question.type === "single-choice"
        ? [String.fromCharCode(65 + question.correctAnswer)]
        : [],
    );
    console.log(JSON.stringify({ answers }));
  } else if (stage === "reading-a") {
    console.log(
      JSON.stringify({
        answers: parsedQuestions.map((question) =>
          question.type === "single-choice"
            ? String.fromCharCode(65 + question.correctAnswer)
            : "?",
        ),
      }),
    );
  } else if (stage === "translation") {
    const translation = parsedQuestions[0];
    if (translation?.type === "short-answer") {
      console.log(
        JSON.stringify({
          chineseCharacters: chineseCount(translation.content),
          referenceWords: wordCount(translation.referenceAnswer),
          glossary: translation.examSection?.glossary?.length ?? 0,
        }),
      );
    }
  }
}

