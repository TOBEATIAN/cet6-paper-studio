import { describe, expect, it } from "vitest";
import { parseReviewImport } from "../review/import";

describe("review import", () => {
  it("extracts objective answers and named writing/translation sections", () => {
    const result = parseReviewImport(
      [
        "1 A",
        "2 C",
        "Part I Writing",
        "Learning to manage money matters.",
        "Part IV Translation",
        "Sugar painting is a traditional craft.",
      ].join("\n"),
    );

    expect(result).toEqual({
      answers: { "1": "A", "2": "C" },
      writingAnswer: "Learning to manage money matters.",
      translationAnswer: "Sugar painting is a traditional craft.",
    });
  });

  it("imports a plain essay into an explicitly selected writing target", () => {
    expect(
      parseReviewImport("My essay text without a heading.", "writing"),
    ).toEqual({
      answers: {},
      writingAnswer: "My essay text without a heading.",
      translationAnswer: "",
    });
  });

  it("imports structured review JSON", () => {
    const result = parseReviewImport(
      JSON.stringify({
        answers: { "3": "b" },
        writingAnswer: "Essay",
        translationAnswer: "Translation",
      }),
    );

    expect(result).toEqual({
      answers: { "3": "B" },
      writingAnswer: "Essay",
      translationAnswer: "Translation",
    });
  });

  it("rejects empty sections instead of creating a blank review", () => {
    expect(parseReviewImport("Part I Writing\nPart IV Translation")).toBeNull();
  });
});
