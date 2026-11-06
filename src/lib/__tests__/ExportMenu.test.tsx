import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ExportMenu } from "../../components/layout/ExportMenu";

const mocks = vi.hoisted(() => ({
  setView: vi.fn(),
  replacePaper: vi.fn(),
  exportJson: vi.fn(),
  exportMarkdown: vi.fn(),
  importJson: vi.fn(),
  getTtsApiKey: vi.fn(),
  updateSettings: vi.fn(),
  readAudioFile: vi.fn(),
}));

vi.mock("../../stores/paperStore", () => ({
  usePaperStore: (selector: (state: unknown) => unknown) =>
    selector({
      paper: {
        version: 1,
        title: "测试卷",
        questions: [],
      },
      view: "teacher",
      setView: mocks.setView,
      replacePaper: mocks.replacePaper,
    }),
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      dataDir: "E:\\tmp",
      config: {
        settings: {
          tts: {
            activeProvider: "aliyun",
            targetWpm: 170,
          },
        },
      },
      getTtsApiKey: mocks.getTtsApiKey,
      updateSettings: mocks.updateSettings,
    }),
}));

vi.mock("../../lib/export/exportFile", () => ({
  exportJson: mocks.exportJson,
  exportMarkdown: mocks.exportMarkdown,
  importJson: mocks.importJson,
}));

vi.mock("../../lib/storage/tauri", () => ({
  readAudioFile: mocks.readAudioFile,
}));

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.paperPaginationReady = "true";
    mocks.setView.mockImplementation(() => {
      document.documentElement.dataset.paperPaginationReady = "true";
    });
    mocks.readAudioFile.mockRejectedValue(new Error("missing"));
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:cet6-listening"),
        revokeObjectURL: vi.fn(),
      }),
    );
    window.print = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("labels PDF as the WYSIWYG export and Markdown as a text backup", async () => {
    const user = userEvent.setup();
    render(<ExportMenu />);

    await user.click(screen.getByRole("button", { name: /导出/ }));

    expect(screen.getByText("PDF / 打印（所见即所得）")).toBeInTheDocument();
    expect(screen.getByText("Markdown 文本备份")).toBeInTheDocument();
  });

  it("lets the learner adjust listening speed before export", async () => {
    const user = userEvent.setup();
    render(<ExportMenu variant="audio" />);

    await user.click(screen.getByRole("button", { name: /听力/ }));
    const slider = screen.getByRole("slider", { name: "听力训练语速" });
    expect(slider).toHaveValue("170");

    fireEvent.change(slider, { target: { value: "185" } });

    expect(
      screen.getByRole("menuitem", { name: /听力 MP3（185 wpm）/ }),
    ).toBeInTheDocument();
  });

  it("switches to the answer-analysis view before printing the answer PDF", async () => {
    const user = userEvent.setup();
    render(<ExportMenu />);

    await user.click(screen.getByRole("button", { name: /导出/ }));
    const teacherButtons = screen.getAllByRole("menuitem", { name: "答案解析" });
    await user.click(teacherButtons[0]);

    expect(mocks.setView).toHaveBeenCalledWith("answers");
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });

  it("switches to preview before printing the questions-only PDF", async () => {
    const user = userEvent.setup();
    render(<ExportMenu />);

    await user.click(screen.getByRole("button", { name: /导出/ }));
    const studentButtons = screen.getAllByRole("menuitem", { name: "仅试题" });
    await user.click(studentButtons[0]);

    expect(mocks.setView).toHaveBeenCalledWith("student");
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });

  it("shows success feedback after JSON export writes a file", async () => {
    mocks.exportJson.mockResolvedValue(true);
    vi.useFakeTimers();
    render(<ExportMenu />);

    fireEvent.click(screen.getByRole("button", { name: /导出/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "JSON 项目" }));
    });

    expect(mocks.exportJson).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("JSON 项目 已导出");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays quiet when a JSON export is cancelled", async () => {
    mocks.exportJson.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ExportMenu />);

    await user.click(screen.getByRole("button", { name: /导出/ }));
    await user.click(screen.getByRole("menuitem", { name: "JSON 项目" }));

    await waitFor(() => expect(mocks.exportJson).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows error feedback when Markdown export fails", async () => {
    mocks.exportMarkdown.mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    render(<ExportMenu />);

    await user.click(screen.getByRole("button", { name: /导出/ }));
    const teacherButtons = screen.getAllByRole("menuitem", { name: "答案解析" });
    await user.click(teacherButtons[1]);

    expect(mocks.exportMarkdown).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Markdown 答案解析 导出失败",
    );
  });

  it("refuses to synthesize audio for an incomplete listening paper", async () => {
    const user = userEvent.setup();
    render(<ExportMenu variant="audio" />);

    await user.click(screen.getByRole("button", { name: /听力/ }));
    await user.click(screen.getByRole("menuitem", { name: /听力 MP3/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "听力部分不完整",
    );
  });

  it("offers direct playback when the paper already has listening audio", async () => {
    mocks.readAudioFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<ExportMenu variant="audio" />);

    await user.click(screen.getByRole("button", { name: /听力/ }));

    expect(
      await screen.findByLabelText("播放已生成听力"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "播放" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "后退 15 秒" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "前进 15 秒" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "听力播放进度" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "播放速度" }),
    ).toHaveValue("1");

    fireEvent.mouseDown(document.body);
    expect(
      screen.getByLabelText("播放已生成听力"),
    ).toBeInTheDocument();
  });
});
