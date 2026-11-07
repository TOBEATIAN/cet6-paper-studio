import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { AppConfigSchema, type AppConfig } from "../types/config";
import { ExamPaperSchema, type ExamPaper } from "../types/exam";
import {
  Cet6GenerationCheckpointSchema,
  type Cet6GenerationCheckpoint,
} from "../types/cet";
import {
  ChatIndexSchema,
  ChatSessionSchema,
  PaperIndexSchema,
  WebSearchResultSchema,
  type ChatIndex,
  type ChatSession,
  type PaperIndex,
  type WebSearchResult,
} from "../types/library";
import {
  ReviewIndexSchema,
  ReviewRecordSchema,
  type ReviewIndex,
  type ReviewRecord,
} from "../types/review";
import type { ListeningSpeechPlan } from "../tts/plan";

/**
 * Typed wrappers around the Rust storage/keychain commands. The Rust side reads
 * and writes raw JSON strings; validation happens here with Zod so the rest of
 * the app works with trusted, typed data.
 */

// ---- Data directory / bootstrap ----

export function getDataDir(): Promise<string | null> {
  return invoke("get_data_dir");
}

export function setDataDir(dataDir: string): Promise<void> {
  return invoke("set_data_dir", { dataDir });
}

export interface RelocateDataDirResult {
  oldDirDeleted: boolean;
  oldDirDeleteFailed: boolean;
}

export function relocateDataDir(
  targetDir: string,
  deleteOldDir = false,
): Promise<RelocateDataDirResult> {
  return invoke("relocate_data_dir", { targetDir, deleteOldDir });
}

export function defaultDataDir(): Promise<string> {
  return invoke("default_data_dir");
}

export function openDataDir(dataDir: string): Promise<void> {
  return invoke("open_data_dir", { dataDir });
}

export function setWindowCloseBehavior(background: boolean): Promise<void> {
  return invoke("set_window_close_behavior", { background });
}

export function setGenerationRunning(running: boolean): Promise<void> {
  return invoke("set_generation_running", { running });
}

export function exitApp(): Promise<void> {
  return invoke("exit_app");
}

export async function readAudioFile(path: string): Promise<Uint8Array> {
  const raw = await invoke<unknown>("read_audio_file", { path });
  return new Uint8Array(z.array(z.number().int().min(0).max(255)).parse(raw));
}

export async function readImageFile(path: string): Promise<Uint8Array> {
  const raw = await invoke<unknown>("read_image_file", { path });
  return new Uint8Array(z.array(z.number().int().min(0).max(255)).parse(raw));
}

// ---- App config ----

export async function loadConfig(dataDir: string): Promise<AppConfig | null> {
  const raw = await invoke<string | null>("load_config", { dataDir });
  if (raw == null) return null;
  return AppConfigSchema.parse(JSON.parse(raw));
}

export function saveConfig(dataDir: string, config: AppConfig): Promise<void> {
  return invoke("save_config", { dataDir, contents: JSON.stringify(config, null, 2) });
}

// ---- Working paper ----

export async function loadWorkingPaper(
  dataDir: string,
): Promise<ExamPaper | null> {
  const raw = await invoke<string | null>("load_working_paper", { dataDir });
  if (raw == null) return null;
  return ExamPaperSchema.parse(JSON.parse(raw));
}

export function saveWorkingPaper(
  dataDir: string,
  paper: ExamPaper,
): Promise<void> {
  return invoke("save_working_paper", {
    dataDir,
    contents: JSON.stringify(paper, null, 2),
  });
}

// ---- Paper library ----

export async function loadPaperIndex(
  dataDir: string,
): Promise<PaperIndex | null> {
  const raw = await invoke<string | null>("load_paper_index", { dataDir });
  if (raw == null) return null;
  return PaperIndexSchema.parse(JSON.parse(raw));
}

export function savePaperIndex(
  dataDir: string,
  index: PaperIndex,
): Promise<void> {
  return invoke("save_paper_index", {
    dataDir,
    contents: JSON.stringify(index, null, 2),
  });
}

export async function loadPaper(
  dataDir: string,
  paperId: string,
): Promise<ExamPaper | null> {
  const raw = await invoke<string | null>("load_paper", { dataDir, paperId });
  if (raw == null) return null;
  return ExamPaperSchema.parse(JSON.parse(raw));
}

export function savePaper(
  dataDir: string,
  paperId: string,
  paper: ExamPaper,
): Promise<void> {
  return invoke("save_paper", {
    dataDir,
    paperId,
    contents: JSON.stringify(paper, null, 2),
  });
}

export function deletePaper(dataDir: string, paperId: string): Promise<void> {
  return invoke("delete_paper", { dataDir, paperId });
}

// ---- Paper-scoped chat history ----

export async function loadChatIndex(
  dataDir: string,
  paperId: string,
): Promise<ChatIndex | null> {
  const raw = await invoke<string | null>("load_chat_index", {
    dataDir,
    paperId,
  });
  if (raw == null) return null;
  return ChatIndexSchema.parse(JSON.parse(raw));
}

export function saveChatIndex(
  dataDir: string,
  paperId: string,
  index: ChatIndex,
): Promise<void> {
  return invoke("save_chat_index", {
    dataDir,
    paperId,
    contents: JSON.stringify(index, null, 2),
  });
}

export async function loadChatSession(
  dataDir: string,
  paperId: string,
  sessionId: string,
): Promise<ChatSession | null> {
  const raw = await invoke<string | null>("load_chat_session", {
    dataDir,
    paperId,
    sessionId,
  });
  if (raw == null) return null;
  return ChatSessionSchema.parse(JSON.parse(raw));
}

export function saveChatSession(
  dataDir: string,
  paperId: string,
  session: ChatSession,
): Promise<void> {
  return invoke("save_chat_session", {
    dataDir,
    paperId,
    sessionId: session.id,
    contents: JSON.stringify(session, null, 2),
  });
}

export function deleteChatSession(
  dataDir: string,
  paperId: string,
  sessionId: string,
): Promise<void> {
  return invoke("delete_chat_session", { dataDir, paperId, sessionId });
}

// ---- Paper-scoped review records ----

export async function loadReviewIndex(
  dataDir: string,
  paperId: string,
): Promise<ReviewIndex | null> {
  const raw = await invoke<string | null>("load_review_index", {
    dataDir,
    paperId,
  });
  if (raw == null) return null;
  return ReviewIndexSchema.parse(JSON.parse(raw));
}

export function saveReviewIndex(
  dataDir: string,
  paperId: string,
  index: ReviewIndex,
): Promise<void> {
  return invoke("save_review_index", {
    dataDir,
    paperId,
    contents: JSON.stringify(index, null, 2),
  });
}

export async function loadReview(
  dataDir: string,
  paperId: string,
  reviewId: string,
): Promise<ReviewRecord | null> {
  const raw = await invoke<string | null>("load_review", {
    dataDir,
    paperId,
    reviewId,
  });
  if (raw == null) return null;
  return ReviewRecordSchema.parse(JSON.parse(raw));
}

export function saveReview(
  dataDir: string,
  paperId: string,
  review: ReviewRecord,
): Promise<void> {
  return invoke("save_review", {
    dataDir,
    paperId,
    reviewId: review.id,
    contents: JSON.stringify(review, null, 2),
  });
}

export function deleteReview(
  dataDir: string,
  paperId: string,
  reviewId: string,
): Promise<void> {
  return invoke("delete_review", { dataDir, paperId, reviewId });
}

// ---- Resumable CET-6 generation ----

export async function loadPracticeSession(
  dataDir: string,
  paperId: string,
): Promise<unknown | null> {
  const raw = await invoke<string | null>("load_practice_session", {
    dataDir,
    paperId,
  });
  return raw == null ? null : JSON.parse(raw);
}

export function savePracticeSession(
  dataDir: string,
  paperId: string,
  session: unknown,
): Promise<void> {
  return invoke("save_practice_session", {
    dataDir,
    paperId,
    contents: JSON.stringify(session, null, 2),
  });
}

export async function loadCet6Checkpoint(
  dataDir: string,
  paperId: string,
): Promise<Cet6GenerationCheckpoint | null> {
  const raw = await invoke<string | null>("load_cet6_checkpoint", {
    dataDir,
    paperId,
  });
  if (raw == null) return null;
  return Cet6GenerationCheckpointSchema.parse(JSON.parse(raw));
}

export function saveCet6Checkpoint(
  dataDir: string,
  paperId: string,
  checkpoint: Cet6GenerationCheckpoint,
): Promise<void> {
  return invoke("save_cet6_checkpoint", {
    dataDir,
    paperId,
    contents: JSON.stringify(checkpoint, null, 2),
  });
}

export function deleteCet6Checkpoint(
  dataDir: string,
  paperId: string,
): Promise<void> {
  return invoke("delete_cet6_checkpoint", { dataDir, paperId });
}

export function saveCet6Diagnostic(
  dataDir: string,
  paperId: string,
  fileStem: string,
  contents: string,
): Promise<void> {
  return invoke("save_cet6_diagnostic", {
    dataDir,
    paperId,
    fileStem,
    contents,
  });
}

export function openCet6DiagnosticDir(
  dataDir: string,
  paperId: string,
): Promise<void> {
  return invoke("open_cet6_diagnostic_dir", { dataDir, paperId });
}

// ---- Keychain ----

export function storeApiKey(account: string, secret: string): Promise<void> {
  return invoke("store_api_key", { account, secret });
}

export function getApiKey(account: string): Promise<string | null> {
  return invoke("get_api_key", { account });
}

export function deleteApiKey(account: string): Promise<void> {
  return invoke("delete_api_key", { account });
}

export function hasApiKey(account: string): Promise<boolean> {
  return invoke("has_api_key", { account });
}

// ---- Web search ----

export async function webSearch(args: {
  provider: "deepseek" | "tavily" | "exa" | "firecrawl";
  apiKey: string;
  query: string;
  resultCount: number;
  contentMode: "summary" | "deep";
}): Promise<WebSearchResult[]> {
  const raw = await invoke<unknown[]>("web_search", args);
  return WebSearchResultSchema.array().parse(raw);
}

export function testWebSearch(args: {
  provider: "deepseek" | "tavily" | "exa" | "firecrawl";
  apiKey: string;
  contentMode: "summary" | "deep";
}): Promise<void> {
  return invoke("test_web_search", args);
}

// ---- OpenAI-compatible chat completion ----

export async function completeChat(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const raw = await invoke<unknown>("complete_chat", args);
  return z.string().min(1).parse(raw);
}

export async function extractImagesWithAi(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  imagePaths: string[];
  instruction: string;
}): Promise<string> {
  const raw = await invoke<unknown>("extract_images_with_ai", args);
  return z.string().min(1).parse(raw);
}

export async function testTtsConnection(args: {
  provider: "aliyun" | "mimo" | "siliconflow" | "kitten" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
}): Promise<number> {
  const raw = await invoke<unknown>("test_tts_connection", args);
  return z
    .object({ bytes: z.number().int().nonnegative() })
    .parse(raw).bytes;
}

export async function synthesizeTtsSegment(args: {
  provider: "aliyun" | "mimo" | "siliconflow" | "kitten" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  voice: string;
  speed: number;
  outputPath: string;
}): Promise<number> {
  return invoke("synthesize_tts_segment", args);
}

export interface SpeechSynthesisConfig {
  provider: "aliyun" | "mimo" | "siliconflow" | "kitten" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  femaleVoice: string;
  maleVoice: string;
}

export interface ListeningAudioResult {
  outputPath: string;
  cacheDir: string;
  durationMs: number;
  bytes: number;
  speechSegments: number;
  questionPauseCount: number;
  groupAnnouncementCount: number;
  targetWpm: number;
  effectiveWpm: number;
  tempo: number;
}

export interface TtsProgressEvent {
  phase: "synthesizing" | "assembling" | "complete";
  completed: number;
  total: number;
  currentId?: string | null;
}

const ListeningAudioResultSchema = z.object({
  outputPath: z.string().min(1),
  cacheDir: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  bytes: z.number().int().positive(),
  speechSegments: z.number().int().positive(),
  questionPauseCount: z.number().int().nonnegative(),
  groupAnnouncementCount: z.number().int().nonnegative(),
  targetWpm: z.number().int().min(140).max(200),
  effectiveWpm: z.number().positive(),
  tempo: z.number().positive(),
});

export async function generateListeningAudio(args: {
  plan: ListeningSpeechPlan;
  config: SpeechSynthesisConfig;
  outputPath: string;
  cacheDir: string;
}): Promise<ListeningAudioResult> {
  const raw = await invoke<unknown>("generate_listening_audio", args);
  return ListeningAudioResultSchema.parse(raw);
}
