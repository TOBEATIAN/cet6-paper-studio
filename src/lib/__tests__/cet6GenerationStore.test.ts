import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../types/library";
import type { Question } from "../types/exam";
import {
  CET6_CONTENT_STAGES,
  type Cet6ContentStage,
} from "../types/cet";
import { defaultAppConfig } from "../types/config";
import {
  CET6_STAGE_SPECS,
  expectedQuestionCount,
} from "../cet/structure";
import { useAssistantStore } from "../../stores/assistantStore";
import { useCet6GenerationStore } from "../../stores/cet6GenerationStore";
import { useConfigStore } from "../../stores/configStore";
import { usePaperStore } from "../../stores/paperStore";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  failReadingBQuality: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock("../../lib/cet/quality/audit", () => ({
  auditCet6Stage: (stage: string) => ({
    checks: [],
    metrics: {},
    errors:
      stage === "reading-b" && tauriMocks.failReadingBQuality
        ? [
            {
              id: "reading-b:rewrite-max",
              label: "逐条重合上限 ≤69%",
              severity: "error",
              passed: false,
              detail: "73%",
            },
          ]
        : [],
    warnings: [],
    passed: !(stage === "reading-b" && tauriMocks.failReadingBQuality),
  }),
  auditCet6Paper: () => ({
    checks: [{ id: "mock", label: "mock", severity: "error", passed: true }],
    metrics: {},
    errors: [],
    warnings: [],
    passed: true,
  }),
  auditReadingBPassage: () => ({
    checks: [],
    metrics: {},
    errors: [],
    warnings: [],
    passed: true,
  }),
  auditReadingCPassage: () => ({
    checks: [],
    metrics: {},
    errors: [],
    warnings: [],
    passed: true,
  }),
}));

const blueprint = {
  title: "Staged test paper",
  topics: {
    writing: "Academic integrity and AI",
    listening: "Campus science and cultural exchange",
    reading: "Sustainable cities and changing work",
    translation: "Traditional Chinese paper umbrellas",
  },
};

function stageQuestions(stage: Cet6ContentStage): Question[] {
  const spec = CET6_STAGE_SPECS[stage];
  if (stage === "writing") {
    return [
      {
        id: "writing",
        type: "essay",
        content: "Write an essay about responsible AI use by university students.",
        referenceAnswer: "",
        writingGuidance:
          "开头复述给定句并明确立场；主体用两个递进理由，分别讨论学术诚信和学习能力；结尾给出可执行建议。",
        score: 106.5,
        scoringCriteria: "Clear argument, organisation, and accurate language.",
      },
    ];
  }
  if (stage === "translation") {
    return [
      {
        id: "translation",
        type: "short-answer",
        content: "纸伞是中国传统手工艺。".repeat(20),
        referenceAnswer:
          "Paper umbrellas are a traditional Chinese craft.",
        scoringPoints: ["Accurate meaning", "Natural English"],
        score: 106.5,
      },
    ];
  }

  let counter = 0;
  const optionCount =
    stage === "reading-a" ? 15 : stage === "reading-b" ? 13 : 4;
  return spec.groups.flatMap((group, groupIndex) =>
    group.questionNumbers.map((questionNumber, index) => {
      counter += 1;
      return {
        id: `${stage}-${counter}`,
        type: "single-choice" as const,
        content: `What can be inferred from item ${questionNumber}?`,
        options: Array.from(
          { length: optionCount },
          (_, optionIndex) => `Choice ${optionIndex + 1}`,
        ),
        correctAnswer: index % optionCount,
        explanation:
          "The evidence supports this choice; the other options shift either scope or cause.",
        score: spec.scorePerQuestion,
        examSection: {
          kind: spec.kind,
          groupId: `${stage}-${groupIndex}`,
          questionNumber,
          ...(index === 0
            ? { passage: `Shared material for ${stage} group ${groupIndex + 1}.` }
            : {}),
        },
      };
    }),
  );
}

function stageFromPrompt(messages: Array<{ content: string }>): Cet6ContentStage {
  const prompt = messages.map((message) => message.content).join("\n");
  const match = prompt.match(/examSection\.kind: (cet-[a-z-]+)/);
  const kind = match?.[1];
  const entry = CET6_CONTENT_STAGES.find(
    (stage) => CET6_STAGE_SPECS[stage].kind === kind,
  );
  if (!entry) throw new Error(`Unknown stage prompt: ${kind}`);
  return entry;
}

function readingCQuestionsFromPrompt(prompt: string): Question[] {
  const firstNumber = prompt.includes("Q46=") ? 46 : 51;
  const answerMap = new Map(
    [...prompt.matchAll(/Q(\d+)=([A-D])/g)].map((match) => [
      Number(match[1]),
      match[2].charCodeAt(0) - 65,
    ]),
  );
  return Array.from({ length: 5 }, (_, index) => ({
    id: `reading-c-${firstNumber + index}`,
    type: "single-choice" as const,
    content: `What can be inferred from Reading C item ${index + 1}?`,
    options: [
      "A complete option with context",
      "Another plausible option with detail",
      "A third option with interpretation",
      "A fourth option with evidence",
    ],
    correctAnswer: answerMap.get(firstNumber + index) ?? 0,
    explanation:
      "原文说 “supporting evidence”，正确项是跨句概括，故选 A。A) 张冠李戴；B) 程度偏移；C) 无中生有；D) 答非所问。",
    score: 14.2,
    examSection: {
      kind: "cet-reading-c",
      groupId: `reading-c-passage-${firstNumber === 46 ? 1 : 2}`,
      questionNumber: firstNumber + index,
    },
  }));
}

function writingOpeningFromPrompt(prompt: string): string {
  if (/must begin with Nowadays/.test(prompt)) {
    return "Nowadays responsible artificial intelligence use has become an essential part of university learning and professional preparation.";
  }
  if (/must begin with a natural With/.test(prompt)) {
    return "With the rapid growth of artificial intelligence, responsible use has become essential for university students and future professionals.";
  }
  if (/must begin with Faced with/.test(prompt)) {
    return "Faced with increasingly powerful artificial intelligence tools, university students must learn responsible use and critical evaluation.";
  }
  if (/must begin with It is/.test(prompt)) {
    return "It is widely believed that responsible artificial intelligence use is essential for university learning and future work.";
  }
  if (/must begin with People/.test(prompt)) {
    return "People are now increasingly aware that responsible artificial intelligence use matters for university learning and work.";
  }
  if (/must begin with There is a growing awareness/.test(prompt)) {
    return "There is a growing awareness that responsible artificial intelligence use matters for university learning and work.";
  }
  if (/must begin with In an era of/.test(prompt)) {
    return "In an era of rapid artificial intelligence development, responsible use has become essential for university students.";
  }
  return "To prepare for responsible artificial intelligence use, university students need clear judgement and practical digital skills.";
}

describe("cet6GenerationStore", () => {
  let savedCheckpoints: unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    savedCheckpoints = [];
    tauriMocks.failReadingBQuality = false;
    tauriMocks.invoke.mockImplementation(
      (command: string, args?: Record<string, unknown>) => {
        if (command === "get_api_key") return Promise.resolve("deepseek-key");
        if (command === "load_cet6_checkpoint") return Promise.resolve(null);
        if (command === "save_cet6_checkpoint") {
          savedCheckpoints.push(
            JSON.parse(String(args?.contents ?? "{}")) as unknown,
          );
          return Promise.resolve();
        }
        if (command === "complete_chat") {
          const messages = args?.messages as Array<{ content: string }>;
          const prompt = messages.map((message) => message.content).join("\n");
          if (prompt.includes("Create a compact blueprint")) {
            return Promise.resolve(
              `\`\`\`json\n${JSON.stringify(blueprint)}\n\`\`\``,
            );
          }
          if (prompt.includes("Generate only the Reading Section B passage")) {
            return Promise.resolve(
              `\`\`\`json\n${JSON.stringify({
                passage: "A. ".concat("garden ".repeat(1_100)),
              })}\n\`\`\``,
            );
          }
          if (prompt.includes("Generate only Passage")) {
            const passageNumber = prompt.includes("Generate only Passage 1")
              ? 1
              : 2;
            return Promise.resolve(
              `\`\`\`json\n${JSON.stringify({
                passage:
                  `Original research findings passage ${passageNumber} `.repeat(
                    70,
                  ) +
                  "Dr. Alice Smith said, “This evidence changes practical decisions.”",
              })}\n\`\`\``,
            );
          }
          if (
            prompt.includes(
              "Generate only the five Reading Section C questions",
            )
          ) {
            return Promise.resolve(
              `\`\`\`json\n${JSON.stringify({
                questions: readingCQuestionsFromPrompt(prompt),
              })}\n\`\`\``,
            );
          }
          const stage = stageFromPrompt(messages);
          const questions = stageQuestions(stage);
          if (stage === "writing" && questions[0]?.type === "essay") {
            const opening = writingOpeningFromPrompt(prompt);
            questions[0].content = `For this part, you are allowed 30 minutes to write an essay. Your essay should begin with the following sentence: "${opening}" You should write at least 150 words but no more than 200 words. You may use your personal experiences to illustrate your point.`;
            questions[0].referenceAnswer =
              `${opening} ` +
              "Responsible use supports honest learning and careful judgement. ".repeat(
                20,
              );
          }
          if (stage === "reading-b") {
            const answerPlan = [
              ...prompt.matchAll(
                /Q\d+=[A-O]\(correctAnswer (\d+)\)/g,
              ),
            ].map((match) => Number(match[1]));
            for (let index = 0; index < questions.length; index += 1) {
              const question = questions[index];
              if (question.type === "single-choice") {
                question.correctAnswer = answerPlan[index] ?? index;
              }
            }
          }
          if (stage === "reading-a") {
            const answerPlan = new Map(
              [...prompt.matchAll(/Q(\d+)=[A-O]\(correctAnswer (\d+)\)/g)].map(
                (match) => [Number(match[1]), Number(match[2])],
              ),
            );
            for (const question of questions) {
              const number = question.examSection?.questionNumber;
              if (
                question.type === "single-choice" &&
                number != null &&
                answerPlan.has(number)
              ) {
                question.correctAnswer = answerPlan.get(number) ?? 0;
              }
            }
          }
          if (stage.startsWith("listening")) {
            const answerPlan = new Map(
              [...prompt.matchAll(/Q(\d+)=[A-D]\(correctAnswer (\d+)\)/g)].map(
                (match) => [Number(match[1]), Number(match[2])],
              ),
            );
            for (const question of questions) {
              const number = question.examSection?.questionNumber;
              if (
                question.type === "single-choice" &&
                number != null &&
                answerPlan.has(number)
              ) {
                question.correctAnswer = answerPlan.get(number) ?? 0;
              }
            }
          }
          return Promise.resolve(
            `\`\`\`json\n${JSON.stringify({
              questions,
            })}\n\`\`\``,
          );
        }
        return Promise.resolve();
      },
    );

    useConfigStore.setState({
      dataDir: "/tmp/cet6-test",
      config: {
        ...defaultAppConfig(),
        configs: [
          {
            id: "deepseek",
            name: "DeepSeek",
            baseUrl: "https://api.deepseek.com",
            model: "deepseek-flash",
          },
        ],
        activeConfigId: "deepseek",
      },
    });
    usePaperStore.setState({
      paper: { version: 1, title: "", questions: [] },
      activePaperId: "paper-1",
      undoSnapshot: null,
      saveStatus: "saved",
    });
    useAssistantStore.getState().reset();
    useCet6GenerationStore.getState().reset();
  });

  it("generates all nine phases, saves each stage, and previews one full paper", async () => {
    await useCet6GenerationStore.getState().start();

    expect(useCet6GenerationStore.getState().status).toBe("completed");
    expect(useCet6GenerationStore.getState().completedPhases).toHaveLength(9);
    expect(
      tauriMocks.invoke.mock.calls.filter(
        ([command]) => command === "complete_chat",
      ),
    ).toHaveLength(13);
    const readingBCalls = tauriMocks.invoke.mock.calls.filter(
      ([command, args]) => {
        if (command !== "complete_chat") return false;
        const prompt =
          (args as { messages?: Array<{ content?: string }> })?.messages
            ?.map((message) => message.content ?? "")
            .join("\n") ?? "";
        return (
          prompt.includes("Generate only the Reading Section B passage") ||
          prompt.includes("The ten correct answer positions are fixed")
        );
      },
    );
    expect(readingBCalls).toHaveLength(2);
    expect(
      readingBCalls.every(
        ([, args]) =>
          (args as { maxTokens?: number } | undefined)?.maxTokens === 65_536,
      ),
    ).toBe(true);
    expect(savedCheckpoints).toHaveLength(10);
    expect(
      savedCheckpoints.some(
        (checkpoint) =>
          typeof checkpoint === "object" &&
          checkpoint !== null &&
          typeof (checkpoint as { readingBPassage?: unknown })
            .readingBPassage === "string",
      ),
    ).toBe(true);

    const result = useAssistantStore
      .getState()
      .messages.find(
        (message): message is Extract<ChatMessage, { kind: "result" }> =>
          message.kind === "result",
      );
    expect(result?.operations).toHaveLength(2);
    const append = result?.operations.find(
      (operation) => operation.type === "appendQuestions",
    );
    expect(append?.type).toBe("appendQuestions");
    if (append?.type === "appendQuestions") {
      expect(append.questions).toHaveLength(
        CET6_CONTENT_STAGES.reduce(
          (sum, stage) => sum + expectedQuestionCount(stage),
          0,
        ),
      );
    }
  });

  it("reports a missing DeepSeek key without making a completion request", async () => {
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "get_api_key") return Promise.resolve(null);
      return Promise.resolve();
    });

    await useCet6GenerationStore.getState().start();

    expect(useCet6GenerationStore.getState().status).toBe("error");
    expect(useCet6GenerationStore.getState().errorCode).toBe("auth");
    expect(
      tauriMocks.invoke.mock.calls.some(
        ([command]) => command === "complete_chat",
      ),
    ).toBe(false);
  });

  it("persists the failed stage and visible quality details", async () => {
    tauriMocks.failReadingBQuality = true;

    await useCet6GenerationStore.getState().start();

    const state = useCet6GenerationStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("jsonRetryExhausted");
    expect(state.errorPhase).toBe("reading-b");
    expect(state.errorDetail).toContain("失败阶段：段落匹配");
    expect(state.errorDetail).toContain("逐条重合上限 ≤69%: 73%");
    expect(state.errorDetail).toContain(
      "诊断目录：/tmp/cet6-test/generation/cet6/diagnostics/paper-1",
    );
    const error = useAssistantStore
      .getState()
      .messages.find(
        (message): message is Extract<ChatMessage, { kind: "error" }> =>
          message.kind === "error",
      );
    expect(error?.detail).toContain("失败阶段：段落匹配");

    const diagnosticCalls = tauriMocks.invoke.mock.calls.filter(
      ([command]) => command === "save_cet6_diagnostic",
    );
    expect(diagnosticCalls.length).toBeGreaterThan(0);
    const diagnostic = JSON.parse(
      String(
        (diagnosticCalls[diagnosticCalls.length - 1]?.[1] as {
          contents?: string;
        })?.contents ?? "{}",
      ),
    ) as {
      stage?: string;
      status?: string;
      error?: string;
      rawReply?: string;
    };
    expect(diagnostic.stage).toBe("reading-b");
    expect(diagnostic.status).toBe("validation_failed");
    expect(diagnostic.error).toContain("逐条重合上限");
    expect(diagnostic.rawReply).toContain("questions");
    expect(JSON.stringify(diagnostic)).not.toContain("deepseek-key");
    expect(
      tauriMocks.invoke.mock.calls.some(([command, args]) => {
        if (command !== "complete_chat") return false;
        return (
          (args as { messages?: Array<{ content?: string }> })?.messages
            ?.map((message) => message.content ?? "")
            .join("\n")
            .includes("Repair your previous JSON output") ?? false
        );
      }),
    ).toBe(true);

    await useCet6GenerationStore.getState().openDiagnostics();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "open_cet6_diagnostic_dir",
      {
        dataDir: "/tmp/cet6-test",
        paperId: "paper-1",
      },
    );
  });
});
