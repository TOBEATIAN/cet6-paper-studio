import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import "../../i18n";
import { MarkdownFormatProvider } from "../../components/layout/MarkdownFormatContext";
import { QuestionBlock } from "../../components/paper/QuestionBlock";
import { usePracticeStore } from "../../stores/practiceStore";
import * as storage from "../storage/tauri";
import type {
  CalculationQuestion,
  EssayQuestion,
  FillInBlankQuestion,
  SingleChoiceQuestion,
} from "../types/exam";

const editQuestion = vi.fn();

vi.mock("../../stores/paperStore", () => ({
  usePaperStore: () => ({
    reorder: vi.fn(),
    deleteQuestion: vi.fn(),
    editQuestion,
  }),
}));

vi.mock("../../stores/assistantStore", () => ({
  useAssistantStore: () => vi.fn(),
}));

vi.mock("../../stores/configStore", () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      dataDir: "C:\\papers",
      activeConfig: () => ({
        id: "vision",
        baseUrl: "https://example.test/v1",
        model: "vision-model",
      }),
    }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../storage/tauri", () => ({
  getApiKey: vi.fn(),
  extractImagesWithAi: vi.fn(),
}));

describe("QuestionBlock", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePracticeStore.getState().load(null);
    vi.mocked(open).mockReset();
    vi.mocked(storage.getApiKey).mockReset();
    vi.mocked(storage.extractImagesWithAi).mockReset();
  });

  function renderQuestion(
    question:
      | SingleChoiceQuestion
      | CalculationQuestion
      | FillInBlankQuestion
      | EssayQuestion,
    studentView = false,
    analysisView = false,
  ) {
    return render(
      <MarkdownFormatProvider>
        <QuestionBlock
          question={question}
          index={0}
          studentView={studentView}
          analysisView={analysisView}
          onEdit={vi.fn()}
        />
      </MarkdownFormatProvider>,
    );
  }

  it("hides the spoken listening stem on paper and shows it in answer analysis", () => {
    const question: SingleChoiceQuestion = {
      id: "listening-stem",
      type: "single-choice",
      content: "Why does the woman reject the first proposal?",
      options: [
        "It exceeds the budget",
        "It starts too late",
        "It lacks staff",
        "It ignores students",
      ],
      correctAnswer: 0,
      score: 7.1,
      examSection: {
        kind: "cet-listening-a",
        groupId: "conversation-1",
        questionNumber: 1,
      },
    };

    const { rerender } = renderQuestion(question);
    expect(
      screen.queryByText("Why does the woman reject the first proposal?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("It exceeds the budget")).toBeInTheDocument();

    rerender(
      <MarkdownFormatProvider>
        <QuestionBlock
          question={question}
          index={0}
          studentView={false}
          analysisView
          onEdit={vi.fn()}
        />
      </MarkdownFormatProvider>,
    );
    expect(
      screen.getByText("Why does the woman reject the first proposal?"),
    ).toBeInTheDocument();
  });

  it("keeps the question note in normal flow so it cannot cover prompt text", () => {
    usePracticeStore.getState().load("paper-1");
    usePracticeStore.getState().setPracticeMode(true);
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "A deliberately long question prompt that must remain fully readable.",
      options: ["A", "B", "C", "D"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);
    const notePlacement = container.querySelector<HTMLElement>(
      '[data-practice-note-placement="inline"]',
    );
    const content = container.querySelector<HTMLElement>(
      '[data-markdown-source-key="content:q1"]',
    );

    expect(notePlacement).toBeInTheDocument();
    expect(notePlacement).toHaveClass("float-right");
    expect(notePlacement).not.toHaveClass("absolute");
    expect(notePlacement).not.toContainElement(content);
    expect(content).toHaveTextContent(
      "A deliberately long question prompt that must remain fully readable.",
    );
    expect(content?.nextElementSibling).toHaveClass("clear-both");
  });

  it("renders Markdown in options and expandable answer sections", async () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "Choose **one**",
      options: ["Plain", "**Bold** option with $x^2$"],
      correctAnswer: 1,
      explanation: "Because **bold** uses Markdown.",
      score: 5,
    };

    const { container } = renderQuestion(question);

    expect(container.querySelector("strong")?.textContent).toBe("one");
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(container.querySelector(".answer-block")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "查看答案解析" }),
    );
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(container).toHaveTextContent("Because bold uses Markdown.");
    expect(container.querySelector(".answer-block")).toBeInTheDocument();
  });

  it("renders italic Markdown in question content", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "*choose* one",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);

    expect(container.querySelector("em")?.textContent).toBe("choose");
  });

  it("renders bold italic Markdown in question content", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "***choose*** one",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);

    expect(container.querySelector("em strong")?.textContent).toBe("choose");
  });

  it("renders custom underline syntax without raw HTML", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "Mark ++important++ text, ++x++, and <u>raw</u> text",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);

    expect([...container.querySelectorAll("u")].map((node) => node.textContent))
      .toEqual(["important", "x"]);
    expect(container).toHaveTextContent("<u>raw</u>");
  });

  it("renders custom text color and highlight syntax without raw HTML", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "Mark {{color:red|important}} and {{mark:yellow|review}} text",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);

    expect(container.querySelector("span[style*='color']"))
      .toHaveTextContent("important");
    expect(container.querySelector("mark")).toHaveTextContent("review");
    expect(container).not.toHaveTextContent("{{color:red|");
    expect(container).not.toHaveTextContent("{{mark:yellow|");
  });

  it("renders nested custom text color and highlight syntax", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "{{color:red|{{mark:yellow|important}}}}",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 5,
    };

    const { container } = renderQuestion(question);

    const colored = container.querySelector("span[style*='color']");
    expect(colored).toHaveTextContent("important");
    expect(colored?.querySelector("mark")).toHaveTextContent("important");
    expect(container).not.toHaveTextContent("{{mark:yellow|");
  });

  it("renders embedded line options as an aligned option list", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: [
        "下列物质中，属于弱电解质的是（）",
        "A. HCl",
        "B. NaOH",
        "C. CH3COOH",
        "D. NaCl",
      ].join("\n"),
      options: ["HCl", "NaOH", "CH3COOH", "NaCl"],
      correctAnswer: 2,
      score: 4,
    };

    const { container } = renderQuestion(question);

    expect(container).toHaveTextContent("下列物质中，属于弱电解质的是（）");
    expect(container.querySelectorAll("ol li")).toHaveLength(4);
    expect(container.querySelector("ol")).toHaveClass("grid");
  });

  it("renders embedded inline options as an aligned option list", () => {
    const question: SingleChoiceQuestion = {
      id: "q1",
      type: "single-choice",
      content: "鸦片战争后，中国被迫开放的第一批通商口岸中，位于最北端的是？ A. 广州 B. 厦门 C. 上海 D. 宁波",
      options: ["广州", "厦门", "上海", "宁波"],
      correctAnswer: 2,
      score: 2,
    };

    const { container } = renderQuestion(question);

    expect(container).toHaveTextContent(
      "鸦片战争后，中国被迫开放的第一批通商口岸中，位于最北端的是？",
    );
    expect(container.querySelectorAll("ol li")).toHaveLength(4);
    expect(container.querySelector("ol")).toHaveClass("grid");
  });

  it("does not duplicate grouped English passages inside each question block", () => {
    const question: SingleChoiceQuestion = {
      id: "read-1",
      type: "single-choice",
      content: "What does Tom like?",
      options: ["Books", "Sports"],
      correctAnswer: 0,
      score: 4,
      examSection: {
        kind: "english-reading",
        groupId: "reading-a",
        passage: "Tom likes books.",
      },
    };

    const { container } = renderQuestion(question);

    expect(container).toHaveTextContent("What does Tom like?");
    expect(container).not.toHaveTextContent("Tom likes books.");
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("renders calculation solution in an expandable section and hides it in student view", async () => {
    const question: CalculationQuestion = {
      id: "q2",
      type: "calculation",
      content: "Compute $1 + 1$",
      solution: "1. Add the terms\n2. Result is **2**",
      answer: "$2$",
      explanation: "Simple arithmetic.",
      score: 6,
    };

    const { rerender } = renderQuestion(question);

    await userEvent.click(
      screen.getByRole("button", { name: "查看答案解析" }),
    );
    expect(screen.getByText((content) => content.includes("解题步骤")))
      .toBeInTheDocument();
    expect(screen.getByText("Add the terms")).toBeInTheDocument();
    expect(screen.getByText("Simple arithmetic.")).toBeInTheDocument();

    rerender(
      <MarkdownFormatProvider>
        <QuestionBlock
          question={question}
          index={0}
          studentView={true}
          onEdit={vi.fn()}
        />
      </MarkdownFormatProvider>,
    );

    expect(screen.queryByText((content) => content.includes("解题步骤")))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Add the terms")).not.toBeInTheDocument();
    expect(screen.queryByText("Simple arithmetic.")).not.toBeInTheDocument();
  });

  it("renders longer fill-in blank lines in student view", () => {
    const question: FillInBlankQuestion = {
      id: "q3",
      type: "fill-in-blank",
      content: "水的化学式是 ___。",
      blanks: ["H2O"],
      score: 4,
    };

    const { container } = renderQuestion(question, true);

    expect(container).toHaveTextContent("水的化学式是 __________。");
  });

  it("adds student answer space for essays", () => {
    const question: EssayQuestion = {
      id: "q4",
      type: "essay",
      content: "请论述水循环的意义。",
      scoringCriteria: "观点明确，论证充分。",
      score: 20,
    };

    const { container } = renderQuestion(question, true);
    const answerSpace = container.querySelector(".answer-space");

    expect(answerSpace).toBeInTheDocument();
    expect(answerSpace?.className).not.toContain("border");
    expect(answerSpace?.className).not.toContain("dashed");
    expect(container.querySelector(".answer-block")).not.toBeInTheDocument();
  });

  it("imports a photographed writing response in practice mode", async () => {
    const question: EssayQuestion = {
      id: "essay-image",
      type: "essay",
      content: "Write an essay.",
      scoringCriteria: "Clear structure.",
      score: 15,
      examSection: {
        kind: "cet-writing",
        groupId: "writing",
      },
    };
    vi.mocked(open).mockResolvedValue("C:\\papers\\essay.jpg");
    vi.mocked(storage.getApiKey).mockResolvedValue("test-key");
    vi.mocked(storage.extractImagesWithAi).mockResolvedValue(
      "A photographed essay response.",
    );
    usePracticeStore.getState().load("image-practice");
    usePracticeStore.getState().setPracticeMode(true);

    renderQuestion(question);
    await userEvent.click(
      screen.getByRole("button", { name: "识别作答图片" }),
    );

    await waitFor(() =>
      expect(usePracticeStore.getState().writingAnswer).toBe(
        "A photographed essay response.",
      ),
    );
    expect(screen.getByText("图片文字已识别，请核对后再提交。"))
      .toBeInTheDocument();
    expect(storage.extractImagesWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "vision-model",
        imagePaths: ["C:\\papers\\essay.jpg"],
      }),
    );
  });

  it("only answers from the letter while the highlighter mode is active", async () => {
    const question: SingleChoiceQuestion = {
      id: "highlight-choice",
      type: "single-choice",
      content: "Choose one.",
      options: ["First option", "Second option"],
      correctAnswer: 0,
      score: 5,
    };
    usePracticeStore.getState().load("highlight-practice");
    usePracticeStore.getState().setPracticeMode(true);
    usePracticeStore.getState().setInteractionMode("highlight");

    renderQuestion(question);

    await userEvent.click(screen.getByText("First option"));
    expect(
      usePracticeStore.getState().answers["highlight-choice"],
    ).toBeUndefined();

    await userEvent.click(
      screen.getByRole("radio", { name: "A. First option" }),
    );
    expect(usePracticeStore.getState().answers["highlight-choice"]).toBe("A");
  });

  it("stores an independent note for an option", async () => {
    const question: SingleChoiceQuestion = {
      id: "note-choice",
      type: "single-choice",
      content: "Choose one.",
      options: ["First option", "Second option"],
      correctAnswer: 0,
      score: 5,
    };
    usePracticeStore.getState().load("note-practice");
    usePracticeStore.getState().setPracticeMode(true);

    renderQuestion(question);
    await userEvent.click(
      screen.getByRole("button", { name: "批注：A. First option" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "批注内容：A. First option" }),
      "n. 名词",
    );

    expect(usePracticeStore.getState().notes).toMatchObject({
      "option:note-choice:0": "n. 名词",
    });
  });
});
