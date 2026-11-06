import {
  PAPER_HEADER_FONT_SIZE_STYLES,
  PAPER_FONT_SIZE_STYLES,
  PAPER_LINE_HEIGHT_STYLES,
  PAPER_MARGIN_STYLES,
  PAPER_SIZE_STYLES,
  type AppSettings,
} from "../types/config";
import type { ExamPaper, Question } from "../types/exam";
import {
  questionRangeText,
  splitPassageParagraphs,
} from "./cetReadingLayout";
import {
  groupQuestionsByType,
  type PaperQuestionSection,
} from "./paperSections";

export type PaperLayoutBlock =
  | { kind: "title"; id: string; title: string; estimatedHeightMm: number }
  | { kind: "exam-info"; id: string; estimatedHeightMm: number }
  | {
      kind: "answer-summary";
      id: string;
      questions: Question[];
      estimatedHeightMm: number;
    }
  | {
      kind: "section";
      id: string;
      section: PaperQuestionSection;
      estimatedHeightMm: number;
    }
  | {
      kind: "question";
      id: string;
      question: Question;
      number: number;
      estimatedHeightMm: number;
    }
  | {
      kind: "reading-passage";
      id: string;
      text: string;
      sectionKind: "cet-reading-a" | "cet-reading-b" | "cet-reading-c";
      partTitle?: string;
      questionRange?: string;
      estimatedHeightMm: number;
    }
  | {
      kind: "word-bank";
      id: string;
      words: string[];
      estimatedHeightMm: number;
    }
  | {
      kind: "group-heading";
      id: string;
      title: string;
      questionRange: string;
      estimatedHeightMm: number;
    }
  | {
      kind: "reading-statements";
      id: string;
      questions: Question[];
      estimatedHeightMm: number;
    };

export interface PaperPage {
  id: string;
  blocks: PaperLayoutBlock[];
}

export type BlockHeightMap = Record<string, number>;

export interface PageMetrics {
  width: string;
  height: string;
  padding: string;
  pageSize: string;
  contentHeightMm: number;
}

const PT_TO_MM = 0.352778;
const PX_TO_MM = 0.264583;
const QUESTION_GAP_MM = 2 * PX_TO_MM;
const PASSAGE_GAP_MM = 6 * PX_TO_MM;
const HEADING_GAP_MM = 4 * PX_TO_MM;
const PAPER_HEADER_VERTICAL_CHROME_MM = 8;
const PAPER_FOOTER_HEIGHT_MM = 10;

export function getPageMetrics(settings: AppSettings): PageMetrics {
  const size = PAPER_SIZE_STYLES[settings.paperSize];
  const margin = PAPER_MARGIN_STYLES[settings.paperMargin];
  const isLandscape = settings.paperOrientation === "landscape";
  const widthMm = isLandscape ? size.heightMm : size.widthMm;
  const heightMm = isLandscape ? size.widthMm : size.heightMm;
  const headerHeightMm = settings.paperHeader.trim()
    ? headerHeightMmForSettings(settings)
    : 0;
  const footerHeightMm = PAPER_FOOTER_HEIGHT_MM;
  return {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
    padding: `${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm`,
    pageSize: `${widthMm}mm ${heightMm}mm`,
    contentHeightMm: Math.max(
      40,
      heightMm - margin.top - margin.bottom - headerHeightMm - footerHeightMm,
    ),
  };
}

export function buildPaperBlocks(
  paper: ExamPaper,
  settings: AppSettings,
  includeAnswers: boolean,
  includeAnswerSummary = false,
): PaperLayoutBlock[] {
  const blocks: PaperLayoutBlock[] = [];
  if ((paper.title ?? "").trim()) {
    blocks.push({
      kind: "title",
      id: "title",
      title: paper.title,
      estimatedHeightMm: 18,
    });
  }
  if (paper.questions.length > 0) {
    blocks.push({
      kind: "exam-info",
      id: "exam-info",
      estimatedHeightMm: 15,
    });
  }
  if (includeAnswerSummary && paper.questions.length > 0) {
    blocks.push({
      kind: "answer-summary",
      id: "answer-summary",
      questions: paper.questions.filter(
        (question) =>
          question.type === "single-choice" &&
          question.examSection?.questionNumber != null,
      ),
      estimatedHeightMm: 35,
    });
  }

  for (const section of groupQuestionsByType(paper)) {
    blocks.push({
      kind: "section",
      id: `section-${section.key}`,
      section,
      estimatedHeightMm: 12,
    });

    if (section.kind === "cet-reading-a") {
      const passage = section.questions
        .map((question) => question.examSection?.passage?.trim())
        .find((value): value is string => Boolean(value));
      if (passage) {
        appendReadingPassageBlocks(
          blocks,
          section,
          passage,
          "cet-reading-a",
          "banked-cloze",
          settings,
        );
      }
      if (section.optionBank?.length) {
        blocks.push({
          kind: "word-bank",
          id: `word-bank-${section.key}`,
          words: section.optionBank,
          estimatedHeightMm: 52,
        });
      }
      continue;
    }

    if (section.kind === "cet-reading-b") {
      const passage = section.questions
        .map((question) => question.examSection?.passage?.trim())
        .find((value): value is string => Boolean(value));
      if (passage) {
        appendReadingPassageBlocks(
          blocks,
          section,
          passage,
          "cet-reading-b",
          "matching",
          settings,
        );
      }
      appendQuestionBlocks(blocks, section.questions, settings, includeAnswers);
      continue;
    }

    if (section.kind === "cet-reading-c") {
      const groups = new Map<string, Question[]>();
      let currentGroupId = "passage-group-1";
      for (const question of section.questions) {
        currentGroupId = question.examSection?.groupId ?? currentGroupId;
        const group = groups.get(currentGroupId) ?? [];
        group.push(question);
        groups.set(currentGroupId, group);
      }

      Array.from(groups.entries()).forEach(([groupId, questions], groupIndex) => {
        const passage = questions
          .map((question) => question.examSection?.passage?.trim())
          .find((value): value is string => Boolean(value));
        if (passage) {
          const numbers = questions
            .map((question) => question.examSection?.questionNumber)
            .filter((number): number is number => number != null);
          appendReadingPassageBlocks(
            blocks,
            section,
            passage,
            "cet-reading-c",
            groupId,
            settings,
            groupIndex === 0
              ? "Passage One"
              : groupIndex === 1
                ? "Passage Two"
                : `Passage ${groupIndex + 1}`,
            questionRangeText(numbers),
          );
        }
        appendQuestionBlocks(blocks, questions, settings, includeAnswers);
      });
      continue;
    }

    const listeningKind = section.kind;
    if (listeningKind?.startsWith("cet-listening-")) {
      const groups = groupByQuestionGroup(section.questions);
      groups.forEach(([groupId, questions], groupIndex) => {
        const numbers = questionNumbers(questions);
        blocks.push({
          kind: "group-heading",
          id: `group-heading-${section.key}-${groupId}`,
          title: listeningGroupTitle(listeningKind, groupIndex),
          questionRange:
            listeningQuestionRange(listeningKind, numbers) ?? "",
          estimatedHeightMm: 12,
        });
        appendQuestionBlocks(blocks, questions, settings, includeAnswers);
      });
      continue;
    }

    section.questions.forEach((question, index) => {
      blocks.push({
        kind: "question",
        id: `question-${question.id}`,
        question,
        number: question.examSection?.questionNumber ?? index + 1,
        estimatedHeightMm: estimateQuestionHeightMm(
          question,
          settings,
          includeAnswers,
        ),
      });
    });
  }

  return blocks;
}

function appendQuestionBlocks(
  blocks: PaperLayoutBlock[],
  questions: readonly Question[],
  settings: AppSettings,
  includeAnswers: boolean,
): void {
  questions.forEach((question, index) => {
    blocks.push({
      kind: "question",
      id: `question-${question.id}`,
      question,
      number: question.examSection?.questionNumber ?? index + 1,
      estimatedHeightMm: estimateQuestionHeightMm(
        question,
        settings,
        includeAnswers,
      ),
    });
  });
}

function groupByQuestionGroup(
  questions: readonly Question[],
): Array<[string, Question[]]> {
  const groups = new Map<string, Question[]>();
  let currentGroupId = "group-1";
  for (const question of questions) {
    currentGroupId = question.examSection?.groupId ?? currentGroupId;
    const group = groups.get(currentGroupId) ?? [];
    group.push(question);
    groups.set(currentGroupId, group);
  }
  return Array.from(groups.entries());
}

function questionNumbers(questions: readonly Question[]): number[] {
  return questions
    .map((question) => question.examSection?.questionNumber)
    .filter((number): number is number => number != null);
}

function listeningGroupTitle(kind: string, index: number): string {
  const noun = kind === "cet-listening-a"
    ? "Conversation"
    : kind === "cet-listening-b"
      ? "Passage"
      : "Recording";
  return `${noun} ${englishOrdinal(index + 1)}`;
}

function listeningQuestionRange(
  kind: string,
  numbers: readonly number[],
): string | undefined {
  if (numbers.length === 0) return undefined;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const subject = kind === "cet-listening-a"
    ? "conversation"
    : kind === "cet-listening-b"
      ? "passage"
      : "recording";
  const range =
    first === last ? `Question ${first}` : `Questions ${first} to ${last}`;
  return `${range} are based on the ${subject} you have just heard.`;
}

function englishOrdinal(value: number): string {
  return ["One", "Two", "Three", "Four", "Five"][value - 1] ?? String(value);
}

function appendReadingPassageBlocks(
  blocks: PaperLayoutBlock[],
  section: PaperQuestionSection,
  passage: string,
  sectionKind: "cet-reading-a" | "cet-reading-b" | "cet-reading-c",
  groupKey: string,
  settings: AppSettings,
  partTitle?: string,
  questionRange?: string,
): void {
  splitPassageParagraphs(passage).forEach((text, index) => {
    blocks.push({
      kind: "reading-passage",
      id: `reading-passage-${section.key}-${groupKey}-${index + 1}`,
      text,
      sectionKind,
      ...(index === 0 && partTitle ? { partTitle } : {}),
      ...(index === 0 && questionRange ? { questionRange } : {}),
      estimatedHeightMm: Math.ceil(
        (1 + estimateTextLines(text)) * fontLineHeightMm(settings) + 4,
      ),
    });
  });
}

export function paginateBlocks(
  blocks: PaperLayoutBlock[],
  contentHeightMm: number,
  blockGapMm = 0,
): PaperPage[] {
  return paginateMeasuredBlocks(
    blocks,
    contentHeightMm,
    Object.fromEntries(
      blocks.map((block) => [block.id, Math.max(1, block.estimatedHeightMm)]),
    ),
    blockGapMm,
  );
}

export function paginateMeasuredBlocks(
  blocks: PaperLayoutBlock[],
  contentHeightMm: number,
  heights: BlockHeightMap,
  blockGapMm = 0,
): PaperPage[] {
  if (blocks.length === 0) return [];

  const pages: PaperPage[] = [];
  let current: PaperLayoutBlock[] = [];
  let used = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const height = blockHeight(block, heights);
    const next = blocks[index + 1];
    const previous = current[current.length - 1];
    const incomingGapBeforeBreak =
      previous != null
        ? effectiveBlockGapMm(previous, block, blockGapMm)
        : 0;
    const headingWithFirstFollowing =
      (block.kind === "section" || block.kind === "group-heading") &&
      (next?.kind === "question" ||
        next?.kind === "reading-passage")
        ? height +
          effectiveBlockGapMm(block, next, blockGapMm) +
          blockHeight(next, heights)
        : height;
    const followsCurrentHeading =
      (block.kind === "question" ||
        block.kind === "reading-passage") &&
      current.length === 1 &&
      (current[0].kind === "section" || current[0].kind === "group-heading");
    const isOversized = height > contentHeightMm;
    const shouldStartNewPage =
      current.length > 0 &&
      used + incomingGapBeforeBreak + headingWithFirstFollowing >
        contentHeightMm + 1 &&
      !isOversized &&
      !followsCurrentHeading;

    if (shouldStartNewPage) {
      pages.push({ id: `page-${pages.length + 1}`, blocks: current });
      current = [];
      used = 0;
    }

    const currentPrevious = current[current.length - 1];
    const incomingGap =
      currentPrevious != null
        ? effectiveBlockGapMm(currentPrevious, block, blockGapMm)
        : 0;
    current.push(block);
    used += incomingGap + height;
  }

  if (current.length > 0) {
    pages.push({ id: `page-${pages.length + 1}`, blocks: current });
  }

  return pages;
}

function effectiveBlockGapMm(
  previous: PaperLayoutBlock,
  next: PaperLayoutBlock,
  fallbackGapMm: number,
): number {
  if (previous.kind === "question" && next.kind === "question") {
    return QUESTION_GAP_MM;
  }
  if (
    previous.kind === "reading-passage" &&
    next.kind === "reading-passage"
  ) {
    return PASSAGE_GAP_MM;
  }
  if (
    (previous.kind === "group-heading" ||
      previous.kind === "section") &&
    next.kind === "question"
  ) {
    return HEADING_GAP_MM;
  }
  if (
    (previous.kind === "section" && next.kind === "reading-passage") ||
    (previous.kind === "reading-passage" && next.kind === "word-bank") ||
    (previous.kind === "reading-passage" && next.kind === "question")
  ) {
    return HEADING_GAP_MM;
  }
  return fallbackGapMm;
}

export function buildPaperPages(
  paper: ExamPaper,
  settings: AppSettings,
  includeAnswers: boolean,
  blockGapMm = 0,
  includeAnswerSummary = false,
): PaperPage[] {
  const metrics = getPageMetrics(settings);
  return paginateBlocks(
    buildPaperBlocks(paper, settings, includeAnswers, includeAnswerSummary),
    metrics.contentHeightMm,
    blockGapMm,
  );
}

export function studentAnswerSpaceLines(question: Question): number {
  // CET-6 answer sheets own writing/translation space. The printed paper should
  // not reserve additional blank lines that push Part II onto another page.
  if (question.examSection?.kind?.startsWith("cet-")) return 0;

  switch (question.type) {
    case "essay":
      return clamp(Math.ceil(question.score / 4) + 4, 6, 14);
    case "short-answer":
      return clamp(Math.ceil(question.score / 5) + 2, 3, 7);
    case "calculation":
      return clamp(Math.ceil(question.score / 5) + 3, 4, 9);
    default:
      return 0;
  }
}

export function studentBlankUnderlineLength(question: Question): number {
  if (question.type !== "fill-in-blank") return 0;
  const count = Array.isArray(question.blanks) ? question.blanks.length : 1;
  if (count >= 3 || question.content.length > 80) return 18;
  if (count === 2 || question.content.length > 40) return 14;
  return 10;
}

function estimateQuestionHeightMm(
  question: Question,
  settings: AppSettings,
  includeAnswers: boolean,
): number {
  const lineHeightMm = fontLineHeightMm(settings);
  let lines = 2 + estimateTextLines(question.content);

  if ("options" in question && !question.examSection?.hideOptions) {
    const options = Array.isArray(question.options) ? question.options : [];
    lines += options.reduce(
      (sum, option) => sum + Math.max(1, estimateTextLines(option)),
      0,
    );
  }

  if (includeAnswers) {
    lines += estimateTeacherAnswerLines(question);
  } else {
    lines += studentAnswerSpaceLines(question);
  }

  return Math.ceil(lines * lineHeightMm + 4);
}

function estimateTeacherAnswerLines(question: Question): number {
  const explanation =
    "explanation" in question && question.explanation
      ? estimateTextLines(question.explanation)
      : 0;
  switch (question.type) {
    case "single-choice":
    case "multiple-choice":
    case "true-false":
    case "fill-in-blank":
      return explanation ? 2 + explanation : 1;
    case "short-answer":
      return (
        2 +
        estimateTextLines(question.referenceAnswer) +
        (question.scoringPoints?.length ?? 0) +
        explanation
      );
    case "essay":
      return 2 + estimateTextLines(question.scoringCriteria) + explanation;
    case "calculation":
      return (
        3 +
        estimateTextLines(question.answer) +
        estimateTextLines(question.solution) +
        explanation
      );
  }
}

function estimateTextLines(text: string | undefined): number {
  const lines = (text ?? "").split(/\r?\n/);
  return lines.reduce((sum, line) => {
    const trimmed = line.trim();
    if (!trimmed) return sum + 1;
    return sum + Math.max(1, Math.ceil(trimmed.length / 34));
  }, 0);
}

function fontLineHeightMm(settings: AppSettings): number {
  const fontSizePt = parseFloat(PAPER_FONT_SIZE_STYLES[settings.paperFontSize]);
  return fontSizePt * PT_TO_MM * PAPER_LINE_HEIGHT_STYLES[settings.paperLineHeight];
}

function headerHeightMmForSettings(settings: AppSettings): number {
  const fontSizePt = parseFloat(
    PAPER_HEADER_FONT_SIZE_STYLES[settings.paperHeaderFontSize],
  );
  return Math.ceil(fontSizePt * PT_TO_MM + PAPER_HEADER_VERTICAL_CHROME_MM);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function blockHeight(block: PaperLayoutBlock, heights: BlockHeightMap): number {
  return Math.max(1, heights[block.id] ?? block.estimatedHeightMm);
}
