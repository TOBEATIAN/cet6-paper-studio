import { z } from "zod";

export const ReviewAnswersSchema = z.record(z.string(), z.string());

export const ReviewRecordSchema = z.object({
  version: z.number().int().default(1),
  id: z.string().min(1),
  paperId: z.string().min(1),
  paperTitle: z.string(),
  createdAt: z.string(),
  answers: ReviewAnswersSchema,
  writingAnswer: z.string().default(""),
  translationAnswer: z.string().default(""),
  reviewNotes: z.string().default(""),
  readingArticleCard: z.string().default(""),
  improvedWriting: z.string().optional(),
  improvedTranslation: z.string().optional(),
  deepReview: z.string().optional(),
  writingScore: z.number().min(1).max(15).optional(),
  translationScore: z.number().min(1).max(15).optional(),
  totalScore: z.number().min(0).max(710).optional(),
  errorTypes: z.array(z.string()).default([]),
});

export const ReviewMetaSchema = z.object({
  id: z.string().min(1),
  paperId: z.string().min(1),
  paperTitle: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  objectiveScore: z.number().nonnegative(),
  writingScore: z.number().min(1).max(15).optional(),
  translationScore: z.number().min(1).max(15).optional(),
  totalScore: z.number().min(0).max(710).optional(),
  errorTypes: z.array(z.string()).default([]),
  hasDeepReview: z.boolean().default(false),
});

export const ReviewIndexSchema = z.object({
  version: z.number().int().default(1),
  reviews: z.array(ReviewMetaSchema).default([]),
});

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
export type ReviewMeta = z.infer<typeof ReviewMetaSchema>;
export type ReviewIndex = z.infer<typeof ReviewIndexSchema>;
