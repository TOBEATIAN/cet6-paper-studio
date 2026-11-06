import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ErrorCard } from "../../components/assistant/ErrorCard";

vi.mock("../../stores/assistantStore", () => ({
  useAssistantStore: (selector: (state: unknown) => unknown) =>
    selector({ retry: vi.fn(), status: "idle" }),
}));

describe("ErrorCard", () => {
  it("shows generation validation diagnostics for jsonRetryExhausted", async () => {
    const user = userEvent.setup();
    render(
      <ErrorCard
        code="jsonRetryExhausted"
        detail="逐条重合上限 ≤69%: 73%"
        retryExhausted={false}
        retryable={false}
        onCheckSettings={vi.fn()}
      />,
    );

    expect(
      screen.getByText("多次尝试后 AI 仍未能生成合法的题目数据。"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "查看问题详情" }),
    );
    expect(screen.getByText(/逐条重合上限 ≤69%: 73%/)).toBeInTheDocument();
  });
});
