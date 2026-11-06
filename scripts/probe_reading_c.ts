import { readFileSync } from "node:fs";
import { Agent } from "undici";
import type { ApiMessage } from "../src/lib/types/library";
import type { Cet6Blueprint } from "../src/lib/types/cet";
import type { Question } from "../src/lib/types/exam";
import {
  parseCet6ReadingCPassage,
  parseCet6ReadingCQuestions,
  validateCet6StageQuestions,
} from "../src/lib/cet/generate";
import {
  buildCet6ReadingCPassagePrompt,
  buildCet6ReadingCQuestionsPrompt,
} from "../src/lib/cet/pipelinePrompts";
import { createReadingCPlan } from "../src/lib/cet/readingCPlan";
import { auditCet6Stage } from "../src/lib/cet/quality/audit";

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
const plan = createReadingCPlan(
  blueprint,
  `${checkpoint.paperId ?? "probe"}\n${blueprint.title}\nreading-c`,
);
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

const passages: string[] = [];
for (const passagePlan of plan.passages) {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const reply = await complete(
      buildCet6ReadingCPassagePrompt(passagePlan, correction),
    );
    const parsed = parseCet6ReadingCPassage(
      reply,
      passagePlan.paragraphCount,
    );
    console.log(
      `passage ${passagePlan.index + 1} attempt ${attempt}: ${parsed.ok ? "PASS" : "FAIL"}`,
    );
    if (parsed.ok) {
      passages.push(parsed.value);
      break;
    }
    correction = parsed.error;
    console.error(parsed.error);
  }
  if (passages.length !== passagePlan.index + 1) {
    throw new Error(
      `Reading C passage ${passagePlan.index + 1} failed after 5 attempts`,
    );
  }
}

let correction: string | undefined;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const questions: Question[] = [];
  let failed = false;
  for (let index = 0; index < plan.passages.length; index += 1) {
    const passagePlan = plan.passages[index];
    const reply = await complete(
      buildCet6ReadingCQuestionsPrompt(
        blueprint,
        passagePlan,
        passages[index],
        correction,
      ),
    );
    const parsed = parseCet6ReadingCQuestions(
      reply,
      passages[index],
      passagePlan.index,
      passagePlan.sourceParagraphs,
      passagePlan.questionKinds,
      passagePlan.answerIndexes,
      passagePlan.source,
    );
    if (!parsed.ok) {
      console.log(
        `questions passage ${passagePlan.index + 1} attempt ${attempt}: STRUCTURE FAIL`,
      );
      console.error(parsed.error);
      correction = parsed.error;
      failed = true;
      break;
    }
    questions.push(...parsed.value);
  }
  if (failed) continue;
  const structural = validateCet6StageQuestions("reading-c", questions);
  if (structural.length > 0) {
    console.log(`questions attempt ${attempt}: STRUCTURE FAIL`);
    correction = structural.join("\n");
    console.error(correction);
    continue;
  }
  const quality = auditCet6Stage("reading-c", questions);
  console.log(
    `questions attempt ${attempt}: ${quality.passed ? "PASS" : "QUALITY FAIL"}`,
  );
  if (quality.passed) {
    console.log(
      JSON.stringify({
        answers: questions.map((question) =>
          question.type === "single-choice"
            ? String.fromCharCode(65 + question.correctAnswer)
            : "?",
        ),
        kinds: questions.map(
          (question) => question.examSection?.questionKind,
        ),
      }),
    );
    process.exit(0);
  }
  correction = quality.errors
    .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
    .join("\n");
  console.error(correction);
}
throw new Error("Reading C questions failed after 5 attempts");
