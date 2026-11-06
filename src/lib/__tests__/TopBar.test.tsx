import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ActionBar } from "../../components/layout/ActionBar";

const mocks = vi.hoisted(() => ({
  setTitle: vi.fn(),
  newPaper: vi.fn(),
  setPracticeMode: vi.fn(),
}));

let practiceMode = false;

vi.mock("../../components/layout/ExportMenu", () => ({
  ExportMenu: () => <button type="button">导出</button>,
}));

vi.mock("../../stores/paperStore", () => ({
  usePaperStore: (selector: (state: unknown) => unknown) =>
    selector({
      paper: {
        title: "测试卷",
        questions: [{ id: "q1" }],
      },
      setTitle: mocks.setTitle,
      saveStatus: "saved",
      newPaper: mocks.newPaper,
    }),
}));

vi.mock("../../stores/practiceStore", () => ({
  usePracticeStore: (selector: (state: unknown) => unknown) =>
    selector({
      practiceMode,
      setPracticeMode: mocks.setPracticeMode,
    }),
}));

describe("ActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    practiceMode = false;
  });

  it("uses a single paper workspace with practice and support actions", async () => {
    const user = userEvent.setup();
    const onOpenDonate = vi.fn();
    render(
      <ActionBar
        onOpenSettings={vi.fn()}
        onOpenPaperManager={vi.fn()}
        onQuickGenerate={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenQuality={vi.fn()}
        onOpenDonate={onOpenDonate}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "视图模式" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "做题" }));
    expect(mocks.setPracticeMode).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "支持作者" }));
    expect(onOpenDonate).toHaveBeenCalled();
  });
});
