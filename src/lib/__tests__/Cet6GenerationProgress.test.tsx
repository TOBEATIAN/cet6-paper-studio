import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { Cet6GenerationProgress } from "../../components/assistant/Cet6GenerationProgress";

type ProgressState = {
  status: "idle" | "running" | "completed" | "error";
  currentPhase: string | null;
  completedPhases: string[];
  errorCode: string | null;
  errorDetail: string | null;
  errorPhase: string | null;
  qualityReport: null;
  generationStartedAt: string;
  estimatedTotalMs: number;
  openDiagnostics: ReturnType<typeof vi.fn>;
};

function progressState(): ProgressState {
  return {
    status: "error",
    currentPhase: null,
    completedPhases: [
      "blueprint",
      "writing",
      "listening-a",
      "listening-b",
      "listening-c",
      "reading-a",
    ],
    errorCode: "jsonRetryExhausted",
    errorDetail:
      "失败阶段：段落匹配\n逐条重合上限 ≤69%: 73%\n至少一条观点归属型陈述: ",
    errorPhase: "reading-b",
    qualityReport: null,
    generationStartedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    estimatedTotalMs: 15 * 60_000,
    openDiagnostics: vi.fn(),
  };
}

let state: ProgressState;

vi.mock("../../stores/cet6GenerationStore", () => ({
  useCet6GenerationStore: (selector: (value: unknown) => unknown) =>
    selector(state),
}));

describe("Cet6GenerationProgress", () => {
  beforeEach(() => {
    state = progressState();
  });

  it("shows the failed stage, backend detail, and support copy action", () => {
    render(<Cet6GenerationProgress />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "多次尝试后 AI 仍未能生成合法的题目数据",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "失败阶段：段落匹配",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "逐条重合上限 ≤69%: 73%",
    );
    expect(
      screen.getByRole("button", { name: "复制诊断信息" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开诊断目录" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("预计还需");
  });

  it.each(["completed", "idle"] as const)(
    "freezes the duration when status is %s",
    (status) => {
      vi.useFakeTimers();
      state = {
        ...progressState(),
        status,
        errorCode: null,
        errorDetail: null,
        errorPhase: null,
        estimatedTotalMs: 7 * 60_000,
      };
      const view = render(<Cet6GenerationProgress />);

      expect(view.container).toHaveTextContent("本次生成用时约 7 分钟");
      act(() => vi.advanceTimersByTime(3 * 60_000));
      expect(view.container).toHaveTextContent("本次生成用时约 7 分钟");
      expect(view.container).not.toHaveTextContent("预计还需");
      vi.useRealTimers();
    },
  );
});
