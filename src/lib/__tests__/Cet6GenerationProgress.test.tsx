import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";
import { Cet6GenerationProgress } from "../../components/assistant/Cet6GenerationProgress";

const state = {
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

vi.mock("../../stores/cet6GenerationStore", () => ({
  useCet6GenerationStore: (selector: (value: unknown) => unknown) =>
    selector(state),
}));

describe("Cet6GenerationProgress", () => {
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
});
