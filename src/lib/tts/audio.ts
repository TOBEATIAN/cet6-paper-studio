import type { TtsSettings } from "../types/config";
import type { ListeningSpeechPlan } from "./plan";
import type { SpeechSynthesisConfig } from "../storage/tauri";

export const EXPECTED_LISTENING_QUESTIONS = 25;
export const EXPECTED_GROUP_ANNOUNCEMENTS = 7;

export interface ListeningPlanStats {
  words: number;
  characters: number;
  questionPauses: number;
  groupAnnouncements: number;
}

export function listeningPlanStats(
  plan: ListeningSpeechPlan,
): ListeningPlanStats {
  return plan.segments.reduce<ListeningPlanStats>(
    (stats, segment) => ({
      words: stats.words + countSpokenWords(segment.text),
      characters: stats.characters + Array.from(segment.text).length,
      questionPauses:
        stats.questionPauses + (segment.pauseAfterMs === 13_100 ? 1 : 0),
      groupAnnouncements:
        stats.groupAnnouncements +
        (segment.id.endsWith("-announcement") ? 1 : 0),
    }),
    {
      words: 0,
      characters: 0,
      questionPauses: 0,
      groupAnnouncements: 0,
    },
  );
}

export function assertCompleteListeningPlan(plan: ListeningSpeechPlan): void {
  const stats = listeningPlanStats(plan);
  if (
    stats.questionPauses !== EXPECTED_LISTENING_QUESTIONS ||
    stats.groupAnnouncements !== EXPECTED_GROUP_ANNOUNCEMENTS
  ) {
    throw new Error("incompleteListeningPlan");
  }
}

export function configForTtsSettings(
  settings: TtsSettings,
  apiKey: string,
): SpeechSynthesisConfig {
  if (settings.activeProvider === "aliyun") {
    return {
      provider: "aliyun",
      baseUrl: settings.aliyunBaseUrl,
      apiKey,
      model: settings.aliyunModel,
      femaleVoice: settings.aliyunFemaleVoice,
      maleVoice: settings.aliyunMaleVoice,
    };
  }
  if (settings.activeProvider === "mimo") {
    return {
      provider: "mimo",
      baseUrl: settings.mimoBaseUrl,
      apiKey,
      model: settings.mimoModel,
      femaleVoice: settings.mimoFemaleVoice,
      maleVoice: settings.mimoMaleVoice,
    };
  }
  if (settings.activeProvider === "siliconflow") {
    return {
      provider: "siliconflow",
      baseUrl: settings.siliconflowBaseUrl,
      apiKey,
      model: settings.siliconflowModel,
      femaleVoice: settings.siliconflowFemaleVoice,
      maleVoice: settings.siliconflowMaleVoice,
    };
  }
  if (settings.activeProvider === "kitten") {
    return {
      provider: "kitten",
      baseUrl: "",
      apiKey: "",
      model: "kitten-tts-nano-0.8-int8",
      femaleVoice: settings.kittenFemaleVoice,
      maleVoice: settings.kittenMaleVoice,
    };
  }
  return {
    provider: "openai-compatible",
    baseUrl: settings.localBaseUrl,
    apiKey,
    model: settings.localModel,
    femaleVoice: settings.localFemaleVoice,
    maleVoice: settings.localMaleVoice,
  };
}

export function ttsConnectionProbe(
  settings: TtsSettings,
  apiKey: string,
): {
  provider: TtsSettings["activeProvider"];
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
} {
  if (settings.activeProvider === "aliyun") {
    return {
      provider: "aliyun",
      baseUrl: settings.aliyunBaseUrl,
      apiKey,
      model: settings.aliyunModel,
      voice: settings.aliyunFemaleVoice,
      speed: settings.targetWpm / 170,
    };
  }
  if (settings.activeProvider === "mimo") {
    return {
      provider: "mimo",
      baseUrl: settings.mimoBaseUrl,
      apiKey,
      model: settings.mimoModel,
      voice: settings.mimoFemaleVoice,
      speed: settings.targetWpm / 170,
    };
  }
  if (settings.activeProvider === "siliconflow") {
    return {
      provider: "siliconflow",
      baseUrl: settings.siliconflowBaseUrl,
      apiKey,
      model: settings.siliconflowModel,
      voice: settings.siliconflowFemaleVoice,
      speed: settings.targetWpm / 170,
    };
  }
  if (settings.activeProvider === "kitten") {
    return {
      provider: "kitten",
      baseUrl: "",
      apiKey: "",
      model: "kitten-tts-nano-0.8-int8",
      voice: settings.kittenFemaleVoice,
      speed: settings.targetWpm / 170,
    };
  }
  return {
    provider: "openai-compatible",
    baseUrl: settings.localBaseUrl,
    apiKey,
    model: settings.localModel,
    voice: settings.localFemaleVoice,
    speed: settings.targetWpm / 170,
  };
}

export function listeningCacheDir(outputPath: string): string {
  const slashIndex = Math.max(
    outputPath.lastIndexOf("\\"),
    outputPath.lastIndexOf("/"),
  );
  const directory = slashIndex >= 0 ? outputPath.slice(0, slashIndex) : ".";
  const fileName =
    slashIndex >= 0 ? outputPath.slice(slashIndex + 1) : outputPath;
  const stem = fileName.replace(/\.mp3$/i, "").replace(/[\\/:*?"<>|]/g, "_");
  return `${directory}${directory.includes("\\") ? "\\" : "/"}.${stem}.tts-cache`;
}

export function defaultListeningAudioPath(
  dataDir: string,
  title: string,
  paperId?: string,
): string {
  const separator = dataDir.includes("\\") ? "\\" : "/";
  const stem = (title.trim() || "CET6-listening").replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  const root = dataDir.replace(/[\\/]+$/, "");
  if (paperId) {
    const shortId = paperId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 8);
    return `${root}${separator}papers${separator}${stem}-${shortId}-Listening.mp3`;
  }
  return `${root}${separator}${stem}-Listening.mp3`;
}

export function listeningAudioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("incompleteListeningPlan") ||
    message.includes("listening questions") ||
    message.includes("group announcements")
  ) {
    return "export.audioIncomplete";
  }
  if (message.includes("missingApiKey") || message.includes("authentication")) {
    return "export.audioMissingKey";
  }
  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("invalid api key") ||
    message.includes("unauthorized")
  ) {
    return "export.audioCloudAuth";
  }
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("network") ||
    message.includes("429") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return "export.audioCloudUnavailable";
  }
  if (
    message.includes("kittenUnavailable") ||
    message.includes("Kitten sidecar is missing") ||
    message.includes("Kitten model files are missing")
  ) {
    return "export.audioKittenUnavailable";
  }
  if (
    message.includes("could not start the Kitten sidecar") ||
    message.includes("Kitten sidecar failed") ||
    message.includes("invalid result")
  ) {
    return "export.audioKittenRuntime";
  }
  if (
    message.includes("permission denied") ||
    message.includes("Access is denied") ||
    message.includes("path not found") ||
    message.includes("invalid path")
  ) {
    return "export.audioPathError";
  }
  return "export.audioGenericError";
}

export function safeTtsErrorDetail(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer ***")
    .slice(0, 1600);
}

export function countSpokenWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}
