import { describe, expect, it } from "vitest";
import { applyMarkdownFormat } from "../../components/layout/markdownFormat";
import { markdownToPlainText } from "../exam/markdownPlainText";

describe("applyMarkdownFormat", () => {
  it("applies italic to selected inline text", () => {
    const result = applyMarkdownFormat("choose one", 0, 6, "italic");

    expect(result.value).toBe("*choose* one");
  });

  it("keeps selected whitespace outside inline Markdown markers", () => {
    const result = applyMarkdownFormat("choose one", 6, 10, "italic");

    expect(result.value).toBe("choose *one*");
  });

  it("toggles italic off from selected inline text", () => {
    const result = applyMarkdownFormat("*choose* one", 1, 7, "italic");

    expect(result.value).toBe("choose one");
  });

  it("applies heading to the whole selected line", () => {
    const result = applyMarkdownFormat("choose one", 7, 10, "heading");

    expect(result.value).toBe("## choose one");
  });

  it("toggles heading off from inside a rendered heading line", () => {
    const result = applyMarkdownFormat("## choose one", 3, 9, "heading");

    expect(result.value).toBe("choose one");
  });

  it("applies unordered and ordered list markers to the whole selected line", () => {
    expect(applyMarkdownFormat("choose one", 7, 10, "bulletList").value)
      .toBe("- choose one");
    expect(applyMarkdownFormat("choose one", 7, 10, "orderedList").value)
      .toBe("1. choose one");
  });

  it("clears line-level Markdown markers from inside the selected line", () => {
    expect(applyMarkdownFormat("- choose one", 2, 8, "clear").value)
      .toBe("choose one");
    expect(applyMarkdownFormat("1. choose one", 3, 9, "clear").value)
      .toBe("choose one");
    expect(applyMarkdownFormat("> choose one", 2, 8, "clear").value)
      .toBe("choose one");
  });

  it("clears nested bold italic markers", () => {
    const result = applyMarkdownFormat("***choose*** one", 3, 9, "clear");

    expect(result.value).toBe("choose one");
  });

  it("applies text color and highlight markers to selected inline text", () => {
    expect(
      applyMarkdownFormat("choose one", 0, 6, {
        type: "textColor",
        color: "red",
      }).value,
    ).toBe("{{color:red|choose}} one");
    expect(
      applyMarkdownFormat("choose one", 7, 10, {
        type: "highlight",
        color: "yellow",
      }).value,
    ).toBe("choose {{mark:yellow|one}}");
  });

  it("removes text color or highlight markers with automatic choices", () => {
    expect(
      applyMarkdownFormat("{{color:red|choose}} one", 12, 18, {
        type: "textColor",
        color: "auto",
      }).value,
    ).toBe("choose one");
    expect(
      applyMarkdownFormat("choose {{mark:yellow|one}}", 21, 24, {
        type: "highlight",
        color: "none",
      }).value,
    ).toBe("choose one");
  });

  it("clears text color and highlight custom markers", () => {
    const result = applyMarkdownFormat(
      "{{color:blue|choose}} {{mark:yellow|one}}",
      0,
      40,
      "clear",
    );

    expect(result.value).toBe("choose one");
  });

  it("allows highlight to be applied inside colored text", () => {
    const result = applyMarkdownFormat("{{color:red|choose}} one", 12, 18, {
      type: "highlight",
      color: "yellow",
    });

    expect(result.value).toBe("{{color:red|{{mark:yellow|choose}}}} one");
  });

  it("never changes visible prose when adding or erasing inline styles", () => {
    const source =
      "For this part, you are allowed 30 minutes to write an essay that begins with the sentence “Faced with growing public distrust and deepening social divisions, universities and communities must treat civic learning as a shared obligation.”";
    const start = source.indexOf("Faced");
    const end = source.indexOf(".”") + 1;

    const highlighted = applyMarkdownFormat(source, start, end, {
      type: "highlight",
      color: "yellow",
    });
    expect(markdownToPlainText(highlighted.value)).toBe(
      markdownToPlainText(source),
    );

    const erased = applyMarkdownFormat(highlighted.value, 0, highlighted.value.length, {
      type: "highlight",
      color: "none",
    });
    expect(markdownToPlainText(erased.value)).toBe(markdownToPlainText(source));
  });

  it("erases every highlight wrapper covered by one long selection", () => {
    const source =
      "{{mark:yellow|first long phrase}} and {{mark:green|second long phrase}} and {{mark:pink|third phrase}}";
    const result = applyMarkdownFormat(source, 0, source.length, {
      type: "highlight",
      color: "none",
    });

    expect(result.value).toBe("first long phrase and second long phrase and third phrase");
  });
});
