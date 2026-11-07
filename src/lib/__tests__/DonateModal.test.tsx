import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { DonateModal } from "../../components/layout/DonateModal";

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(),
}));

let settings = {
  supportUrl: "https://afdian.com/a/cet6-studio",
  supportNote: "自愿支持后续维护。",
};

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      config: { settings },
    }),
}));

describe("DonateModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      supportUrl: "https://afdian.com/a/cet6-studio",
      supportNote: "自愿支持后续维护。",
    };
  });

  it("opens the Afdian support page without gating features", async () => {
    render(<DonateModal onClose={vi.fn()} />);

    expect(
      screen.getByText("通过爱发电支持后续维护"),
    ).toBeInTheDocument();
    expect(screen.getByText("自愿支持后续维护。")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "前往爱发电" }),
    );
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://afdian.com/a/cet6-studio",
    );
    expect(
      screen.getByText("打赏完全自愿，不会解锁或限制任何功能。"),
    ).toBeInTheDocument();
  });

  it("shows a setup message without exposing a personal static QR", () => {
    settings.supportUrl = "";
    render(<DonateModal onClose={vi.fn()} />);

    expect(screen.getByText("支持页面尚未配置")).toBeInTheDocument();
    expect(
      screen.getByText(/当前不会显示个人静态收款码/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects unsafe support URLs", () => {
    settings.supportUrl = "javascript:alert(1)";
    render(<DonateModal onClose={vi.fn()} />);

    expect(screen.getByText("支持页面尚未配置")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "前往爱发电" }),
    ).not.toBeInTheDocument();
  });
});
