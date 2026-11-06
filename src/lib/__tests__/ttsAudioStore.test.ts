import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper } from "../types/exam";
import { useTtsAudioStore } from "../../stores/ttsAudioStore";

const mocks = vi.hoisted(() => ({
  getTtsApiKey: vi.fn(),
  generateListeningAudio: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("../storage/tauri", () => ({
  generateListeningAudio: mocks.generateListeningAudio,
}));

vi.mock("../tts/plan", () => ({
  buildListeningSpeechPlan: (_paper: ExamPaper, targetWpm: number) => ({
    version: 1,
    targetWpm,
    segments: [
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `question-${index + 1}`,
        role: "narrator",
        text: `Question ${index + 1}.`,
        pauseAfterMs: 13_100,
        section: "cet-listening-a",
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `group-${index + 1}-announcement`,
        role: "narrator",
        text: "Questions are based on the recording.",
        pauseAfterMs: 400,
        section: "cet-listening-a",
      })),
    ],
  }),
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: {
    getState: () => ({
      dataDir: "E:\\CET-6",
      config: {
        settings: {
          tts: {
            activeProvider: "aliyun",
            targetWpm: 170,
            aliyunBaseUrl: "https://dashscope.example",
            aliyunModel: "qwen3-tts-flash",
            aliyunFemaleVoice: "Jennifer",
            aliyunMaleVoice: "Neil",
            mimoBaseUrl: "",
            mimoModel: "",
            mimoFemaleVoice: "",
            mimoMaleVoice: "",
            siliconflowBaseUrl: "",
            siliconflowModel: "",
            siliconflowFemaleVoice: "",
            siliconflowMaleVoice: "",
            kittenFemaleVoice: "Rosie",
            kittenMaleVoice: "Bruno",
            localBaseUrl: "",
            localModel: "",
            localFemaleVoice: "",
            localMaleVoice: "",
          },
        },
      },
      getTtsApiKey: mocks.getTtsApiKey,
    }),
  },
}));

const paper: ExamPaper = {
  version: 1,
  title: "Test paper",
  questions: [],
};

describe("TTS audio store fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTtsAudioStore.getState().clear();
    mocks.listen.mockResolvedValue(vi.fn());
    mocks.getTtsApiKey.mockResolvedValue("cloud-key");
    mocks.generateListeningAudio.mockResolvedValue({
      outputPath: "E:\\CET-6\\Listening.mp3",
      durationMs: 1_500_000,
      effectiveWpm: 170,
    });
  });

  it("falls back to bundled Kitten when the cloud provider fails", async () => {
    mocks.generateListeningAudio
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        outputPath: "E:\\CET-6\\Listening.mp3",
        durationMs: 1_510_000,
        effectiveWpm: 168,
      });

    const succeeded = await useTtsAudioStore
      .getState()
      .start(paper, "E:\\CET-6\\Listening.mp3");

    expect(succeeded).toBe(true);
    expect(mocks.generateListeningAudio).toHaveBeenCalledTimes(2);
    expect(mocks.generateListeningAudio.mock.calls[0][0].config.provider).toBe(
      "aliyun",
    );
    expect(mocks.generateListeningAudio.mock.calls[1][0].config.provider).toBe(
      "kitten",
    );
    expect(useTtsAudioStore.getState().job).toMatchObject({
      status: "complete",
      fallbackFrom: "aliyun",
    });
  });

  it("uses Kitten directly when a cloud API key is missing", async () => {
    mocks.getTtsApiKey.mockResolvedValue(null);

    const succeeded = await useTtsAudioStore
      .getState()
      .start(paper, "E:\\CET-6\\Listening.mp3");

    expect(succeeded).toBe(true);
    expect(mocks.generateListeningAudio).toHaveBeenCalledTimes(1);
    expect(mocks.generateListeningAudio.mock.calls[0][0].config.provider).toBe(
      "kitten",
    );
  });
});
