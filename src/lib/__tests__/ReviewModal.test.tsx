import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import "../../i18n";
import { ReviewModal } from "../../components/review/ReviewModal";
import { QualityReportModal } from "../../components/review/QualityReportModal";
import {
  extractImagesWithAi,
  getApiKey,
} from "../storage/tauri";
import type { ExamPaper } from "../types/exam";

let paper: ExamPaper;
const saveReview = vi.fn();
const onClose = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("../../lib/storage/tauri", () => ({
  getApiKey: vi.fn(),
  extractImagesWithAi: vi.fn(),
}));

vi.mock("../../stores/paperStore", () => ({
  usePaperStore: (selector: (state: unknown) => unknown) =>
    selector({
      paper,
      activePaperId: "paper-1",
    }),
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      dataDir: "E:\\tmp",
      activeConfig: () => ({
        id: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-flash",
      }),
    }),
}));

vi.mock("../../stores/reviewStore", () => ({
  useReviewStore: (selector: (state: unknown) => unknown) =>
    selector({
      reviews: [],
      activeReview: null,
      load: vi.fn(),
      save: saveReview,
      open: vi.fn(),
      remove: vi.fn(),
      improve: vi.fn(),
      generateDeepReview: vi.fn(),
      deepReviewError: null,
    }),
}));

function oneQuestionPaper(): ExamPaper {
  return {
    version: 1,
    title: "2026年10月30日六级模拟卷",
    questions: [
      {
        id: "q1",
        type: "single-choice",
        content: "Question one",
        options: ["A", "B", "C", "D"],
        correctAnswer: 1,
        explanation: "故选 B。",
        score: 7.1,
        examSection: {
          kind: "cet-listening-a",
          questionNumber: 1,
        },
      },
    ],
  };
}

function twoQuestionPaper(): ExamPaper {
  const paper = oneQuestionPaper();
  paper.questions.push({
    id: "q2",
    type: "single-choice",
    content: "Question two",
    options: ["A", "B", "C", "D"],
    correctAnswer: 2,
    explanation: "故选 C。",
    score: 7.1,
    examSection: {
      kind: "cet-listening-a",
      questionNumber: 2,
    },
  });
  return paper;
}

function writingTranslationPaper(): ExamPaper {
  const paper = oneQuestionPaper();
  paper.questions.push(
    {
      id: "writing",
      type: "essay",
      content: "Write an essay.",
      writingGuidance: "写作思路",
      scoringCriteria: "评分标准",
      score: 106.5,
      examSection: { kind: "cet-writing" },
    },
    {
      id: "translation",
      type: "short-answer",
      content: "翻译下面一段话。",
      referenceAnswer: "Translate this passage.",
      score: 106.5,
      examSection: { kind: "cet-translation" },
    },
  );
  return paper;
}

describe("ReviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paper = oneQuestionPaper();
  });

  it("treats answers as correct until the user changes a wrong one", async () => {
    render(<ReviewModal onClose={onClose} />);

    const answer = screen.getByLabelText("第 1 题作答") as HTMLSelectElement;
    expect(answer.value).toBe("B");

    await userEvent.selectOptions(answer, "A");

    expect(answer.value).toBe("A");
    expect(screen.getByText("默认全部客观题答对，只需修改错题。当前已标记错题 1 道。"))
      .toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "生成复盘分析" }),
    );
    expect(saveReview).toHaveBeenCalledWith({
      answers: { "1": "A" },
      writingAnswer: "",
      translationAnswer: "",
      reviewNotes: "",
      readingArticleCard: "",
    });
  });

  it("persists only questions explicitly marked wrong", async () => {
    paper = twoQuestionPaper();
    render(<ReviewModal onClose={onClose} />);

    await userEvent.selectOptions(
      screen.getByLabelText("第 2 题作答"),
      "D",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "生成复盘分析" }),
    );

    expect(saveReview).toHaveBeenCalledWith({
      answers: { "2": "D" },
      writingAnswer: "",
      translationAnswer: "",
      reviewNotes: "",
      readingArticleCard: "",
    });
  });

  it("prefills a review from the in-app practice session", async () => {
    paper = writingTranslationPaper();
    render(
      <ReviewModal
        onClose={onClose}
        initialPractice={{
          key: "practice-1",
          answers: { "1": "A" },
          writingAnswer: "Practice essay",
          translationAnswer: "练习译文",
        }}
      />,
    );

    expect(
      (screen.getByLabelText("第 1 题作答") as HTMLSelectElement).value,
    ).toBe("A");
    expect(screen.getByLabelText("写作作答")).toHaveValue("Practice essay");
    expect(screen.getByLabelText("翻译作答")).toHaveValue("练习译文");
  });

  it("sends selected answer images to the configured vision model", async () => {
    paper = writingTranslationPaper();
    vi.mocked(open).mockResolvedValue(["C:\\tmp\\answers.jpg"]);
    vi.mocked(getApiKey).mockResolvedValue("sk-test");
    vi.mocked(extractImagesWithAi).mockResolvedValue("Handwritten essay text.");
    render(<ReviewModal onClose={onClose} />);

    await userEvent.click(
      screen.getByRole("button", { name: "识别写作作答图片" }),
    );

    expect(extractImagesWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        model: "deepseek-flash",
        imagePaths: ["C:\\tmp\\answers.jpg"],
      }),
    );
    expect(screen.getByLabelText("写作作答")).toHaveValue(
      "Handwritten essay text.",
    );
    expect(screen.getByText("图片文字已识别，请核对后再应用。"))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "识别翻译作答图片" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "导入 Word/文本" }),
    ).not.toBeInTheDocument();
  });
});

describe("QualityReportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paper = { version: 1, title: "空卷", questions: [] };
  });

  it("shows a recoverable empty state and closes", async () => {
    render(<QualityReportModal onClose={onClose} />);

    expect(screen.getAllByText("当前试卷没有题目").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(onClose).toHaveBeenCalled();
  });
});
