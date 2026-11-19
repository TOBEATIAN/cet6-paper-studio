import {
  AnswerCandidateResponseSchema,
  AnswerSearchResultSchema,
  ImportedPageDraftSchema,
  ImportedPaperDraftSchema,
  type AnswerSearchResult,
  type AnswerSearchRow,
  type ImportedBlock,
  type ImportedPageDraft,
  type ImportedPaperDraft,
} from "../types/import";
import type { Cet6ContentStage } from "../types/cet";
import type { ExamPaper, Question } from "../types/exam";
import { CET6_STAGE_SPECS } from "../cet/structure";
import { buildCet6Paper } from "../cet/generate";
import { extractJson } from "../api/extractJson";

export function parseImportedPageDraft(raw: string): ImportedPageDraft {
  const { json } = extractJson(raw);
  if (!json) throw new Error("importNoJson");
  const parsed = JSON.parse(json) as {
    blocks?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  if (Array.isArray(parsed.blocks)) {
    parsed.blocks = parsed.blocks.map((block, index) => {
      const rawStage = String(block.stage ?? "");
      const normalizedStage =
        (Object.entries(CET6_STAGE_SPECS) as Array<
          [Cet6ContentStage, (typeof CET6_STAGE_SPECS)[Cet6ContentStage]]
        >).find(
          ([stage, spec]) => stage === rawStage || spec.kind === rawStage,
        )?.[0] ?? rawStage;
      return {
        ...block,
        stage: normalizedStage,
        groupId:
          typeof block.groupId === "string" && block.groupId.trim()
            ? block.groupId
            : `${normalizedStage || "section"}-${index + 1}`,
        questions: Array.isArray(block.questions)
          ? block.questions.map((question) => {
              if (!question || typeof question !== "object") return question;
              const row = question as Record<string, unknown>;
              return {
                ...row,
                content:
                  typeof row.content === "string"
                    ? row.content
                    : typeof row.stem === "string"
                      ? row.stem
                      : "",
                options: Array.isArray(row.options)
                  ? row.options.map((option) => {
                      if (typeof option === "string") return option;
                      if (!option || typeof option !== "object") return "";
                      const record = option as Record<string, unknown>;
                      return String(
                        record.text ?? record.content ?? record.label ?? "",
                      );
                    })
                  : [],
                answerLetter:
                  row.answerLetter ?? row.answer ?? row.correctAnswer,
              };
            })
          : [],
      };
    });
  }
  return ImportedPageDraftSchema.parse(parsed);
}

export function mergeImportedPages(
  pages: readonly ImportedPageDraft[],
  input: {
    mode: "full" | "section";
    selectedStages: Cet6ContentStage[];
    sourceFileName: string;
    listeningAudioPath?: string;
  },
): ImportedPaperDraft {
  const blocks = new Map<string, ImportedBlock>();
  const warnings: string[] = [];
  for (const page of pages) {
    warnings.push(...page.warnings);
    for (const block of page.blocks) {
      if (
        input.mode === "section" &&
        !input.selectedStages.includes(block.stage)
      ) {
        continue;
      }
      const key = `${block.stage}:${block.groupId}`;
      const existing = blocks.get(key);
      if (!existing) {
        blocks.set(key, { ...block, questions: [...block.questions] });
        continue;
      }
      const mergedQuestions = [...existing.questions];
      for (const question of block.questions) {
        const currentIndex =
          question.sourceQuestionNumber == null
            ? -1
            : mergedQuestions.findIndex(
                (item) =>
                  item.sourceQuestionNumber === question.sourceQuestionNumber,
              );
        if (currentIndex >= 0) {
          const current = mergedQuestions[currentIndex];
          mergedQuestions[currentIndex] = {
            ...current,
            content: current.content || question.content,
            options:
              current.options.length >= question.options.length
                ? current.options
                : question.options,
            answerLetter: current.answerLetter ?? question.answerLetter,
            explanation: current.explanation || question.explanation,
          };
        } else {
          mergedQuestions.push(question);
        }
      }
      blocks.set(key, {
        ...existing,
        heading: existing.heading || block.heading,
        passage: joinPassage(existing.passage, block.passage),
        questions: mergedQuestions,
      });
    }
  }
  return ImportedPaperDraftSchema.parse({
    mode: input.mode,
    selectedStages: input.selectedStages,
    title: pages.find((page) => page.title.trim())?.title ?? "",
    examDate: pages.find((page) => page.examDate.trim())?.examDate ?? "",
    setLabel: pages.find((page) => page.setLabel.trim())?.setLabel ?? "",
    sourceFileName: input.sourceFileName,
    listeningAudioPath: input.listeningAudioPath ?? "",
    blocks: [...blocks.values()],
    warnings: [...new Set(warnings)].filter(Boolean),
  });
}

export function importedDraftToPaper(
  draft: ImportedPaperDraft,
  options: { answersConfirmed?: boolean } = {},
): ExamPaper {
  const byStage = new Map<Cet6ContentStage, Question[]>();
  for (const block of draft.blocks) {
    const spec = CET6_STAGE_SPECS[block.stage];
    const questions = block.questions.map((source, index) => {
      const common = {
        id: `import-${block.stage}-${block.groupId}-${source.sourceQuestionNumber ?? index + 1}`,
        content: source.content,
        score: spec.scorePerQuestion,
        examSection: {
          kind: spec.kind,
          groupId: `import-${block.stage}-${block.groupId}`,
          title: block.heading || spec.labelEn,
          passage: index === 0 && block.passage ? block.passage : undefined,
          questionNumber: source.sourceQuestionNumber,
          sourceExam: {
            examDate: block.examDate || draft.examDate,
            setLabel: block.setLabel || draft.setLabel,
            sourceQuestionNumber: source.sourceQuestionNumber,
            sourcePassage: passageNumber(block.groupId),
          },
          ...(spec.hidePassageForStudent
            ? { hidePassageForStudent: true }
            : {}),
        },
        answerProvenance: {
          status:
            source.answerStatus ??
            (source.answerLetter ? ("provided" as const) : ("missing" as const)),
          sources: source.answerSources,
          confirmed: Boolean(options.answersConfirmed && source.answerLetter),
        },
      };
      if (block.stage === "writing") {
        return {
          ...common,
          type: "essay" as const,
          scoringCriteria: "",
          explanation: source.explanation || undefined,
        };
      }
      if (block.stage === "translation") {
        return {
          ...common,
          type: "short-answer" as const,
          referenceAnswer: "",
          explanation: source.explanation || undefined,
        };
      }
      const answerIndex = source.answerLetter
        ? source.answerLetter.toUpperCase().charCodeAt(0) - 65
        : 0;
      return {
        ...common,
        type: "single-choice" as const,
        options:
          block.stage === "reading-b" && source.options.length === 0
            ? Array.from({ length: 13 }, (_, optionIndex) =>
                String.fromCharCode(65 + optionIndex),
              )
            : source.options,
        correctAnswer: Math.max(0, answerIndex),
        explanation: source.explanation || undefined,
      };
    });
    byStage.set(block.stage, [...(byStage.get(block.stage) ?? []), ...questions]);
  }

  const selectedStages = [...byStage.keys()];
  const paper = buildCet6Paper(
    Object.fromEntries(byStage),
    new Date(),
    {
      mode: "specialty",
      selectedStages,
      focusTopic: "",
    },
  );
  return {
    ...paper,
    title: draft.title.trim() || paper.title,
    practiceScope: {
      mode: "imported",
      selectedStages,
      focusTopic: "",
      sourceFileName: draft.sourceFileName,
      examDate: draft.examDate,
      setLabel: draft.setLabel,
      listeningAudioPath: draft.listeningAudioPath,
    },
  };
}

export function importedPaperIssues(paper: ExamPaper): string[] {
  const issues: string[] = [];
  const stages = new Set(
    paper.questions
      .map((question) => stageFromKind(question.examSection?.kind))
      .filter((stage): stage is Cet6ContentStage => stage != null),
  );
  for (const stage of stages) {
    const spec = CET6_STAGE_SPECS[stage];
    const questions = paper.questions.filter(
      (question) => question.examSection?.kind === spec.kind,
    );
    const count = spec.groups.reduce(
      (sum, group) => sum + Math.max(1, group.questionNumbers.length),
      0,
    );
    if (questions.length !== count) {
      issues.push(`${spec.labelEn}: expected ${count}, received ${questions.length}`);
    }
    for (const question of questions) {
      if (
        question.type === "single-choice" &&
        question.options.length < (stage === "reading-a" ? 15 : stage === "reading-b" ? 13 : 4)
      ) {
        issues.push(
          `${spec.labelEn} Q${question.examSection?.questionNumber ?? "?"}: incomplete options`,
        );
      }
    }
  }
  if (stages.size === 0) issues.push("No CET-6 sections were detected.");
  return issues;
}

export function importedDraftIssues(draft: ImportedPaperDraft): string[] {
  const byStage = new Map<Cet6ContentStage, ImportedBlock[]>();
  draft.blocks.forEach((block) => {
    byStage.set(block.stage, [...(byStage.get(block.stage) ?? []), block]);
  });
  const issues: string[] = [];
  if (byStage.size === 0) return ["No CET-6 sections were detected."];
  if (draft.mode === "full") {
    const missing = (Object.keys(CET6_STAGE_SPECS) as Cet6ContentStage[]).filter(
      (stage) => !byStage.has(stage),
    );
    if (missing.length > 0) {
      issues.push(`Complete paper is missing: ${missing.join(", ")}`);
    }
  }
  for (const [stage, blocks] of byStage) {
    const spec = CET6_STAGE_SPECS[stage];
    const expected = spec.groups.reduce(
      (sum, group) => sum + Math.max(1, group.questionNumbers.length),
      0,
    );
    const questions = blocks.flatMap((block) => block.questions);
    if (questions.length !== expected) {
      issues.push(`${spec.labelEn}: expected ${expected}, received ${questions.length}`);
    }
    for (const block of blocks) {
      const numbers = block.questions
        .map((question) => question.sourceQuestionNumber)
        .filter((number): number is number => number != null);
      if (new Set(numbers).size !== numbers.length) {
        issues.push(
          `${spec.labelEn} ${block.groupId}: duplicate source question numbers`,
        );
      }
    }
  }
  return issues;
}

export function answerTableForDraft(
  draft: ImportedPaperDraft,
): AnswerSearchResult {
  const rows: AnswerSearchRow[] = [];
  for (const block of draft.blocks) {
    if (!["listening-a", "listening-b", "listening-c", "reading-a", "reading-b", "reading-c"].includes(block.stage)) {
      continue;
    }
    for (const question of block.questions) {
      if (question.sourceQuestionNumber == null) continue;
      rows.push({
        stage: block.stage,
        groupId: block.groupId,
        sourceQuestionNumber: question.sourceQuestionNumber,
        answerLetter: question.answerLetter?.toUpperCase(),
        status: question.answerLetter ? "provided" : "missing",
        sources: [],
      });
    }
  }
  return AnswerSearchResultSchema.parse({ rows, query: "", notes: [] });
}

export function mergeAnswerRows(
  draft: ImportedPaperDraft,
  rawReply: string,
  query: string,
): AnswerSearchResult {
  const { json } = extractJson(rawReply);
  if (!json) return answerTableForDraft(draft);
  const parsed = AnswerCandidateResponseSchema.parse(JSON.parse(json));
  const base = answerTableForDraft(draft);
  const rowCountByQuestion = new Map<string, number>();
  base.rows.forEach((row) => {
    const key = `${row.stage}:${row.sourceQuestionNumber}`;
    rowCountByQuestion.set(key, (rowCountByQuestion.get(key) ?? 0) + 1);
  });
  const rows = base.rows.map((row) => {
    const duplicateNumber =
      (rowCountByQuestion.get(
        `${row.stage}:${row.sourceQuestionNumber}`,
      ) ?? 0) > 1;
    const candidates = parsed.answers.filter(
      (candidate) =>
        candidate.stage === row.stage &&
        candidate.sourceQuestionNumber === row.sourceQuestionNumber &&
        (candidate.groupId === row.groupId ||
          (!candidate.groupId && !duplicateNumber)),
    );
    if (candidates.length === 0) return row;
    const answers = new Set(
      candidates.map((candidate) => candidate.answerLetter.toUpperCase()),
    );
    const sources = dedupeSources(
      candidates.flatMap((candidate) => candidate.sources),
    );
    if (sources.length === 0) return row;
    const domains = new Set(
      sources.map((source) => {
        try {
          return new URL(source.url).hostname;
        } catch {
          return source.url;
        }
      }),
    );
    if (answers.size > 1) {
      return { ...row, status: "conflict" as const, sources };
    }
    const answerLetter = [...answers][0];
    const official = sources.some((source) =>
      /(?:cet\.edu\.cn|neea\.edu\.cn)$/i.test(safeHost(source.url)),
    );
    return {
      ...row,
      answerLetter,
      sources,
      status: official
        ? ("official" as const)
        : domains.size >= 2
          ? ("consensus" as const)
          : ("single-source" as const),
    };
  });
  return AnswerSearchResultSchema.parse({
    rows,
    query,
    notes: parsed.notes,
  });
}

export function applyAnswerRows(
  draft: ImportedPaperDraft,
  rows: readonly AnswerSearchRow[],
): ImportedPaperDraft {
  const answerByKey = new Map(
    rows
      .filter((row) => row.answerLetter)
      .map((row) => [
        `${row.stage}:${row.groupId}:${row.sourceQuestionNumber}`,
        row.answerLetter?.toUpperCase() ?? "",
      ]),
  );
  return ImportedPaperDraftSchema.parse({
    ...draft,
    blocks: draft.blocks.map((block) => ({
      ...block,
      questions: block.questions.map((question) => ({
        ...question,
        answerLetter:
          question.sourceQuestionNumber == null
            ? question.answerLetter
            : (answerByKey.get(
                `${block.stage}:${block.groupId}:${question.sourceQuestionNumber}`,
              ) ?? question.answerLetter),
        answerStatus:
          question.sourceQuestionNumber == null
            ? question.answerStatus
            : rows.find(
                (row) =>
                  row.stage === block.stage &&
                  row.groupId === block.groupId &&
                  row.sourceQuestionNumber ===
                    question.sourceQuestionNumber,
              )?.status,
        answerSources:
          question.sourceQuestionNumber == null
            ? question.answerSources
            : (rows.find(
                (row) =>
                  row.stage === block.stage &&
                  row.groupId === block.groupId &&
                  row.sourceQuestionNumber ===
                    question.sourceQuestionNumber,
              )?.sources ?? question.answerSources),
      })),
    })),
  });
}

function joinPassage(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b || a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}\n${b}`;
}

function passageNumber(groupId: string): "one" | "two" | "three" | undefined {
  if (/passage[-_ ]?1|first|one/i.test(groupId)) return "one";
  if (/passage[-_ ]?2|second|two/i.test(groupId)) return "two";
  if (/passage[-_ ]?3|third|three/i.test(groupId)) return "three";
  return undefined;
}

function stageFromKind(kind: string | undefined): Cet6ContentStage | null {
  const entry = (Object.entries(CET6_STAGE_SPECS) as Array<
    [Cet6ContentStage, (typeof CET6_STAGE_SPECS)[Cet6ContentStage]]
  >).find(([, spec]) => spec.kind === kind);
  return entry?.[0] ?? null;
}

function dedupeSources(
  sources: AnswerSearchRow["sources"],
): AnswerSearchRow["sources"] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
