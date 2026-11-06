import { create } from "zustand";
import {
  CET6_CHECKPOINT_VERSION,
  CET6_CONTENT_STAGES,
  CET6_PIPELINE_PHASES,
  type Cet6Blueprint,
  type Cet6ContentStage,
  type Cet6GenerationCheckpoint,
  type Cet6PipelinePhase,
  type Cet6QuestionsByStage,
} from "../lib/types/cet";
import type { Question } from "../lib/types/exam";
import {
  buildCet6Paper,
  parseCet6Blueprint,
  parseCet6ReadingBPassage,
  parseCet6ReadingCPassage,
  parseCet6ReadingCQuestions,
  parseCet6Stage,
  validateCet6StageQuestions,
  validateCet6Paper,
} from "../lib/cet/generate";
import { CET6_STAGE_SPECS } from "../lib/cet/structure";
import {
  arrangeReadingBQuestions,
  createReadingBAnswerPlan,
} from "../lib/cet/readingBPlan";
import { createReadingCPlan } from "../lib/cet/readingCPlan";
import {
  balanceChoiceAnswers,
  createBalancedAnswerIndexes,
  createReadingAAnswerIndexes,
} from "../lib/cet/answerOrder";
import {
  chooseWritingOpeningPlan,
  classifyWritingOpening,
  type WritingOpeningStyle,
} from "../lib/cet/writingPlan";
import {
  auditCet6Paper,
  auditCet6Stage,
  type Cet6QualityReport,
} from "../lib/cet/quality/audit";
import {
  buildCet6BlueprintPrompt,
  buildCet6ReadingBPassagePrompt,
  buildCet6ReadingCPassagePrompt,
  buildCet6ReadingCQuestionsPrompt,
  buildCet6RepairMessage,
  buildCet6StagePrompt,
} from "../lib/cet/pipelinePrompts";
import * as storage from "../lib/storage/tauri";
import { useAssistantStore } from "./assistantStore";
import { useConfigStore } from "./configStore";
import { usePaperStore } from "./paperStore";
import { useTtsAudioStore } from "./ttsAudioStore";
import { defaultListeningAudioPath } from "../lib/tts/audio";

const MAX_PARSE_ATTEMPTS = 3;
const MAX_HEAVY_STAGE_ATTEMPTS = 5;
const HEAVY_STAGE_MAX_TOKENS = 65_536;
const DEFAULT_STAGE_DURATION_MS: Record<Cet6PipelinePhase, number> = {
  blueprint: 30_000,
  writing: 60_000,
  "listening-a": 120_000,
  "listening-b": 90_000,
  "listening-c": 150_000,
  "reading-a": 60_000,
  "reading-b": 180_000,
  "reading-c": 300_000,
  translation: 60_000,
};

interface Cet6GenerationState {
  status: "idle" | "running" | "completed" | "error";
  currentPhase: Cet6PipelinePhase | null;
  completedPhases: Cet6PipelinePhase[];
  errorCode: string | null;
  errorDetail: string | null;
  errorPhase: Cet6PipelinePhase | null;
  qualityReport: Cet6QualityReport | null;
  generationStartedAt: string | null;
  estimatedTotalMs: number;
  start: () => Promise<void>;
  load: (paperId: string) => Promise<void>;
  openDiagnostics: () => Promise<void>;
  resetCheckpoint: () => Promise<void>;
  reset: () => void;
}

export const useCet6GenerationStore = create<Cet6GenerationState>((set, get) => ({
  status: "idle",
  currentPhase: null,
  completedPhases: [],
  errorCode: null,
  errorDetail: null,
  errorPhase: null,
  qualityReport: null,
  generationStartedAt: null,
  estimatedTotalMs: 0,

  load: async (paperId) => {
    const dataDir = useConfigStore.getState().dataDir;
    if (!dataDir) return;
    try {
      const checkpoint = await storage.loadCet6Checkpoint(dataDir, paperId);
      set({
        completedPhases: checkpoint ? completedPhases(checkpoint) : [],
        status: "idle",
        currentPhase: null,
        errorCode: null,
        errorDetail: null,
        errorPhase: null,
        qualityReport: null,
        generationStartedAt: checkpoint?.generationStartedAt ?? null,
        estimatedTotalMs: checkpoint
          ? estimateCheckpointDurationMs(checkpoint)
          : 0,
      });
    } catch {
      set({
        completedPhases: [],
        status: "error",
        currentPhase: null,
        errorCode: "io",
        errorDetail: "The saved generation checkpoint could not be read.",
        errorPhase: null,
        qualityReport: null,
        generationStartedAt: null,
        estimatedTotalMs: 0,
      });
    }
  },

  openDiagnostics: async () => {
    const dataDir = useConfigStore.getState().dataDir;
    const paperId = usePaperStore.getState().activePaperId;
    if (!dataDir || !paperId) return;
    await storage.openCet6DiagnosticDir(dataDir, paperId);
  },

  start: async () => {
    if (get().status === "running") return;

    const configState = useConfigStore.getState();
    const provider = configState.activeConfig();
    const dataDir = configState.dataDir;
    const paperId = usePaperStore.getState().activePaperId;
    if (!provider || !dataDir || !paperId) {
      set({
        status: "error",
        currentPhase: null,
        errorCode: "unknown",
        errorDetail: "A model, data directory, and active paper are required.",
        errorPhase: null,
      });
      return;
    }

    let apiKey: string | null = null;
    try {
      apiKey = await storage.getApiKey(provider.id);
    } catch {
      apiKey = null;
    }
    if (!apiKey) {
      set({
        status: "error",
        currentPhase: null,
        errorCode: "auth",
        errorDetail: null,
        errorPhase: null,
      });
      useAssistantStore.getState().reportGenerationError("auth");
      return;
    }

    set({
      status: "running",
      currentPhase: "blueprint",
      completedPhases: [],
      errorCode: null,
      errorDetail: null,
      errorPhase: null,
      qualityReport: null,
      generationStartedAt: null,
      estimatedTotalMs: 0,
    });
    void storage.setGenerationRunning(true).catch(() => undefined);

    try {
      const loaded = await storage.loadCet6Checkpoint(dataDir, paperId);
      let checkpoint: Cet6GenerationCheckpoint =
        loaded ??
        ({
          version: CET6_CHECKPOINT_VERSION,
          paperId,
          providerName: provider.name,
          model: provider.model,
          questionsByStage: {},
          generationStartedAt: new Date().toISOString(),
          stageDurationsMs: {},
          updatedAt: new Date().toISOString(),
        } satisfies Cet6GenerationCheckpoint);
      checkpoint = {
        ...checkpoint,
        providerName: provider.name,
        model: provider.model,
        generationStartedAt:
          checkpoint.generationStartedAt ?? new Date().toISOString(),
      };
      set({
        completedPhases: completedPhases(checkpoint),
        generationStartedAt: checkpoint.generationStartedAt ?? null,
        estimatedTotalMs: estimateCheckpointDurationMs(checkpoint),
      });

      const balancedCheckpoint = balanceExistingListeningStages(
        checkpoint,
        paperId,
      );
      if (balancedCheckpoint !== checkpoint) {
        checkpoint = await saveCheckpoint(dataDir, balancedCheckpoint);
      }

      if (!checkpoint.blueprint) {
        const blueprintStartedAt = Date.now();
        checkpoint.blueprint = await generateBlueprint(
          provider,
          apiKey,
          dataDir,
          paperId,
        );
        checkpoint = {
          ...checkpoint,
          stageDurationsMs: {
            ...checkpoint.stageDurationsMs,
            blueprint: Date.now() - blueprintStartedAt,
          },
        };
        checkpoint = await saveCheckpoint(dataDir, checkpoint);
      }
      const blueprint = checkpoint.blueprint;
      if (!blueprint) throw new Error("Blueprint generation produced no data.");

      set({
        completedPhases: completedPhases(checkpoint),
        currentPhase: "writing",
      });

      for (const stage of CET6_CONTENT_STAGES) {
        if (checkpoint.questionsByStage[stage]?.length) continue;
        set({ currentPhase: stage });
        const stageStartedAt = Date.now();
        let questions =
          stage === "reading-b"
            ? await generateReadingBStage(
                blueprint,
                provider,
                apiKey,
                dataDir,
                paperId,
                checkpoint.readingBPassage,
                async (validatedPassage) => {
                  checkpoint = await saveCheckpoint(dataDir, {
                    ...checkpoint,
                    readingBPassage: validatedPassage,
                  });
                  set({
                    estimatedTotalMs:
                      estimateCheckpointDurationMs(checkpoint),
                  });
                },
              )
            : stage === "reading-c"
              ? await generateReadingCStage(
                  blueprint,
                  provider,
                  apiKey,
                  dataDir,
                  paperId,
                )
              : stage === "writing"
                ? await generateStage(stage, blueprint, provider, apiKey, dataDir, paperId, {
                    writingOpeningStyle:
                      await chooseWritingOpeningStyleForPaper(
                        dataDir,
                        paperId,
                        `${paperId}\n${blueprint.title}\nwriting`,
                      ),
                  })
                : isListeningStage(stage)
                  ? await generateStage(
                      stage,
                      blueprint,
                      provider,
                      apiKey,
                      dataDir,
                      paperId,
                      {
                        listeningAnswerIndexes:
                          createBalancedAnswerIndexes(
                            listeningAnswerCounts(stage),
                            `${paperId}\n${stage}\nlistening-answers`,
                            listeningPrecedingAnswers(checkpoint, stage),
                          ),
                      },
                    )
                : stage === "reading-a"
                  ? await generateStage(
                      stage,
                      blueprint,
                      provider,
                      apiKey,
                      dataDir,
                      paperId,
                      {
                        readingAAnswerIndexes:
                          createReadingAAnswerIndexes(
                            `${paperId}\n${blueprint.title}\nreading-a`,
                          ),
                      },
                    )
              : await generateStage(
                  stage,
                  blueprint,
                  provider,
                  apiKey,
                  dataDir,
                  paperId,
                );
        if (
          stage === "listening-a" ||
          stage === "listening-b" ||
          stage === "listening-c"
        ) {
          questions = balanceChoiceAnswers(
            questions,
            createBalancedAnswerIndexes(
              listeningAnswerCounts(stage),
              `${paperId}\n${stage}\nlistening-answers`,
              listeningPrecedingAnswers(checkpoint, stage),
            ),
          );
        }
        checkpoint = {
          ...checkpoint,
          stageDurationsMs: {
            ...checkpoint.stageDurationsMs,
            [stage]: Date.now() - stageStartedAt,
          },
          questionsByStage: {
            ...checkpoint.questionsByStage,
            [stage]: questions,
          } satisfies Cet6QuestionsByStage,
        };
        checkpoint = await saveCheckpoint(dataDir, checkpoint);
        set({
          completedPhases: completedPhases(checkpoint),
          estimatedTotalMs: estimateCheckpointDurationMs(checkpoint),
        });
        if (stage === "listening-c") {
          const listeningPaper = buildCet6Paper(checkpoint.questionsByStage);
          void useTtsAudioStore.getState().start(
            listeningPaper,
            defaultListeningAudioPath(
              dataDir,
              listeningPaper.title,
              paperId,
            ),
            { automatic: true },
          );
        }
      }

      const paper = buildCet6Paper(checkpoint.questionsByStage);
      const errors = validateCet6Paper(paper);
      if (errors.length > 0) {
        throw new GenerationValidationError(errors.join("\n"));
      }
      const qualityReport = auditCet6Paper(paper);
      if (!qualityReport.passed) {
        const stagesToRegenerate = qualityRegenerationStages(qualityReport);
        if (stagesToRegenerate.length > 0) {
          const questionsByStage = { ...checkpoint.questionsByStage };
          for (const stage of stagesToRegenerate) {
            delete questionsByStage[stage];
          }
          checkpoint = await saveCheckpoint(dataDir, {
            ...checkpoint,
            questionsByStage,
          });
          set({
            qualityReport,
            currentPhase: stagesToRegenerate[0] ?? null,
          });
        }
        throw new GenerationValidationError(
          qualityReport.errors
            .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
            .join("\n"),
        );
      }

      useAssistantStore.getState().previewGeneratedPaper(paper);
      set({
        status: "completed",
        currentPhase: null,
        completedPhases: [...CET6_PIPELINE_PHASES],
        qualityReport,
        estimatedTotalMs: Math.max(
          estimateCheckpointDurationMs(checkpoint),
          checkpoint.generationStartedAt
            ? Date.now() - Date.parse(checkpoint.generationStartedAt)
            : 0,
        ),
      });
      void storage.setGenerationRunning(false).catch(() => undefined);
    } catch (error) {
      const appError = toGenerationError(error);
      const errorPhase = get().currentPhase;
      const detail = [
        withPhaseContext(errorPhase, appError.detail),
        `诊断目录：${diagnosticDirectory(dataDir, paperId)}`,
      ]
        .filter(Boolean)
        .join("\n");
      set({
        status: "error",
        currentPhase: null,
        errorCode: appError.code,
        errorDetail: detail,
        errorPhase,
      });
      useAssistantStore
        .getState()
        .reportGenerationError(appError.code, detail ?? undefined);
      void storage.setGenerationRunning(false).catch(() => undefined);
    }
  },

  reset: () => {
    void storage.setGenerationRunning(false).catch(() => undefined);
    set({
      status: "idle",
      currentPhase: null,
      completedPhases: [],
      errorCode: null,
      errorDetail: null,
      errorPhase: null,
      qualityReport: null,
      generationStartedAt: null,
      estimatedTotalMs: 0,
    });
  },

  resetCheckpoint: async () => {
    const dataDir = useConfigStore.getState().dataDir;
    const paperId = usePaperStore.getState().activePaperId;
    if (dataDir && paperId) {
      await storage.deleteCet6Checkpoint(dataDir, paperId);
    }
    get().reset();
  },
}));

async function saveCheckpoint(
  dataDir: string,
  checkpoint: Cet6GenerationCheckpoint,
): Promise<Cet6GenerationCheckpoint> {
  const next = { ...checkpoint, updatedAt: new Date().toISOString() };
  await storage.saveCet6Checkpoint(dataDir, next.paperId, next);
  return next;
}

function estimateCheckpointDurationMs(
  checkpoint: Cet6GenerationCheckpoint,
): number {
  return CET6_PIPELINE_PHASES.reduce(
    (sum, phase) =>
      sum + (checkpoint.stageDurationsMs[phase] ?? DEFAULT_STAGE_DURATION_MS[phase]),
    0,
  );
}

interface GenerationDiagnosticInput {
  dataDir: string;
  paperId: string;
  stage: Cet6PipelinePhase;
  attempt: number;
  attemptLimit: number;
  status: "validation_failed" | "network_error";
  provider: { baseUrl: string; model: string };
  messages: readonly { role: string; content: string }[];
  startedAt: string;
  startedMs: number;
  error: string;
  rawReply?: string;
}

async function recordGenerationDiagnostic(
  input: GenerationDiagnosticInput,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const fileStem =
    `${finishedAt.replace(/[:.]/g, "-")}-${input.stage}-attempt-${input.attempt + 1}`;
  const record = {
    version: 1,
    paperId: input.paperId,
    stage: input.stage,
    attempt: input.attempt + 1,
    attemptLimit: input.attemptLimit,
    status: input.status,
    provider: input.provider,
    startedAt: input.startedAt,
    finishedAt,
    durationMs: Date.now() - input.startedMs,
    error: input.error,
    rawReply: input.rawReply ?? null,
    messages: input.messages,
  };
  try {
    await storage.saveCet6Diagnostic(
      input.dataDir,
      input.paperId,
      fileStem,
      JSON.stringify(record, null, 2),
    );
  } catch {
    // Diagnostics must never replace the original generation error.
  }
}

async function generateBlueprint(
  provider: {
    baseUrl: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  apiKey: string,
  dataDir: string,
  paperId: string,
): Promise<Cet6Blueprint> {
  let correction: string | undefined;
  let repairSource: string | undefined;
  let lastError = "Unknown blueprint validation error.";

  for (let attempt = 0; attempt < MAX_PARSE_ATTEMPTS; attempt += 1) {
    const baseMessages = [
      ...buildCet6BlueprintPrompt(),
      ...(correction
        ? [
            {
              role: "user",
              content: `Correct the previous blueprint. Output only the JSON object.\n${correction}`,
            },
          ]
        : []),
    ];
    const messages = repairSource
      ? [
          ...baseMessages,
          buildCet6RepairMessage(repairSource, lastError),
        ]
      : baseMessages;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let reply: string;
    try {
      reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        messages,
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
      });
    } catch (error) {
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "blueprint",
        attempt,
        attemptLimit: MAX_PARSE_ATTEMPTS,
        status: "network_error",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const parsed = parseCet6Blueprint(reply);
    if (parsed.ok) return parsed.value;
    lastError = parsed.error;
    correction = parsed.error;
    repairSource = reply;
    await recordGenerationDiagnostic({
      dataDir,
      paperId,
      stage: "blueprint",
      attempt,
      attemptLimit: MAX_PARSE_ATTEMPTS,
      status: "validation_failed",
      provider: { baseUrl: provider.baseUrl, model: provider.model },
      messages,
      startedAt,
      startedMs,
      error: parsed.error,
      rawReply: reply,
    });
  }

  throw new GenerationValidationError(lastError);
}

async function generateStage(
  stage: Cet6ContentStage,
  blueprint: Cet6Blueprint,
  provider: {
    baseUrl: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  apiKey: string,
  dataDir: string,
  paperId: string,
  options: {
    readingBPassage?: string;
    readingBAnswerIndexes?: readonly number[];
    readingAAnswerIndexes?: readonly number[];
    listeningAnswerIndexes?: readonly number[];
    writingOpeningStyle?: WritingOpeningStyle;
  } = {},
) {
  let lastError = "Unknown stage validation error.";
  let repairSource: string | undefined;

  const attemptLimit = stage.startsWith("listening")
    ? MAX_HEAVY_STAGE_ATTEMPTS
    : MAX_PARSE_ATTEMPTS;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const baseMessages = buildCet6StagePrompt(
      stage,
      blueprint,
      attempt > 0 ? lastError : undefined,
      options,
    );
    const messages = repairSource
      ? [
          ...baseMessages,
          buildCet6RepairMessage(repairSource, lastError),
        ]
      : baseMessages;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let reply: string;
    try {
      reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        messages,
        temperature: provider.temperature,
        maxTokens: stageMaxTokens(stage, provider.maxTokens),
      });
    } catch (error) {
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage,
        attempt,
        attemptLimit,
        status: "network_error",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const parsed = parseCet6Stage(stage, reply, {
      forcedSharedPassage: options.readingBPassage,
      expectedWritingOpeningStyle: options.writingOpeningStyle,
      expectedAnswerIndexes:
        options.listeningAnswerIndexes ?? options.readingAAnswerIndexes,
    });
    if (parsed.ok) return parsed.value;
    lastError = parsed.error;
    repairSource = reply;
    await recordGenerationDiagnostic({
      dataDir,
      paperId,
      stage,
      attempt,
      attemptLimit,
      status: "validation_failed",
      provider: { baseUrl: provider.baseUrl, model: provider.model },
      messages,
      startedAt,
      startedMs,
      error: parsed.error,
      rawReply: reply,
    });
  }

  throw new GenerationValidationError(lastError);
}

async function generateReadingBStage(
  blueprint: Cet6Blueprint,
  provider: {
    baseUrl: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  apiKey: string,
  dataDir: string,
  paperId: string,
  existingPassage?: string,
  onPassageValidated?: (passage: string) => Promise<void>,
) {
  let correction: string | undefined;
  let passageRepairSource: string | undefined;
  let lastError = "Unknown Reading B passage validation error.";
  let passage: string | null = existingPassage?.trim() || null;
  for (let attempt = 0; attempt < MAX_PARSE_ATTEMPTS; attempt += 1) {
    if (passage) break;
    const baseMessages = buildCet6ReadingBPassagePrompt(blueprint, correction);
    const messages = passageRepairSource
      ? [
          ...baseMessages,
          buildCet6RepairMessage(passageRepairSource, lastError),
        ]
      : baseMessages;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let reply: string;
    try {
      reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        messages,
        temperature: provider.temperature,
        maxTokens: stageMaxTokens("reading-b", provider.maxTokens),
      });
    } catch (error) {
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-b",
        attempt,
        attemptLimit: MAX_PARSE_ATTEMPTS,
        status: "network_error",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const parsed = parseCet6ReadingBPassage(reply);
    if (parsed.ok) {
      passage = parsed.value;
      await onPassageValidated?.(passage);
      break;
    }
    lastError = parsed.error;
    correction = parsed.error;
    passageRepairSource = reply;
    await recordGenerationDiagnostic({
      dataDir,
      paperId,
      stage: "reading-b",
      attempt,
      attemptLimit: MAX_PARSE_ATTEMPTS,
      status: "validation_failed",
      provider: { baseUrl: provider.baseUrl, model: provider.model },
      messages,
      startedAt,
      startedMs,
      error: parsed.error,
      rawReply: reply,
    });
  }
  if (!passage) {
    throw new GenerationValidationError(lastError);
  }
  const answerPlan = createReadingBAnswerPlan(
    `${paperId}\n${blueprint.title}\n${blueprint.topics.readingB ?? blueprint.topics.reading}`,
  );
  let statementCorrection: string | undefined;
  let statementRepairSource: string | undefined;
  let statementError = "Unknown Reading B statement validation error.";
  for (let attempt = 0; attempt < MAX_HEAVY_STAGE_ATTEMPTS; attempt += 1) {
    const baseMessages = buildCet6StagePrompt(
      "reading-b",
      blueprint,
      statementCorrection,
      {
        readingBPassage: passage,
        readingBAnswerIndexes: answerPlan.sourceIndexes,
      },
    );
    const messages = statementRepairSource
      ? [
          ...baseMessages,
          buildCet6RepairMessage(statementRepairSource, statementError),
        ]
      : baseMessages;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let reply: string;
    try {
      reply = await storage.completeChat({
        baseUrl: provider.baseUrl,
        apiKey,
        model: provider.model,
        messages,
        temperature: provider.temperature,
        maxTokens: stageMaxTokens("reading-b", provider.maxTokens),
      });
    } catch (error) {
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-b",
        attempt,
        attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
        status: "network_error",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const parsed = parseCet6Stage("reading-b", reply, {
      forcedSharedPassage: passage,
      skipQualityAudit: true,
    });
    if (!parsed.ok) {
      statementError = parsed.error;
      statementCorrection = parsed.error;
      statementRepairSource = reply;
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-b",
        attempt,
        attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
        status: "validation_failed",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: parsed.error,
        rawReply: reply,
      });
      continue;
    }
    const reordered = arrangeReadingBQuestions(parsed.value, answerPlan.finalIndexes);
    if (!reordered.ok) {
      statementError = reordered.error;
      statementCorrection = reordered.error;
      statementRepairSource = reply;
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-b",
        attempt,
        attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
        status: "validation_failed",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: reordered.error,
        rawReply: reply,
      });
      continue;
    }
    const quality = auditCet6Stage("reading-b", reordered.value);
    if (quality.passed) return reordered.value;
    statementError = quality.errors
      .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
      .join("\n");
    statementCorrection = statementError;
    statementRepairSource = reply;
    await recordGenerationDiagnostic({
      dataDir,
      paperId,
      stage: "reading-b",
      attempt,
      attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
      status: "validation_failed",
      provider: { baseUrl: provider.baseUrl, model: provider.model },
      messages,
      startedAt,
      startedMs,
      error: statementError,
      rawReply: reply,
    });
  }
  throw new GenerationValidationError(statementError);
}

async function generateReadingCStage(
  blueprint: Cet6Blueprint,
  provider: {
    baseUrl: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  apiKey: string,
  dataDir: string,
  paperId: string,
): Promise<Question[]> {
  const plan = createReadingCPlan(
    blueprint,
    `${paperId}\n${blueprint.title}\nreading-c`,
  );
  const passages: string[] = [];
  for (const passagePlan of plan.passages) {
    let correction: string | undefined;
    let passageRepairSource: string | undefined;
    let passage: string | null = null;
    let lastError = "Unknown Reading C passage validation error.";
    for (let attempt = 0; attempt < MAX_HEAVY_STAGE_ATTEMPTS; attempt += 1) {
      const baseMessages = buildCet6ReadingCPassagePrompt(
        passagePlan,
        correction,
      );
      const messages = passageRepairSource
        ? [
            ...baseMessages,
            buildCet6RepairMessage(passageRepairSource, lastError),
          ]
        : baseMessages;
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      let reply: string;
      try {
        reply = await storage.completeChat({
          baseUrl: provider.baseUrl,
          apiKey,
          model: provider.model,
          messages,
          temperature: provider.temperature,
          maxTokens: stageMaxTokens("reading-c", provider.maxTokens),
        });
      } catch (error) {
        await recordGenerationDiagnostic({
          dataDir,
          paperId,
          stage: "reading-c",
          attempt,
          attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
          status: "network_error",
          provider: { baseUrl: provider.baseUrl, model: provider.model },
          messages,
          startedAt,
          startedMs,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const parsed = parseCet6ReadingCPassage(
        reply,
        passagePlan.paragraphCount,
      );
      if (parsed.ok) {
        passage = parsed.value;
        break;
      }
      lastError = parsed.error;
      correction = parsed.error;
      passageRepairSource = reply;
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-c",
        attempt,
        attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
        status: "validation_failed",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages,
        startedAt,
        startedMs,
        error: parsed.error,
        rawReply: reply,
      });
    }
    if (!passage) throw new GenerationValidationError(lastError);
    passages.push(passage);
  }

  let questionCorrection: string | undefined;
  let questionRepairSource: string | undefined;
  let lastError = "Unknown Reading C question validation error.";
  for (let attempt = 0; attempt < MAX_HEAVY_STAGE_ATTEMPTS; attempt += 1) {
    const questions: Question[] = [];
    const attemptMessages: { role: string; content: string }[] = [];
    const attemptReplies: string[] = [];
    const attemptStartedAt = new Date().toISOString();
    const attemptStartedMs = Date.now();
    let parseFailed = false;
    for (let index = 0; index < plan.passages.length; index += 1) {
      const passagePlan = plan.passages[index];
      const baseMessages = buildCet6ReadingCQuestionsPrompt(
        blueprint,
        passagePlan,
        passages[index],
        questionCorrection,
      );
      const messages = questionRepairSource
        ? [
            ...baseMessages,
            buildCet6RepairMessage(questionRepairSource, lastError),
          ]
        : baseMessages;
      attemptMessages.push(...messages);
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      let reply: string;
      try {
        reply = await storage.completeChat({
          baseUrl: provider.baseUrl,
          apiKey,
          model: provider.model,
          messages,
          temperature: provider.temperature,
          maxTokens: stageMaxTokens("reading-c", provider.maxTokens),
        });
      } catch (error) {
        await recordGenerationDiagnostic({
          dataDir,
          paperId,
          stage: "reading-c",
          attempt,
          attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
          status: "network_error",
          provider: { baseUrl: provider.baseUrl, model: provider.model },
          messages,
          startedAt,
          startedMs,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      attemptReplies.push(reply);
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
        lastError = parsed.error;
        questionCorrection = parsed.error;
        questionRepairSource = reply;
        parseFailed = true;
        await recordGenerationDiagnostic({
          dataDir,
          paperId,
          stage: "reading-c",
          attempt,
          attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
          status: "validation_failed",
          provider: { baseUrl: provider.baseUrl, model: provider.model },
          messages,
          startedAt: attemptStartedAt,
          startedMs: attemptStartedMs,
          error: parsed.error,
          rawReply: reply,
        });
        break;
      }
      questions.push(...parsed.value);
    }
    if (parseFailed) continue;

    const structural = validateCet6StageQuestions("reading-c", questions);
    if (structural.length > 0) {
      lastError = structural.join("\n");
      questionCorrection = lastError;
      questionRepairSource = attemptReplies.join(
        "\n\n--- next passage reply ---\n\n",
      );
      await recordGenerationDiagnostic({
        dataDir,
        paperId,
        stage: "reading-c",
        attempt,
        attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
        status: "validation_failed",
        provider: { baseUrl: provider.baseUrl, model: provider.model },
        messages: attemptMessages,
        startedAt: attemptStartedAt,
        startedMs: attemptStartedMs,
        error: lastError,
        rawReply: attemptReplies.join("\n\n--- next passage reply ---\n\n"),
      });
      continue;
    }
    const quality = auditCet6Stage("reading-c", questions);
    if (quality.passed) return questions;
    lastError = quality.errors
      .map((check) => `${check.label}: ${check.detail ?? "未通过"}`)
      .join("\n");
    questionCorrection = lastError;
    questionRepairSource = attemptReplies.join(
      "\n\n--- next passage reply ---\n\n",
    );
    await recordGenerationDiagnostic({
      dataDir,
      paperId,
      stage: "reading-c",
      attempt,
      attemptLimit: MAX_HEAVY_STAGE_ATTEMPTS,
      status: "validation_failed",
      provider: { baseUrl: provider.baseUrl, model: provider.model },
      messages: attemptMessages,
      startedAt: attemptStartedAt,
      startedMs: attemptStartedMs,
      error: lastError,
      rawReply: attemptReplies.join("\n\n--- next passage reply ---\n\n"),
    });
  }
  throw new GenerationValidationError(lastError);
}

function balanceExistingListeningStages(
  checkpoint: Cet6GenerationCheckpoint,
  paperId: string,
): Cet6GenerationCheckpoint {
  let changed = false;
  const questionsByStage = { ...checkpoint.questionsByStage };
  let precedingAnswers: number[] = [];
  for (const stage of [
    "listening-a",
    "listening-b",
    "listening-c",
  ] as const) {
    const current = questionsByStage[stage];
    if (!current?.length) continue;
    const balanced = balanceChoiceAnswers(
      current,
      createBalancedAnswerIndexes(
        listeningAnswerCounts(stage),
        `${paperId}\n${stage}\nlistening-answers`,
        precedingAnswers,
      ),
    );
    if (JSON.stringify(balanced) !== JSON.stringify(current)) {
      questionsByStage[stage] = balanced;
      changed = true;
    }
    precedingAnswers = choiceAnswerIndexes(balanced);
  }
  return changed ? { ...checkpoint, questionsByStage } : checkpoint;
}

function listeningAnswerCounts(
  stage: "listening-a" | "listening-b" | "listening-c",
): [number, number, number, number] {
  if (stage === "listening-a") return [2, 2, 2, 2];
  if (stage === "listening-b") return [2, 2, 2, 1];
  return [2, 2, 2, 4];
}

function isListeningStage(
  stage: Cet6ContentStage,
): stage is "listening-a" | "listening-b" | "listening-c" {
  return (
    stage === "listening-a" ||
    stage === "listening-b" ||
    stage === "listening-c"
  );
}

function listeningPrecedingAnswers(
  checkpoint: Cet6GenerationCheckpoint,
  stage: "listening-a" | "listening-b" | "listening-c",
): number[] {
  const order = [
    "listening-a",
    "listening-b",
    "listening-c",
  ] as const;
  return order
    .slice(0, order.indexOf(stage))
    .flatMap((prior) =>
      choiceAnswerIndexes(checkpoint.questionsByStage[prior] ?? []),
    );
}

function choiceAnswerIndexes(questions: readonly Question[]): number[] {
  return questions.flatMap((question) =>
    question.type === "single-choice" ? [question.correctAnswer] : [],
  );
}

async function chooseWritingOpeningStyleForPaper(
  dataDir: string,
  paperId: string,
  seedText: string,
): Promise<WritingOpeningStyle> {
  const previousStyles: WritingOpeningStyle[] = [];
  try {
    const index = await storage.loadPaperIndex(dataDir);
    const candidates = [...(index?.papers ?? [])]
      .filter((paper) => paper.id !== paperId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    for (const candidate of candidates) {
      const paper = await storage.loadPaper(dataDir, candidate.id);
      const writing = paper?.questions.find(
        (question) =>
          question.type === "essay" &&
          question.examSection?.kind === "cet-writing",
      );
      const given =
        writing?.content.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim() ?? "";
      const style = classifyWritingOpening(given);
      if (style) previousStyles.push(style);
      if (previousStyles.length >= 4) break;
    }
  } catch {
    // A missing or unreadable library must not block paper generation.
  }
  return chooseWritingOpeningPlan(seedText, previousStyles).style;
}

function completedPhases(
  checkpoint: Cet6GenerationCheckpoint,
): Cet6PipelinePhase[] {
  const phases: Cet6PipelinePhase[] = [];
  if (checkpoint.blueprint) phases.push("blueprint");
  for (const stage of CET6_CONTENT_STAGES) {
    if (checkpoint.questionsByStage[stage]?.length) phases.push(stage);
  }
  return phases;
}

function withPhaseContext(
  phase: Cet6PipelinePhase | null,
  detail?: string,
): string | null {
  if (!phase) return detail ?? null;
  const label =
    phase === "blueprint"
      ? "选题蓝图"
      : CET6_STAGE_SPECS[phase].labelZh;
  return [`失败阶段：${label}`, detail].filter(Boolean).join("\n");
}

function diagnosticDirectory(dataDir: string, paperId: string): string {
  const separator = dataDir.includes("\\") ? "\\" : "/";
  return [
    dataDir.replace(/[\\/]+$/, ""),
    "generation",
    "cet6",
    "diagnostics",
    paperId,
  ].join(separator);
}

function stageMaxTokens(
  stage: Cet6ContentStage,
  configured: number | undefined,
): number | undefined {
  if (stage === "reading-b" || stage === "reading-c") {
    return Math.max(configured ?? 0, HEAVY_STAGE_MAX_TOKENS);
  }
  return configured;
}

class GenerationValidationError extends Error {}

function toGenerationError(error: unknown): {
  code: string;
  detail?: string;
} {
  if (error instanceof GenerationValidationError) {
    return { code: "jsonRetryExhausted", detail: error.message };
  }
  if (error && typeof error === "object" && "code" in error) {
    const coded = error as { code: unknown; detail?: unknown };
    return {
      code: typeof coded.code === "string" ? coded.code : "unknown",
      detail: typeof coded.detail === "string" ? coded.detail : undefined,
    };
  }
  return {
    code: "unknown",
    detail: error instanceof Error ? error.message : String(error),
  };
}

function qualityRegenerationStages(
  report: Cet6QualityReport,
): Cet6ContentStage[] {
  const stages = new Set<Cet6ContentStage>();
  for (const error of report.errors) {
    const prefix = error.id.split(":")[0];
    if (CET6_CONTENT_STAGES.includes(prefix as Cet6ContentStage)) {
      stages.add(prefix as Cet6ContentStage);
    }
    if (error.id === "paper:listening-distribution") {
      stages.add("listening-a");
      stages.add("listening-b");
      stages.add("listening-c");
    }
    if (
      error.id === "paper:listening-difficulty" ||
      error.id === "paper:listening-option-shape" ||
      error.id === "paper:listening-distractor-overlap" ||
      error.id === "paper:listening-stem-pattern" ||
      error.id === "paper:listening-topic-overlap"
    ) {
      stages.add("listening-a");
      stages.add("listening-b");
      stages.add("listening-c");
    }
    if (error.id === "paper:reading-c-answer-distribution") {
      stages.add("reading-c");
    }
    if (
      error.id === "paper:explanations-chinese" ||
      error.id === "paper:answers-declared"
    ) {
      for (const stage of CET6_CONTENT_STAGES) {
        if (CET6_STAGE_SPECS[stage].questionType === "single-choice") {
          stages.add(stage);
        }
      }
    }
  }
  return [...stages];
}
