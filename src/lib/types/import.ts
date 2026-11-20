import { z } from "zod";
import { Cet6ContentStageSchema } from "./cet";

export const ImportModeSchema = z.enum(["full", "section"]);

export const ImportedQuestionSchema = z.object({
  sourceQuestionNumber: z.preprocess(
    (value) => {
      if (value == null || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().int().positive().optional(),
  ),
  content: z.string().default(""),
  options: z.array(z.string()).default([]),
  answerLetter: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim()
        ? value.trim().toUpperCase()
        : undefined,
    z.string().regex(/^[A-O]$/).optional(),
  ),
  answerStatus: z
    .enum([
      "provided",
      "bank",
      "official",
      "consensus",
      "single-source",
      "conflict",
      "missing",
      "manual",
    ])
    .optional(),
  answerSources: z
    .array(
      z.object({
        title: z.string().default(""),
        url: z
          .string()
          .url()
          .refine(
            (value) => /^https?:\/\//i.test(value),
            "source URL must be HTTP(S)",
          ),
        evidence: z.string().default(""),
      }),
    )
    .default([]),
  explanation: z.string().default(""),
});

export const ImportedBlockSchema = z.object({
  groupId: z.string().min(1),
  stage: Cet6ContentStageSchema,
  heading: z.string().default(""),
  passage: z.string().default(""),
  optionBank: z.array(z.string()).default([]),
  examDate: z.string().default(""),
  setLabel: z.string().default(""),
  questions: z.array(ImportedQuestionSchema).default([]),
});

export const ImportedPaperDraftSchema = z.object({
  version: z.number().int().default(1),
  mode: ImportModeSchema.default("full"),
  selectedStages: z.array(Cet6ContentStageSchema).default([]),
  title: z.string().default(""),
  examDate: z.string().default(""),
  setLabel: z.string().default(""),
  sourceFileName: z.string().default(""),
  sourceHash: z.string().default(""),
  listeningAudioPath: z.string().default(""),
  blocks: z.array(ImportedBlockSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type ImportedPaperDraft = z.infer<typeof ImportedPaperDraftSchema>;
export type ImportedBlock = z.infer<typeof ImportedBlockSchema>;
export type ImportedQuestion = z.infer<typeof ImportedQuestionSchema>;

export const ImportedPageDraftSchema = z.object({
  title: z.string().default(""),
  examDate: z.string().default(""),
  setLabel: z.string().default(""),
  blocks: z.array(ImportedBlockSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type ImportedPageDraft = z.infer<typeof ImportedPageDraftSchema>;

export const OcrPageResultSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string().default(""),
  blocks: z
    .array(
      z.object({
        text: z.string(),
        confidence: z.number().min(0).max(1),
        box: z.array(z.tuple([z.number(), z.number()])).default([]),
      }),
    )
    .default([]),
  averageConfidence: z.number().min(0).max(1).default(0),
  durationMs: z.number().nonnegative().default(0),
  cached: z.boolean().default(false),
  sourceHash: z.string().default(""),
});

export const OcrResponseSchema = z.object({
  pages: z.array(OcrPageResultSchema),
});

export type OcrPageResult = z.infer<typeof OcrPageResultSchema>;

export const ImportSetRangeSchema = z.object({
  setLabel: z.string().min(1),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
});

export type ImportSetRange = z.infer<typeof ImportSetRangeSchema>;

export const ProvidedAnswerSchema = z.object({
  setLabel: z.string().min(1),
  stage: Cet6ContentStageSchema,
  sourceQuestionNumber: z.number().int().positive(),
  answerLetter: z
    .string()
    .regex(/^[A-O]$/i)
    .transform((value) => value.toUpperCase()),
});

export type ProvidedAnswer = z.infer<typeof ProvidedAnswerSchema>;

export const AnswerSourceSchema = z.object({
  title: z.string().default(""),
  url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "source URL must be HTTP(S)"),
  evidence: z.string().min(1),
});

export const AnswerSearchRowSchema = z.object({
  stage: Cet6ContentStageSchema,
  groupId: z.string().default(""),
  sourceQuestionNumber: z.number().int().positive(),
  answerLetter: z.string().regex(/^[A-O]$/i).optional(),
  status: z.enum([
    "provided",
      "bank",
    "official",
    "consensus",
    "single-source",
    "conflict",
    "missing",
    "manual",
  ]),
  sources: z.array(AnswerSourceSchema).default([]),
});

export const AnswerSearchResultSchema = z.object({
  rows: z.array(AnswerSearchRowSchema).default([]),
  query: z.string().default(""),
  notes: z.array(z.string()).default([]),
});

export type AnswerSearchRow = z.infer<typeof AnswerSearchRowSchema>;
export type AnswerSearchResult = z.infer<typeof AnswerSearchResultSchema>;

export const ImportedSetDraftSchema = z.object({
  id: z.string().min(1),
  setLabel: z.string().min(1),
  examDate: z.string().default(""),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  enabled: z.boolean().default(true),
  status: z
    .enum(["pending", "extracting", "ready", "error"])
    .default("pending"),
  error: z.string().default(""),
  listeningAudioPath: z.string().default(""),
  providedAnswers: z.array(ProvidedAnswerSchema).default([]),
  draft: ImportedPaperDraftSchema.optional(),
  answers: AnswerSearchResultSchema.optional(),
});

export const ImportSessionSchema = z.object({
  version: z.number().int().default(1),
  sourceHash: z.string().default(""),
  sourceFileName: z.string().default(""),
  listeningAudioPath: z.string().default(""),
  listeningAudioPaths: z.array(z.string()).default([]),
  mode: ImportModeSchema.default("full"),
  selectedStages: z.array(Cet6ContentStageSchema).default([]),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        text: z.string().default(""),
        confidence: z.number().min(0).max(1).default(1),
        cached: z.boolean().default(false),
      }),
    )
    .default([]),
  sets: z.array(ImportedSetDraftSchema).default([]),
});

export type ImportedSetDraft = z.infer<typeof ImportedSetDraftSchema>;
export type ImportSession = z.infer<typeof ImportSessionSchema>;

export const AnswerCandidateResponseSchema = z.object({
  answers: z.array(
    z.object({
      stage: Cet6ContentStageSchema,
      groupId: z.string().default(""),
      sourceQuestionNumber: z.number().int().positive(),
      answerLetter: z.string().regex(/^[A-O]$/i),
      sources: z.array(AnswerSourceSchema).default([]),
    }),
  ).default([]),
  notes: z.array(z.string()).default([]),
});
