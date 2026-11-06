import fs from "node:fs";
import path from "node:path";
import {
  buildCet6Paper,
  validateCet6Paper,
} from "../src/lib/cet/generate";
import { auditCet6Paper, auditCet6Stage } from "../src/lib/cet/quality/audit";
import { paperToMarkdown } from "../src/lib/export/markdown";
import { upsertPaperMeta } from "../src/lib/exam/paperLibrary";
import { ExamPaperSchema, type Question } from "../src/lib/types/exam";
import {
  Cet6GenerationCheckpointSchema,
  type Cet6ContentStage,
} from "../src/lib/types/cet";
import { PaperIndexSchema } from "../src/lib/types/library";

const DATA_DIR = "E:\\Download\\CET-6";
const PAPER_ID = "eb32c436-372b-40f6-8f54-ad4a9b6ac830";
const REPAIR_DIR = path.join(DATA_DIR, `.repair-${PAPER_ID.slice(0, 8)}`);
const PAPER_PATH = path.join(DATA_DIR, "papers", `${PAPER_ID}.json`);
const WORKING_PATH = path.join(DATA_DIR, "working-paper.json");
const INDEX_PATH = path.join(DATA_DIR, "papers", "index.json");
const CHECKPOINT_PATH = path.join(
  DATA_DIR,
  "generation",
  "cet6",
  `${PAPER_ID}.json`,
);
const AUDIT_PATH = path.join(REPAIR_DIR, "final-audit.json");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadRepairedStage(stage: Cet6ContentStage): Question[] {
  const questions = readJson(path.join(REPAIR_DIR, `${stage}.json`)) as Question[];
  const report = auditCet6Stage(stage, questions);
  if (!report.passed) {
    throw new Error(
      `${stage} stage audit failed: ${report.errors
        .map((check) => `${check.label}: ${check.detail ?? ""}`)
        .join(" | ")}`,
    );
  }
  return questions;
}

function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.renameSync(temporary, file);
}

const currentPaper = ExamPaperSchema.parse(readJson(WORKING_PATH));
const checkpoint = Cet6GenerationCheckpointSchema.parse(
  readJson(CHECKPOINT_PATH),
);
if (checkpoint.paperId !== PAPER_ID) {
  throw new Error(`Checkpoint belongs to ${checkpoint.paperId}, expected ${PAPER_ID}`);
}

const questionsByStage = {
  writing: loadRepairedStage("writing"),
  "listening-a": loadRepairedStage("listening-a"),
  "listening-b": loadRepairedStage("listening-b"),
  "listening-c": loadRepairedStage("listening-c"),
  "reading-a": currentPaper.questions.filter(
    (question) => question.examSection?.kind === "cet-reading-a",
  ),
  "reading-b": loadRepairedStage("reading-b"),
  "reading-c": loadRepairedStage("reading-c"),
  translation: currentPaper.questions.filter(
    (question) => question.examSection?.kind === "cet-translation",
  ),
} satisfies Record<Cet6ContentStage, Question[]>;

const repaired = buildCet6Paper(
  questionsByStage,
  new Date(2026, 9, 31, 12, 0, 0),
);
repaired.title = currentPaper.title;
const structuralErrors = validateCet6Paper(repaired);
const quality = auditCet6Paper(repaired);

const audit = {
  paperId: PAPER_ID,
  title: repaired.title,
  validatedAt: new Date().toISOString(),
  structuralErrors,
  questionCount: repaired.questions.length,
  errors: quality.errors,
  warnings: quality.warnings,
  checks: quality.checks,
  metrics: quality.metrics,
};
atomicWrite(AUDIT_PATH, JSON.stringify(audit, null, 2));

if (structuralErrors.length > 0 || quality.errors.length > 0) {
  throw new Error(
    [
      ...structuralErrors,
      ...quality.errors.map(
        (check) => `${check.label}: ${check.detail ?? ""}`,
      ),
    ].join("\n"),
  );
}

const now = new Date().toISOString();
const nextCheckpoint = {
  ...checkpoint,
  questionsByStage,
  updatedAt: now,
};
const currentIndex = PaperIndexSchema.parse(readJson(INDEX_PATH));
const nextIndex = upsertPaperMeta(
  currentIndex,
  PAPER_ID,
  repaired,
  now,
);

atomicWrite(PAPER_PATH, JSON.stringify(repaired, null, 2));
atomicWrite(WORKING_PATH, JSON.stringify(repaired, null, 2));
atomicWrite(
  CHECKPOINT_PATH,
  JSON.stringify(Cet6GenerationCheckpointSchema.parse(nextCheckpoint), null, 2),
);
atomicWrite(INDEX_PATH, JSON.stringify(PaperIndexSchema.parse(nextIndex), null, 2));
atomicWrite(
  path.join(DATA_DIR, `${repaired.title}-仅试题.md`),
  paperToMarkdown(repaired, {
    includeAnswers: false,
    header: {
      subject: true,
      studentName: true,
      duration: true,
      totalScore: true,
      score: true,
    },
  }),
);
atomicWrite(
  path.join(DATA_DIR, `${repaired.title}-含答案.md`),
  paperToMarkdown(repaired, {
    includeAnswers: true,
    header: {
      subject: true,
      studentName: true,
      duration: true,
      totalScore: true,
      score: true,
    },
  }),
);

console.log(
  JSON.stringify(
    {
      saved: true,
      paperPath: PAPER_PATH,
      questionCount: repaired.questions.length,
      structuralErrors: structuralErrors.length,
      auditErrors: quality.errors.length,
      auditWarnings: quality.warnings.length,
      auditPath: AUDIT_PATH,
    },
    null,
    2,
  ),
);
