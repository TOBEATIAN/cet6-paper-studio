import fs from "node:fs";
import path from "node:path";
import { balanceChoiceAnswers, createBalancedAnswerIndexes } from "../src/lib/cet/answerOrder";
import {
  buildCet6Paper,
  parseCet6ReadingCQuestions,
  parseCet6Stage,
  validateCet6Paper,
} from "../src/lib/cet/generate";
import {
  buildCet6ReadingCQuestionsPrompt,
  buildCet6RepairMessage,
  buildCet6StagePrompt,
} from "../src/lib/cet/pipelinePrompts";
import {
  arrangeReadingBQuestions,
  createReadingBAnswerPlan,
} from "../src/lib/cet/readingBPlan";
import { createReadingCPlan } from "../src/lib/cet/readingCPlan";
import { auditCet6Paper, auditCet6Stage } from "../src/lib/cet/quality/audit";
import { CET6_STAGE_SPECS } from "../src/lib/cet/structure";
import { classifyWritingOpening, chooseWritingOpeningPlan } from "../src/lib/cet/writingPlan";
import { ExamPaperSchema, type Question } from "../src/lib/types/exam";
import {
  Cet6GenerationCheckpointSchema,
  type Cet6Blueprint,
  type Cet6ContentStage,
} from "../src/lib/types/cet";
import { paperToMarkdown } from "../src/lib/export/markdown";

const DATA_DIR = "E:\\Download\\CET-6";
const PAPER_ID = "eb32c436-372b-40f6-8f54-ad4a9b6ac830";
const PAPER_PATH = path.join(DATA_DIR, "papers", `${PAPER_ID}.json`);
const WORKING_PATH = path.join(DATA_DIR, "working-paper.json");
const INDEX_PATH = path.join(DATA_DIR, "papers", "index.json");
const CHECKPOINT_PATH = path.join(DATA_DIR, "generation", "cet6", `${PAPER_ID}.json`);
const REPAIR_DIR = path.join(DATA_DIR, ".repair-eb32c436");
const PROGRESS_PATH = path.join(REPAIR_DIR, "progress.json");
const apiKey = process.env.CET6_LIVE_DEEPSEEK_KEY;
if (!apiKey) throw new Error("CET6_LIVE_DEEPSEEK_KEY is not set");
const repairModel = process.env.CET6_REPAIR_MODEL || "deepseek-v4-pro";

fs.mkdirSync(REPAIR_DIR, { recursive: true });
const paper = ExamPaperSchema.parse(JSON.parse(fs.readFileSync(PAPER_PATH, "utf8")));
const checkpoint = Cet6GenerationCheckpointSchema.parse(
  JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8")),
);
if (!checkpoint.blueprint) throw new Error("Checkpoint has no blueprint");
const blueprint: Cet6Blueprint = {
  ...checkpoint.blueprint,
  topics: {
    ...checkpoint.blueprint.topics,
    listening:
      "campus technology, environmental science, public services, cultural heritage and accessibility",
    listeningCases: {
      a1: "A student and a campus accessibility adviser assess a sensor-based quiet-study room booking system, including booking fairness, noise readings and alternatives for students without phones.",
      a2: "Two colleagues debate an edible rooftop garden at a university, focusing on crop yields, volunteer scheduling and building maintenance.",
      b1: "A coastal town combines artificial reefs with local fishing logs to restore marine habitats while protecting small-boat livelihoods.",
      b2: "A hospital runs an interpreter-on-wheels service for patients with limited English, focusing on scheduling, privacy and emergency response.",
      c1: "A lecture explains how street trees and permeable pavements reduce urban heat, using temperature measurements and neighborhood equity evidence.",
      c2: "A public radio station restores obsolete analog audio archives, covering equipment scarcity, rights clearance and volunteer training.",
      c3: "A museum redesigns exhibit labels for visitors with low vision, using tactile maps, audio guides and structured user testing.",
    },
  },
};

interface Progress {
  startedAt: string;
  updatedAt: string;
  stages: Record<string, "running" | "complete" | "failed">;
}

const progress: Progress = fs.existsSync(PROGRESS_PATH)
  ? JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"))
  : { startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stages: {} };

function saveProgress(): void {
  progress.updatedAt = new Date().toISOString();
  atomicWrite(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.renameSync(temporary, file);
}

function stageFile(stage: Exclude<Cet6ContentStage, "blueprint">): string {
  return path.join(REPAIR_DIR, `${stage}.json`);
}

function loadCachedStage(stage: Exclude<Cet6ContentStage, "blueprint">): Question[] | null {
  const file = stageFile(stage);
  if (!fs.existsSync(file)) return null;
  try {
    const questions = JSON.parse(fs.readFileSync(file, "utf8")) as Question[];
    return auditCet6Stage(stage, questions).passed ? questions : null;
  } catch {
    return null;
  }
}

function saveStage(stage: Exclude<Cet6ContentStage, "blueprint">, questions: Question[]): void {
  atomicWrite(stageFile(stage), JSON.stringify(questions, null, 2));
  progress.stages[stage] = "complete";
  saveProgress();
  console.log(`[repair] ${stage}: saved ${questions.length} questions`);
}

async function complete(
  messages: Array<{ role: string; content: string }>,
  label: string,
  maxTokens: number,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      console.log(`[repair] ${label}: request ${attempt}`);
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: repairModel,
          messages,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(300_000),
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
          `Empty content: ${JSON.stringify({
            finishReason: parsed.choices?.[0]?.finish_reason,
            usage: parsed.usage,
            reasoningCharacters:
              parsed.choices?.[0]?.message?.reasoning_content?.length ?? 0,
          })}`,
        );
      }
      console.log(`[repair] ${label}: response ${content.length} chars`);
      return content;
    } catch (error) {
      lastError = error;
      console.error(
        `[repair] ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < 8) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, attempt * 3_000)));
      }
    }
  }
  throw lastError;
}

async function generateSimpleStage(
  stage: "writing" | "listening-a" | "listening-b" | "listening-c",
  options: {
    answerIndexes?: readonly number[];
    writingOpeningStyle?: ReturnType<typeof chooseWritingOpeningPlan>["style"];
  } = {},
): Promise<Question[]> {
  const cached = loadCachedStage(stage);
  if (cached) {
    console.log(`[repair] ${stage}: reuse cache`);
    return cached;
  }
  progress.stages[stage] = "running";
  saveProgress();
  let correction: string | undefined;
  let repairSource: string | undefined;
  let lastError = "Unknown validation error";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const base = buildCet6StagePrompt(stage, blueprint, correction, {
      listeningAnswerIndexes: options.answerIndexes,
      writingOpeningStyle: options.writingOpeningStyle,
    });
    const messages = repairSource
      ? [...base, buildCet6RepairMessage(repairSource, lastError)]
      : base;
    const reply = await complete(
      messages,
      `${stage} attempt ${attempt}`,
      stage === "writing" ? 8_192 : 32_768,
    );
    const parsed = parseCet6Stage(stage, reply, {
      expectedAnswerIndexes: options.answerIndexes,
      expectedWritingOpeningStyle: options.writingOpeningStyle,
    });
    if (parsed.ok) {
      saveStage(stage, parsed.value);
      return parsed.value;
    }
    lastError = parsed.error;
    correction = parsed.error;
    repairSource = reply;
    console.error(`[repair] ${stage} attempt ${attempt}: ${parsed.error}`);
  }
  progress.stages[stage] = "failed";
  saveProgress();
  throw new Error(`${stage} failed after 5 attempts: ${lastError}`);
}

async function generateListening(): Promise<Record<"listening-a" | "listening-b" | "listening-c", Question[]>> {
  const allIndexes = createBalancedAnswerIndexes(
    [6, 6, 6, 7],
    `${PAPER_ID}\n${blueprint.title}\nrepair-listening`,
  );
  const a = await generateSimpleStage("listening-a", {
    answerIndexes: allIndexes.slice(0, 8),
  });
  const b = await generateSimpleStage("listening-b", {
    answerIndexes: allIndexes.slice(8, 15),
  });
  const c = await generateSimpleStage("listening-c", {
    answerIndexes: allIndexes.slice(15, 25),
  });
  return {
    "listening-a": balanceChoiceAnswers(a, allIndexes.slice(0, 8)),
    "listening-b": balanceChoiceAnswers(b, allIndexes.slice(8, 15)),
    "listening-c": balanceChoiceAnswers(c, allIndexes.slice(15, 25)),
  };
}

async function generateReadingB(): Promise<Question[]> {
  const cached = loadCachedStage("reading-b");
  if (cached) return cached;
  progress.stages["reading-b"] = "running";
  saveProgress();
  const passage =
    paper.questions.find(
      (question) => question.examSection?.kind === "cet-reading-b",
    )?.examSection?.passage ?? "";
  if (!passage) throw new Error("Current paper has no Reading B passage");
  const plan = createReadingBAnswerPlan(
    `${PAPER_ID}\n${blueprint.title}\n${blueprint.topics.readingB ?? blueprint.topics.reading}`,
  );
  let correction: string | undefined;
  let repairSource: string | undefined;
  let lastError = "Unknown Reading B statement error";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const base = buildCet6StagePrompt("reading-b", blueprint, correction, {
      readingBPassage: passage,
      readingBAnswerIndexes: plan.sourceIndexes,
    });
    const messages = repairSource
      ? [...base, buildCet6RepairMessage(repairSource, lastError)]
      : base;
    const reply = await complete(messages, `reading-b attempt ${attempt}`, 32_768);
    const parsed = parseCet6Stage("reading-b", reply, {
      forcedSharedPassage: passage,
      skipQualityAudit: true,
    });
    if (!parsed.ok) {
      lastError = parsed.error;
      correction = parsed.error;
      repairSource = reply;
      console.error(`[repair] reading-b attempt ${attempt}: ${parsed.error}`);
      continue;
    }
    const reordered = arrangeReadingBQuestions(parsed.value, plan.finalIndexes);
    if (!reordered.ok) {
      lastError = reordered.error;
      correction = reordered.error;
      repairSource = reply;
      continue;
    }
    const quality = auditCet6Stage("reading-b", reordered.value);
    if (quality.passed) {
      saveStage("reading-b", reordered.value);
      return reordered.value;
    }
    lastError = quality.errors
      .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
      .join("\n");
    correction = lastError;
    repairSource = reply;
    console.error(`[repair] reading-b attempt ${attempt}: ${lastError}`);
  }
  progress.stages["reading-b"] = "failed";
  saveProgress();
  throw new Error(`reading-b failed after 6 attempts: ${lastError}`);
}

async function generateReadingC(): Promise<Question[]> {
  const cached = loadCachedStage("reading-c");
  if (cached) return cached;
  progress.stages["reading-c"] = "running";
  saveProgress();
  const passages = [0, 1].map((index) => {
    const questions = paper.questions.filter(
      (question) => question.examSection?.kind === "cet-reading-c",
    );
    return (
      questions.find(
        (question) =>
          question.examSection?.groupId === `cet6-reading-c-passage-${index + 1}` &&
          question.examSection.passage,
      )?.examSection?.passage ?? ""
    );
  });
  if (passages.some((passage) => !passage)) {
    throw new Error("Current paper is missing a Reading C passage");
  }
  const plan = createReadingCPlan(
    blueprint,
    `${PAPER_ID}\n${blueprint.title}\nreading-c-repair`,
  );
  let correction: string | undefined;
  let lastError = "Unknown Reading C error";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const questions: Question[] = [];
    let failed = false;
    for (let index = 0; index < 2; index += 1) {
      const passagePlan = plan.passages[index];
      const reply = await complete(
        buildCet6ReadingCQuestionsPrompt(
          blueprint,
          passagePlan,
          passages[index]!,
          correction,
        ),
        `reading-c passage ${index + 1} attempt ${attempt}`,
        32_768,
      );
      const parsed = parseCet6ReadingCQuestions(
        reply,
        passages[index]!,
        passagePlan.index,
        passagePlan.sourceParagraphs,
        passagePlan.questionKinds,
        passagePlan.answerIndexes,
        passagePlan.source,
      );
      if (!parsed.ok) {
        lastError = parsed.error;
        correction = parsed.error;
        failed = true;
        console.error(
          `[repair] reading-c passage ${index + 1} attempt ${attempt}: ${parsed.error}`,
        );
        break;
      }
      questions.push(...parsed.value);
    }
    if (failed) continue;
    const quality = auditCet6Stage("reading-c", questions);
    if (quality.passed) {
      saveStage("reading-c", questions);
      return questions;
    }
    lastError = quality.errors
      .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
      .join("\n");
    correction = lastError;
    console.error(`[repair] reading-c attempt ${attempt}: ${lastError}`);
  }
  progress.stages["reading-c"] = "failed";
  saveProgress();
  throw new Error(`reading-c failed after 6 attempts: ${lastError}`);
}

async function main(): Promise<void> {
  progress.stages.final = "running";
  saveProgress();
  const kept = Object.fromEntries(
    (["reading-a", "translation"] as const).map((stage) => [
      stage,
      paper.questions.filter(
        (question) => question.examSection?.kind === CET6_STAGE_SPECS[stage].kind,
      ),
    ]),
  ) as Record<"reading-a" | "translation", Question[]>;
  const openingStyle = classifyWritingOpening(
    paper.questions.find((question) => question.examSection?.kind === "cet-writing")
      ?.content.match(/[“"]([^”"]{20,})[”"]/)?.[1] ?? "",
  );

  // DeepSeek's TLS endpoint becomes unstable under two simultaneous long
  // generations. Keep the lanes resumable, but execute them serially.
  const writing = await generateSimpleStage("writing", {
    writingOpeningStyle: chooseWritingOpeningPlan(
      `${PAPER_ID}\n${blueprint.title}\nwriting-repair`,
      openingStyle ? [openingStyle] : [],
    ).style,
  });
  const listening = await generateListening();
  const readingB = await generateReadingB();
  const readingC = await generateReadingC();

  const repaired = buildCet6Paper(
    {
      ...kept,
      writing,
      ...listening,
      "reading-b": readingB,
      "reading-c": readingC,
    },
    new Date("2026-10-31T23:59:00.000Z"),
  );
  repaired.title = paper.title;
  const structuralErrors = validateCet6Paper(repaired);
  const quality = auditCet6Paper(repaired);
  atomicWrite(
    path.join(REPAIR_DIR, "final-audit.json"),
    JSON.stringify(
      {
        structuralErrors,
        errors: quality.errors,
        warnings: quality.warnings,
      },
      null,
      2,
    ),
  );
  if (structuralErrors.length || quality.errors.length) {
    progress.stages.final = "failed";
    saveProgress();
    throw new Error(
      `Final audit failed: ${[...structuralErrors, ...quality.errors.map((check) => `${check.label}: ${check.detail ?? ""}`)].join("\n")}`,
    );
  }

  const now = new Date().toISOString();
  checkpoint.questionsByStage = {
    ...checkpoint.questionsByStage,
    writing,
    ...listening,
    "reading-b": readingB,
    "reading-c": readingC,
  };
  checkpoint.updatedAt = now;
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as {
    activePaperId: string;
    papers: Array<{ id: string; title: string; updatedAt: string; questionCount: number }>;
  };
  index.activePaperId = PAPER_ID;
  index.papers = index.papers.map((entry) =>
    entry.id === PAPER_ID
      ? { ...entry, title: repaired.title, updatedAt: now, questionCount: repaired.questions.length }
      : entry,
  );
  atomicWrite(PAPER_PATH, JSON.stringify(repaired, null, 2));
  atomicWrite(WORKING_PATH, JSON.stringify(repaired, null, 2));
  atomicWrite(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  atomicWrite(INDEX_PATH, JSON.stringify(index, null, 2));
  atomicWrite(
    path.join(DATA_DIR, `${repaired.title}-仅试题.md`),
    paperToMarkdown(repaired, {
      includeAnswers: false,
      header: { subject: true, studentName: true, duration: true, totalScore: true, score: true },
    }),
  );
  atomicWrite(
    path.join(DATA_DIR, `${repaired.title}-含答案.md`),
    paperToMarkdown(repaired, {
      includeAnswers: true,
      header: { subject: true, studentName: true, duration: true, totalScore: true, score: true },
    }),
  );
  progress.stages.final = "complete";
  saveProgress();
  console.log(`[repair] complete: ${PAPER_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  progress.stages.final = "failed";
  saveProgress();
  process.exitCode = 1;
});
