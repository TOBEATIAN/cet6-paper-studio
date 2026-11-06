import { describe, expect, it } from "vitest";
import {
  assertCompleteListeningPlan,
  configForTtsSettings,
  countSpokenWords,
  defaultListeningAudioPath,
  listeningCacheDir,
  listeningAudioErrorMessage,
  ttsConnectionProbe,
  listeningPlanStats,
} from "../tts/audio";
import type { ListeningSpeechPlan, SpeechSegment } from "../tts/plan";
import { AppConfigSchema } from "../types/config";

function segment(
  id: string,
  pauseAfterMs = 80,
  text = "One short sentence here.",
): SpeechSegment {
  return {
    id,
    role: "narrator",
    text,
    pauseAfterMs,
    section: "cet-listening-a",
  };
}

function completePlan(): ListeningSpeechPlan {
  return {
    version: 1,
    targetWpm: 170,
    segments: [
      ...Array.from({ length: 25 }, (_, index) =>
        segment(`question-${index + 1}`, 13_100),
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        segment(`group-${index + 1}-announcement`),
      ),
    ],
  };
}

describe("listening audio export helpers", () => {
  it("counts words and listening checkpoints", () => {
    expect(countSpokenWords("Don't stop — Question 12 is next.")).toBe(6);
    expect(listeningPlanStats(completePlan())).toEqual({
      words: 32 * 4,
      characters: 32 * "One short sentence here.".length,
      questionPauses: 25,
      groupAnnouncements: 7,
    });
  });

  it("rejects an incomplete listening paper", () => {
    const plan = completePlan();
    plan.segments = plan.segments.filter(
      (item) => item.pauseAfterMs !== 13_100,
    );
    expect(() => assertCompleteListeningPlan(plan)).toThrow(
      "incompleteListeningPlan",
    );
  });

  it("builds provider-specific configs without leaking the cloud key", () => {
    const aliyun = AppConfigSchema.parse({}).settings.tts;
    expect(configForTtsSettings(aliyun, "cloud-key")).toEqual({
      provider: "aliyun",
      baseUrl: aliyun.aliyunBaseUrl,
      apiKey: "cloud-key",
      model: "qwen3-tts-flash",
      femaleVoice: "Jennifer",
      maleVoice: "Neil",
    });

    const local = { ...aliyun, activeProvider: "openai-compatible" as const };
    expect(configForTtsSettings(local, "")).toMatchObject({
      provider: "openai-compatible",
      apiKey: "",
      femaleVoice: aliyun.localFemaleVoice,
      maleVoice: aliyun.localMaleVoice,
    });

    const mimo = { ...aliyun, activeProvider: "mimo" as const };
    expect(configForTtsSettings(mimo, "mimo-key")).toEqual({
      provider: "mimo",
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "mimo-key",
      model: "mimo-v2.5-tts",
      femaleVoice: "Chloe",
      maleVoice: "Milo",
    });

    const siliconflow = {
      ...aliyun,
      activeProvider: "siliconflow" as const,
    };
    expect(configForTtsSettings(siliconflow, "sf-key")).toEqual({
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sf-key",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      femaleVoice: "FunAudioLLM/CosyVoice2-0.5B:anna",
      maleVoice: "FunAudioLLM/CosyVoice2-0.5B:benjamin",
    });
  });

  it("keeps resumable speech caches next to the selected MP3", () => {
    expect(listeningCacheDir("E:\\试卷\\模拟卷.mp3")).toBe(
      "E:\\试卷\\.模拟卷.tts-cache",
    );
    expect(listeningCacheDir("/tmp/mock.mp3")).toBe(
      "/tmp/.mock.tts-cache",
    );
  });

  it("builds a safe automatic audio path and maps provider failures", () => {
    expect(
      defaultListeningAudioPath(
        "E:\\CET-6",
        "2026年10月31日六级模拟卷",
        "eb32c436-372b-40f6-8f54-ad4a9b6ac830",
      ),
    ).toBe(
      "E:\\CET-6\\papers\\2026年10月31日六级模拟卷-eb32c436-Listening.mp3",
    );
    expect(listeningAudioErrorMessage(new Error("missingApiKey"))).toBe(
      "export.audioMissingKey",
    );
    expect(
      listeningAudioErrorMessage(new Error("incompleteListeningPlan")),
    ).toBe("export.audioIncomplete");
    expect(listeningAudioErrorMessage(new Error("HTTP 401 unauthorized"))).toBe(
      "export.audioCloudAuth",
    );
    expect(listeningAudioErrorMessage(new Error("network timeout"))).toBe(
      "export.audioCloudUnavailable",
    );
    expect(
      listeningAudioErrorMessage(
        new Error("could not start the Kitten sidecar"),
      ),
    ).toBe("export.audioKittenRuntime");
    expect(
      listeningAudioErrorMessage(new Error("Access is denied")),
    ).toBe("export.audioPathError");
  });

  it("uses Kitten-specific connection-test parameters", () => {
    const settings = {
      ...AppConfigSchema.parse({}).settings.tts,
      activeProvider: "kitten" as const,
    };
    expect(ttsConnectionProbe(settings, "unused")).toEqual({
      provider: "kitten",
      baseUrl: "",
      apiKey: "",
      model: "kitten-tts-nano-0.8-int8",
      voice: "Rosie",
      speed: 1,
    });
  });

  it("uses MiMo chat-audio connection-test parameters", () => {
    const settings = {
      ...AppConfigSchema.parse({}).settings.tts,
      activeProvider: "mimo" as const,
    };
    expect(ttsConnectionProbe(settings, "mimo-key")).toEqual({
      provider: "mimo",
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "mimo-key",
      model: "mimo-v2.5-tts",
      voice: "Chloe",
      speed: 1,
    });
  });

  it("uses SiliconFlow OpenAI speech-test parameters", () => {
    const settings = {
      ...AppConfigSchema.parse({}).settings.tts,
      activeProvider: "siliconflow" as const,
    };
    expect(ttsConnectionProbe(settings, "sf-key")).toEqual({
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sf-key",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      voice: "FunAudioLLM/CosyVoice2-0.5B:anna",
      speed: 1,
    });
  });
});
