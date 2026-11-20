import type { ImportSetRange } from "../types/import";

interface TextPage {
  pageNumber: number;
  text: string;
}

const SET_LABEL_RE =
  /第\s*([一二三123])\s*套|set\s*([123])|试卷\s*([一二三123])/gi;
const TITLE_START_RE = /大学英语六级考试真题|College English Test/i;

export function detectSetRanges(pages: readonly TextPage[]): ImportSetRange[] {
  if (pages.length === 0) return [];
  const labelled = new Map<string, number>();
  for (const page of pages) {
    for (const match of page.text.matchAll(SET_LABEL_RE)) {
      const label = normalizeSetNumber(match[1] ?? match[2] ?? match[3] ?? "");
      if (label && !labelled.has(label)) labelled.set(label, page.pageNumber);
    }
  }

  if (labelled.size > 0) {
    return rangesFromStarts(
      [...labelled.entries()]
        .map(([setLabel, pageStart]) => ({ setLabel, pageStart }))
        .sort((left, right) => left.pageStart - right.pageStart),
      pages[pages.length - 1].pageNumber,
    );
  }

  const titleStarts = pages
    .filter((page) => TITLE_START_RE.test(page.text))
    .map((page) => page.pageNumber);
  if (titleStarts.length > 1) {
    return rangesFromStarts(
      titleStarts.map((pageStart, index) => ({
        setLabel: `第${numberLabel(index + 1)}套`,
        pageStart,
      })),
      pages[pages.length - 1].pageNumber,
    );
  }

  return [
    {
      setLabel: "真题",
      pageStart: pages[0].pageNumber,
      pageEnd: pages[pages.length - 1].pageNumber,
    },
  ];
}

export function setPageText(
  pages: readonly TextPage[],
  range: ImportSetRange,
): string {
  return pages
    .filter(
      (page) =>
        page.pageNumber >= range.pageStart &&
        page.pageNumber <= range.pageEnd,
    )
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
    .join("\n\n");
}

export function detectExamDate(text: string): string {
  const match = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
}

export function assignListeningAudioPaths(
  setLabels: readonly string[],
  audioPaths: readonly string[],
): string[] {
  if (setLabels.length === 0) return [];
  if (audioPaths.length === 0) return setLabels.map(() => "");
  if (audioPaths.length === 1) return setLabels.map(() => audioPaths[0]);

  const bySetNumber = new Map<number, string>();
  for (const path of audioPaths) {
    const setNumber = audioSetNumber(path);
    if (setNumber != null && !bySetNumber.has(setNumber)) {
      bySetNumber.set(setNumber, path);
    }
  }
  if (bySetNumber.size > 0) {
    return setLabels.map((label) => {
      const setNumber = setLabelNumber(label);
      return (setNumber != null ? bySetNumber.get(setNumber) : "") ?? "";
    });
  }
  return setLabels.map((_, index) => audioPaths[index] ?? "");
}

function rangesFromStarts(
  starts: Array<{ setLabel: string; pageStart: number }>,
  finalPage: number,
): ImportSetRange[] {
  return starts.map((entry, index) => ({
    setLabel: entry.setLabel,
    pageStart: entry.pageStart,
    pageEnd: starts[index + 1]
      ? starts[index + 1].pageStart - 1
      : finalPage,
  }));
}

function normalizeSetNumber(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized === "1" || normalized === "一") return "第一套";
  if (normalized === "2" || normalized === "二") return "第二套";
  if (normalized === "3" || normalized === "三") return "第三套";
  return "";
}

function numberLabel(value: number): string {
  return ["一", "二", "三", "四", "五"][value - 1] ?? String(value);
}

function audioSetNumber(path: string): number | null {
  const name = path.split(/[\\/]/).pop() ?? path;
  const labelled = name.match(/第\s*([一二三123])\s*套/);
  if (labelled) return normalizedSetNumber(labelled[1]);
  const numbered = name.match(/(?:set|audio|听力|音频)\s*[-_（(]?\s*([123一二三])(?:\D|$)/i);
  return numbered ? normalizedSetNumber(numbered[1]) : null;
}

function setLabelNumber(label: string): number | null {
  const match = label.match(/第\s*([一二三123])\s*套/);
  return match ? normalizedSetNumber(match[1]) : null;
}

function normalizedSetNumber(value: string): number | null {
  if (value === "1" || value === "一") return 1;
  if (value === "2" || value === "二") return 2;
  if (value === "3" || value === "三") return 3;
  return null;
}
