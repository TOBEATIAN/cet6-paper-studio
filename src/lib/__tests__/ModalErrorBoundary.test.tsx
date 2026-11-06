import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalErrorBoundary } from "../../components/layout/ModalErrorBoundary";

function ThrowingPanel(): never {
  throw new Error("panel exploded");
}

describe("ModalErrorBoundary", () => {
  it("shows a closeable fallback when a modal crashes", async () => {
    const onClose = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ModalErrorBoundary
        title="界面加载失败"
        message="可以安全返回"
        closeLabel="关闭"
        backLabel="返回"
        retryLabel="重试"
        onClose={onClose}
      >
        <ThrowingPanel />
      </ModalErrorBoundary>,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("panel exploded");
    await userEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(onClose).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
