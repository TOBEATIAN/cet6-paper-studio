import { readFileSync } from "node:fs";
import { Agent } from "undici";
import type { ApiMessage } from "../src/lib/types/library";
import type { Cet6Blueprint } from "../src/lib/types/cet";
import {
  parseCet6ReadingBPassage,
  parseCet6Stage,
} from "../src/lib/cet/generate";
import {
  buildCet6ReadingBPassagePrompt,
  buildCet6StagePrompt,
} from "../src/lib/cet/pipelinePrompts";
import {
  arrangeReadingBQuestions,
  createReadingBAnswerPlan,
} from "../src/lib/cet/readingBPlan";
import { auditCet6Stage } from "../src/lib/cet/quality/audit";

const apiKey = process.env.CET6_LIVE_DEEPSEEK_KEY;
if (!apiKey) {
  throw new Error("CET6_LIVE_DEEPSEEK_KEY is not set");
}

const checkpointPath =
  process.argv[2] ??
  "E:\\Download\\CET-6\\generation\\cet6\\0343719e-c85d-499d-bb82-af28a0b2ec2a.json";
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as {
  paperId?: string;
  blueprint?: Cet6Blueprint;
};
if (!checkpoint.blueprint) throw new Error("checkpoint has no blueprint");
const blueprint = checkpoint.blueprint;
const answerPlan = createReadingBAnswerPlan(
  `${checkpoint.paperId ?? "probe"}\n${blueprint.title}\n${blueprint.topics.readingB ?? blueprint.topics.reading}`,
);
const dispatcher = new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 120_000,
  bodyTimeout: 300_000,
});

async function complete(messages: ApiMessage[]): Promise<string> {
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
    throw new Error(`DeepSeek HTTP ${response.status}: ${raw.slice(0, 1000)}`);
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
}

let passageCorrection: string | undefined;
let passage: string | undefined;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const reply = await complete(
    buildCet6ReadingBPassagePrompt(blueprint, passageCorrection),
  );
  const parsed = parseCet6ReadingBPassage(reply);
  console.log(`passage attempt ${attempt}: ${parsed.ok ? "PASS" : "FAIL"}`);
  if (parsed.ok) {
    passage = parsed.value;
    break;
  }
  console.error(parsed.error);
  passageCorrection = parsed.error;
}
if (!passage) throw new Error("Reading B passage failed after 3 attempts");

let statementCorrection: string | undefined;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const reply = await complete(
    buildCet6StagePrompt(
      "reading-b",
      blueprint,
      statementCorrection,
      {
        readingBPassage: passage,
        readingBAnswerIndexes: answerPlan.sourceIndexes,
      },
    ),
  );
  const parsed = parseCet6Stage("reading-b", reply, {
    forcedSharedPassage: passage,
    skipQualityAudit: true,
  });
  if (!parsed.ok) {
    console.log(`statements attempt ${attempt}: STRUCTURE FAIL`);
    console.error(parsed.error);
    statementCorrection = parsed.error;
    continue;
  }
  const reordered = arrangeReadingBQuestions(
    parsed.value,
    answerPlan.finalIndexes,
  );
  if (!reordered.ok) {
    console.log(`statements attempt ${attempt}: ANSWER PLAN FAIL`);
    console.error(reordered.error);
    statementCorrection = reordered.error;
    continue;
  }
  const quality = auditCet6Stage("reading-b", reordered.value);
  console.log(
    `statements attempt ${attempt}: ${quality.passed ? "PASS" : "QUALITY FAIL"}`,
  );
  if (quality.passed) {
    console.log(
      JSON.stringify({
        questions: reordered.value.length,
        answers: reordered.value.map((question) =>
          question.type === "single-choice"
            ? String.fromCharCode(65 + question.correctAnswer)
            : "?",
        ),
      }),
    );
    process.exit(0);
  }
  statementCorrection = quality.errors
    .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
    .join("\n");
  console.error(statementCorrection);
}
throw new Error("Reading B statements failed after 5 attempts");
