import { z } from "zod";
import { QuestionSchema } from "./exam";

export const CET6_CONTENT_STAGES = [
  "writing",
  "listening-a",
  "listening-b",
  "listening-c",
  "reading-a",
  "reading-b",
  "reading-c",
  "translation",
] as const;

export const CET6_PIPELINE_PHASES = [
  "blueprint",
  ...CET6_CONTENT_STAGES,
] as const;

export const Cet6ContentStageSchema = z.enum(CET6_CONTENT_STAGES);
export const Cet6PipelinePhaseSchema = z.enum(CET6_PIPELINE_PHASES);

export type Cet6ContentStage = z.infer<typeof Cet6ContentStageSchema>;
export type Cet6PipelinePhase = z.infer<typeof Cet6PipelinePhaseSchema>;

export const Cet6BlueprintSchema = z.object({
  title: z.string().min(1),
  topics: z.object({
    writing: z.string().min(1),
    listening: z.string().min(1),
    listeningCases: z
      .object({
        a1: z.string().min(1),
        a2: z.string().min(1),
        b1: z.string().min(1),
        b2: z.string().min(1),
        c1: z.string().min(1),
        c2: z.string().min(1),
        c3: z.string().min(1),
      })
      .optional(),
    reading: z.string().min(1),
    /** Focused theme for the 13-paragraph Reading B matching passage. */
    readingB: z.string().min(1).optional(),
    /** Two focused themes for Reading C Passage One and Passage Two. */
    readingC: z
      .object({
        first: z.string().min(1),
        second: z.string().min(1),
      })
      .optional(),
    translation: z.string().min(1),
  }),
});

export type Cet6Blueprint = z.infer<typeof Cet6BlueprintSchema>;

export const Cet6QuestionsByStageSchema = z.object({
  writing: z.array(QuestionSchema).optional(),
  "listening-a": z.array(QuestionSchema).optional(),
  "listening-b": z.array(QuestionSchema).optional(),
  "listening-c": z.array(QuestionSchema).optional(),
  "reading-a": z.array(QuestionSchema).optional(),
  "reading-b": z.array(QuestionSchema).optional(),
  "reading-c": z.array(QuestionSchema).optional(),
  translation: z.array(QuestionSchema).optional(),
});

export type Cet6QuestionsByStage = z.infer<
  typeof Cet6QuestionsByStageSchema
>;

export const CET6_CHECKPOINT_VERSION = 1;

export const Cet6GenerationCheckpointSchema = z.object({
  version: z.number().int().default(CET6_CHECKPOINT_VERSION),
  paperId: z.string().min(1),
  providerName: z.string().min(1),
  model: z.string().min(1),
  blueprint: Cet6BlueprintSchema.optional(),
  readingBPassage: z.string().min(1).optional(),
  questionsByStage: Cet6QuestionsByStageSchema.default({}),
  generationStartedAt: z.string().min(1).optional(),
  stageDurationsMs: z
    .partialRecord(Cet6PipelinePhaseSchema, z.number().nonnegative())
    .default({}),
  updatedAt: z.string().min(1),
});

export type Cet6GenerationCheckpoint = z.infer<
  typeof Cet6GenerationCheckpointSchema
>;
