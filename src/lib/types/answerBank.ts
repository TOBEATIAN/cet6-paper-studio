import { z } from "zod";
import { Cet6ContentStageSchema } from "./cet";
import { AnswerSourceSchema } from "./import";

export const AnswerBankSignatureSchema = z.object({
  first: z.string().default(""),
  last: z.string().default(""),
  wordCount: z.number().int().nonnegative().default(0),
});

export const AnswerBankEntrySchema = z.object({
  id: z.string().min(1),
  examDate: z.string().default(""),
  setLabel: z.string().default(""),
  stage: Cet6ContentStageSchema,
  groupId: z.string().default(""),
  sourceQuestionNumber: z.number().int().positive(),
  answerLetter: z.string().regex(/^[A-O]$/i),
  status: z.enum([
    "provided",
    "bank",
    "official",
    "consensus",
    "single-source",
    "manual",
  ]),
  sources: z.array(AnswerSourceSchema).default([]),
  signature: AnswerBankSignatureSchema.prefault({}),
  confirmedAt: z.string().min(1),
});

export const AnswerBankSchema = z.object({
  version: z.number().int().default(1),
  updatedAt: z.string().default(""),
  entries: z.array(AnswerBankEntrySchema).default([]),
});

export type AnswerBankEntry = z.infer<typeof AnswerBankEntrySchema>;
export type AnswerBank = z.infer<typeof AnswerBankSchema>;
