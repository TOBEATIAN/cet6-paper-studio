import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { DonateModal } from "../../components/layout/DonateModal";

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(),
  readImageFile: vi.fn(),
  readDefaultDonationQr: vi.fn(),
}));

let settings = {
  supportUrl: "",
  supportQrPath: "",
  supportAlipayQrPath: "",
  supportNote: "自愿支持后续维护。",
};

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

vi.mock("../../lib/storage/tauri", () => ({
  readImageFile: mocks.readImageFile,
  readDefaultDonationQr: mocks.readDefaultDonationQr,
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
    mocks.readImageFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.readDefaultDonationQr.mockResolvedValue(new Uint8Array([1, 2, 3]));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:payment-qr"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    settings = {
      supportUrl: "",
      supportQrPath: "",
      supportAlipayQrPath: "",
      supportNote: "自愿支持后续维护。",
    };
  });

  it("uses the bundled QR codes when the user has no custom paths", async () => {
    render(<DonateModal onClose={vi.fn()} />);

    expect(
      await screen.findByRole("img", { name: "微信赞赏码" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "支付宝收款码" }),
    ).toBeInTheDocument();
    expect(mocks.readDefaultDonationQr).toHaveBeenCalledWith("wechat");
    expect(mocks.readDefaultDonationQr).toHaveBeenCalledWith("alipay");
    expect(screen.getByText("自愿支持后续维护。")).toBeInTheDocument();
  });

  it("opens the optional support page without gating features", async () => {
    settings.supportUrl = "https://example.com/support";
    render(<DonateModal onClose={vi.fn()} />);

    await userEvent.click(
      screen.getByRole("button", { name: "打开支持页面" }),
    );

    expect(mocks.openUrl).toHaveBeenCalledWith("https://example.com/support");
    expect(
      screen.getByText("打赏完全自愿，不会解锁或限制任何功能。"),
    ).toBeInTheDocument();
  });

  it("shows WeChat and Alipay QR codes and opens each large preview", async () => {
    settings.supportQrPath = "E:\\papers\\support.jpg";
    settings.supportAlipayQrPath = "E:\\papers\\alipay.jpg";
    render(<DonateModal onClose={vi.fn()} />);

    const image = await screen.findByRole("img", { name: "微信赞赏码" });
    expect(image).toHaveClass("max-h-[46vh]", "w-auto");
    expect(
      await screen.findByRole("img", { name: "支付宝收款码" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "放大微信赞赏码" }),
    );
    expect(
      screen.getByRole("dialog", { name: "赞赏码大图" }),
    ).toBeInTheDocument();
  });

  it("shows a recoverable error when the configured QR cannot load", () => {
    settings.supportQrPath = "E:\\papers\\missing.jpg";
    mocks.readImageFile.mockRejectedValue(new Error("missing"));
    mocks.readDefaultDonationQr.mockRejectedValue(new Error("missing"));
    render(<DonateModal onClose={vi.fn()} />);

    return screen.findAllByText("赞赏码图片加载失败").then((messages) => {
      expect(messages).toHaveLength(2);
      expect(screen.getAllByText(/重新安装完整版本/)).toHaveLength(2);
    });
  });
});
