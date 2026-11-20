import { describe, expect, it } from "vitest";
import {
  assignListeningAudioPaths,
  detectExamDate,
  detectSetRanges,
  setPageText,
} from "../import/realExamSets";

describe("real-exam set detection", () => {
  it("splits a three-set PDF by explicit set labels", () => {
    const pages = Array.from({ length: 27 }, (_, index) => ({
      pageNumber: index + 1,
      text:
        index === 0
          ? "2025年6月大学英语六级考试真题（第一套）"
          : index === 9
            ? "2025年6月大学英语六级考试真题（第二套）"
            : index === 18
              ? "2025年6月大学英语六级考试真题（第三套）"
              : `Page ${index + 1} question content`,
    }));
    expect(detectSetRanges(pages)).toEqual([
      { setLabel: "第一套", pageStart: 1, pageEnd: 9 },
      { setLabel: "第二套", pageStart: 10, pageEnd: 18 },
      { setLabel: "第三套", pageStart: 19, pageEnd: 27 },
    ]);
    expect(detectExamDate(pages[0].text)).toBe("2025-06");
    expect(setPageText(pages, detectSetRanges(pages)[1])).toContain(
      "Page 11 question content",
    );
  });

  it("uses repeated title pages when set labels are damaged by OCR", () => {
    const pages = Array.from({ length: 18 }, (_, index) => ({
      pageNumber: index + 1,
      text:
        index === 0 || index === 9
          ? "2025年12月 College English Test, Band 6"
          : "Question page",
    }));
    expect(detectSetRanges(pages)).toEqual([
      { setLabel: "第一套", pageStart: 1, pageEnd: 9 },
      { setLabel: "第二套", pageStart: 10, pageEnd: 18 },
    ]);
  });

  it("falls back to one range when no boundaries are visible", () => {
    expect(
      detectSetRanges([
        { pageNumber: 1, text: "Question page one" },
        { pageNumber: 2, text: "Question page two" },
      ]),
    ).toEqual([{ setLabel: "真题", pageStart: 1, pageEnd: 2 }]);
  });

  it("assigns two audio files to the first two of three sets", () => {
    expect(
      assignListeningAudioPaths(
        ["第一套", "第二套", "第三套"],
        ["E:\\audio\\2025年6月第一套.mp3", "E:\\audio\\2025年6月第二套.mp3"],
      ),
    ).toEqual([
      "E:\\audio\\2025年6月第一套.mp3",
      "E:\\audio\\2025年6月第二套.mp3",
      "",
    ]);
  });

  it("maps named audio files even when selection order is reversed", () => {
    expect(
      assignListeningAudioPaths(
        ["第一套", "第二套", "第三套"],
        ["E:\\audio\\第2套.mp3", "E:\\audio\\第1套.mp3"],
      ),
    ).toEqual([
      "E:\\audio\\第1套.mp3",
      "E:\\audio\\第2套.mp3",
      "",
    ]);
  });
});
