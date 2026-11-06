import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ExamPaper } from "../lib/types/exam";
import {
  assertCompleteListeningPlan,
  configForTtsSettings,
  listeningAudioErrorMessage,
  listeningCacheDir,
  safeTtsErrorDetail,
} from "../lib/tts/audio";
import { buildListeningSpeechPlan } from "../lib/tts/plan";
import {
  generateListeningAudio,
  type ListeningAudioResult,
  type TtsProgressEvent,
} from "../lib/storage/tauri";
import { useConfigStore } from "./configStore";

export type TtsAudioJob =
  | {
      status: "preparing" | "running" | "assembling";
      completed: number;
      total: number;
    }
  | {
      status: "complete";
      result: ListeningAudioResult;
      fallbackFrom?: string;
    }
  | { status: "error"; message: string; detail?: string };

interface TtsAudioState {
  job: TtsAudioJob | null;
  start: (
    paper: ExamPaper,
    outputPath: string,
    options?: { automatic?: boolean; targetWpm?: number },
  ) => Promise<boolean>;
  reportError: (error: unknown) => void;
  clear: () => void;
}

export const useTtsAudioStore = create<TtsAudioState>((set, get) => ({
  job: null,

  start: async (paper, outputPath, options = {}) => {
    const current = get().job;
    if (
      current?.status === "preparing" ||
      current?.status === "running" ||
      current?.status === "assembling"
    ) {
      return false;
    }

    const config = useConfigStore.getState();
    const settings = {
      ...config.config.settings.tts,
      targetWpm:
        options.targetWpm ?? config.config.settings.tts.targetWpm,
    };
    const keyProvider =
      settings.activeProvider === "aliyun"
        ? "aliyun"
        : settings.activeProvider === "mimo"
          ? "mimo"
          : settings.activeProvider === "siliconflow"
            ? "siliconflow"
        : settings.activeProvider === "openai-compatible"
          ? "local"
          : null;
    let apiKey = "";
    try {
      apiKey = keyProvider
        ? ((await config.getTtsApiKey(keyProvider)) ?? "")
        : "";
    } catch {
      apiKey = "";
    }

    set({ job: { status: "preparing", completed: 0, total: 0 } });
    let unlisten: UnlistenFn | undefined;
    try {
      const plan = buildListeningSpeechPlan(paper, settings.targetWpm);
      assertCompleteListeningPlan(plan);
      set({
        job: {
          status: "running",
          completed: 0,
          total: plan.segments.length,
        },
      });
      unlisten = await listen<TtsProgressEvent>("tts-progress", (event) => {
        set({
          job: {
            status:
              event.payload.phase === "assembling"
                ? "assembling"
                : "running",
            completed: event.payload.completed,
            total: event.payload.total,
          },
        });
      });
      const runAttempt = (
        attemptSettings: typeof settings,
        attemptKey: string,
      ) =>
        generateListeningAudio({
          plan,
          config: configForTtsSettings(attemptSettings, attemptKey),
          outputPath,
          cacheDir: listeningCacheDir(outputPath),
        });
      const cloudProvider =
        settings.activeProvider === "aliyun" ||
        settings.activeProvider === "mimo" ||
        settings.activeProvider === "siliconflow";
      const fallbackSettings = {
        ...settings,
        activeProvider: "kitten" as const,
      };
      let fallbackFrom: string | undefined;
      let result: ListeningAudioResult;
      if (cloudProvider) {
        fallbackFrom = settings.activeProvider;
        if (apiKey.trim()) {
          try {
            result = await runAttempt(settings, apiKey);
          } catch (cloudError) {
            set({ job: { status: "preparing", completed: 0, total: 0 } });
            try {
              result = await runAttempt(fallbackSettings, "");
            } catch (kittenError) {
              throw new Error(
                `${listeningAudioErrorMessage(cloudError)}; ${listeningAudioErrorMessage(kittenError)}`,
              );
            }
          }
        } else {
          result = await runAttempt(fallbackSettings, "");
        }
      } else {
        result = await runAttempt(settings, apiKey);
      }
      set({ job: { status: "complete", result, fallbackFrom } });
      return true;
    } catch (error) {
      set({
        job: {
          status: "error",
          message: listeningAudioErrorMessage(error),
          detail: safeTtsErrorDetail(error),
        },
      });
      return false;
    } finally {
      unlisten?.();
    }
  },

  reportError: (error) =>
    set({
      job: {
        status: "error",
        message: listeningAudioErrorMessage(error),
        detail: safeTtsErrorDetail(error),
      },
    }),

  clear: () => set({ job: null }),
}));
