import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SpecialtyTrainingModal } from "../../components/assistant/SpecialtyTrainingModal";

const mocks = vi.hoisted(() => ({
  updateSettings: vi.fn(),
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: (
    selector: (state: {
      config: {
        settings: {
          specialtyTraining: { selectedStages: string[]; focusTopic: string };
        };
      };
      updateSettings: typeof mocks.updateSettings;
    }) => unknown,
  ) =>
    selector({
      config: {
        settings: {
          specialtyTraining: { selectedStages: [], focusTopic: "" },
        },
      },
      updateSettings: mocks.updateSettings,
    }),
}));

describe("SpecialtyTrainingModal", () => {
  beforeEach(() => {
    mocks.updateSettings.mockReset();
  });

  it("starts a multi-section specialty request and remembers it", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<SpecialtyTrainingModal onClose={onClose} onStart={onStart} />);

    await userEvent.click(screen.getByRole("button", { name: "听力 B" }));
    await userEvent.click(
      screen.getByRole("button", { name: "阅读 A · 选词填空" }),
    );
    await userEvent.type(
      screen.getByLabelText("主题或场景（可选）"),
      "校园科技",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "开始生成专项卷" }),
    );

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      specialtyTraining: {
        selectedStages: ["listening-b", "reading-a"],
        focusTopic: "校园科技",
      },
    });
    expect(onStart).toHaveBeenCalledWith({
      mode: "specialty",
      selectedStages: ["listening-b", "reading-a"],
      focusTopic: "校园科技",
    });
  });

  it("requires at least one selected stage", async () => {
    render(<SpecialtyTrainingModal onClose={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "开始生成专项卷" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "请至少选择一个训练板块。",
    );
  });
});
