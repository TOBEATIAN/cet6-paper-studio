import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";
import { NotebookPen, Plus } from "lucide-react";
import { usePaperStore } from "../../stores/paperStore";
import { useConfigStore } from "../../stores/configStore";
import { usePracticeStore } from "../../stores/practiceStore";
import {
  PAPER_FONT_SIZE_STYLES,
  PAPER_HEADER_FONT_SIZE_STYLES,
  PAPER_FONT_STACKS,
  PAPER_LINE_HEIGHT_STYLES,
  PAPER_PREVIEW_FIXED_ZOOM_SCALES,
  isPaperPreviewFixedZoom,
  stepPaperPreviewZoom,
} from "../../lib/types/config";
import type { AppSettings } from "../../lib/types/config";
import type { ExamPaper, Question } from "../../lib/types/exam";
import {
  buildPaperPages,
  buildPaperBlocks,
  getPageMetrics,
  paginateMeasuredBlocks,
  type PageMetrics,
  type PaperLayoutBlock,
  type PaperPage,
} from "../../lib/exam/pagination";
import { primaryBtn, secondaryBtn } from "../../lib/ui/styles";
import { toStudentVersion } from "../../lib/exam/studentVersion";
import { createBlankQuestion } from "../../lib/exam/blankQuestion";
import { createCet6Question } from "../../lib/cet/questionPresets";
import { isCet6Paper } from "../../lib/exam/paperSections";
import {
  formatBankedClozePassage,
  formatReadingBParagraphLabel,
  normalizeWordBank,
} from "../../lib/exam/cetReadingLayout";
import { QuestionBlock } from "./QuestionBlock";
import { QuestionEditModal } from "./QuestionEditModal";
import { ExamInfoHeader } from "./ExamInfoHeader";
import { Markdown } from "./Markdown";
import { PracticeNoteControl } from "../practice/PracticeNoteControl";
import { PracticeHighlights } from "../practice/PracticeHighlights";

const PAPER_BLOCK_SPACING_CLASS = "paper-block-stack";
const PAPER_BLOCK_GAP_MM = pxToMm(12);
const MM_TO_PX = 96 / 25.4;
const AUTO_ZOOM_MIN = 0.35;
const AUTO_ZOOM_MAX = 2;
const AUTO_ZOOM_PADDING_PX = 48;

interface PaperCanvasProps {
  scrollRootRef?: RefObject<HTMLElement | null>;
  onActiveQuestionChange?: (id: string | null) => void;
}

/**
 * Center "sheet": a centered white page that renders the assembled paper. Shows
 * a guided empty state when there are no questions. Honors the teacher/student
 * view toggle by filtering answers for the student preview. Hosts the
 * block-level edit modal and the "add question manually" affordances.
 */
export function PaperCanvas({
  scrollRootRef,
  onActiveQuestionChange,
}: PaperCanvasProps) {
  const { t } = useTranslation();
  const { paper, view, appendQuestion } = usePaperStore();
  const practiceMode = usePracticeStore((state) => state.practiceMode);
  const practiceSubmitted = usePracticeStore((state) => state.submitted);
  const paperSettings = useConfigStore((s) => s.config.settings);
  const updateSettings = useConfigStore((s) => s.updateSettings);
  const display = useMemo(
    () =>
      view === "student"
        ? toStudentVersion(paper)
        : view === "answers"
          ? { ...paper, title: `${paper.title}（答案解析）` }
          : paper,
    [paper, view],
  );
  const questionIds = display.questions.map((question) => question.id).join("|");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newQuestionDraft, setNewQuestionDraft] = useState<Question | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const pageMetrics = getPageMetrics(paperSettings);
  const adaptivePreviewZoom = !isPaperPreviewFixedZoom(
    paperSettings.paperPreviewZoom,
  );
  const scrollRootSize = useElementSize(scrollRootRef, adaptivePreviewZoom);
  const previewScale = previewScaleForSettings(
    paperSettings,
    pageMetrics,
    scrollRootSize,
  );
  const pageFrameStyle = {
    width: `${mmToPx(parseFloat(pageMetrics.width)) * previewScale}px`,
    height: `${mmToPx(parseFloat(pageMetrics.height)) * previewScale}px`,
  };
  const includeAnswers = view !== "student";
  const analysisView = view === "answers";
  const blocks = useMemo(
    () => buildPaperBlocks(display, paperSettings, includeAnswers),
    [display, paperSettings, includeAnswers],
  );
  const estimatedPages = useMemo(
    () =>
      buildPaperPages(
        display,
        paperSettings,
        includeAnswers,
        PAPER_BLOCK_GAP_MM,
        analysisView,
      ),
    [display, paperSettings, includeAnswers, analysisView],
  );
  const blockSignature = useMemo(
    () =>
      [
        view,
        includeAnswers ? "answers" : "student",
        pageMetrics.contentHeightMm,
        paperSettings.paperHeader,
        paperSettings.paperHeaderFontSize,
        paperSettings.paperHeaderAlign,
        paperSettings.paperHeaderFooterLine,
        paperSettings.paperPageNumberStyle,
        practiceMode ? "practice" : "read",
        practiceSubmitted ? "submitted" : "answering",
        blocks.map(blockContentSignature).join("|"),
      ].join("::"),
    [
      blocks,
      includeAnswers,
      pageMetrics.contentHeightMm,
      paperSettings.paperHeader,
      paperSettings.paperHeaderAlign,
      paperSettings.paperHeaderFontSize,
      paperSettings.paperHeaderFooterLine,
      paperSettings.paperPageNumberStyle,
      practiceMode,
      practiceSubmitted,
      view,
    ],
  );
  const [measured, setMeasured] = useState<{
    signature: string;
    pages: PaperPage[];
  } | null>(null);
  const [readySignature, setReadySignature] = useState<string | null>(null);
  const pages =
    measured?.signature === blockSignature ? measured.pages : estimatedPages;
  const printLayoutReady =
    display.questions.length === 0 || readySignature === blockSignature;

  const editing = editingId
    ? (paper.questions.find((q) => q.id === editingId) ?? null)
    : null;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--paper-page-size", pageMetrics.pageSize);
    root.style.setProperty("--paper-page-width", pageMetrics.width);
    root.style.setProperty("--paper-page-height", pageMetrics.height);
  }, [pageMetrics.height, pageMetrics.pageSize, pageMetrics.width]);

  useEffect(() => {
    document.documentElement.dataset.paperPaginationReady = printLayoutReady
      ? "true"
      : "false";
    return () => {
      delete document.documentElement.dataset.paperPaginationReady;
    };
  }, [printLayoutReady]);

  useEffect(() => {
    document.documentElement.dataset.paperPreviewScale =
      previewScale.toFixed(4);
    return () => {
      delete document.documentElement.dataset.paperPreviewScale;
    };
  }, [previewScale]);

  useEffect(() => {
    const root = scrollRootRef?.current ?? null;
    if (!root) return;

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      void updateSettings({
        paperPreviewZoom: stepPaperPreviewZoom(
          paperSettings.paperPreviewZoom,
          direction,
          previewScale,
        ),
      });
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [
    paperSettings.paperPreviewZoom,
    previewScale,
    scrollRootRef,
    updateSettings,
  ]);

  function addAndEdit() {
    setNewQuestionDraft(
      isCet6Paper(paper)
        ? createCet6Question("writing", uuid())
        : createBlankQuestion("single-choice", uuid()),
    );
  }

  useEffect(() => {
    if (blocks.length === 0) {
      setReadySignature(blockSignature);
      return;
    }
    const root = measureRef.current;
    if (!root) return;
    const measureRoot = root;

    let canceled = false;
    let frame = 0;

    function measureLayout() {
      if (canceled) return;
      const contentNode =
        measureRoot.querySelector<HTMLElement>(".paper-page-content");
      const measuredContentHeightMm =
        contentNode && contentNode.clientHeight > 0
          ? Math.max(40, pxToMm(contentNode.clientHeight) - 1)
          : pageMetrics.contentHeightMm;
      const heights: Record<string, number> = {};
      measureRoot
        .querySelectorAll<HTMLElement>("[data-layout-block-id]")
        .forEach((node) => {
          const id = node.dataset.layoutBlockId;
          if (!id) return;
          heights[id] = pxToMm(node.getBoundingClientRect().height);
        });

      if (Object.keys(heights).length !== blocks.length) return;
      const next = paginateMeasuredBlocks(
        blocks,
        measuredContentHeightMm,
        heights,
        PAPER_BLOCK_GAP_MM,
      );
      setMeasured((current) => {
        if (
          current?.signature === blockSignature &&
          samePages(current.pages, next)
        ) {
          return current;
        }
        if (samePages(estimatedPages, next)) return null;
        return { signature: blockSignature, pages: next };
      });
      setReadySignature(blockSignature);
    }

    function scheduleMeasurement() {
      if (canceled) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureLayout);
    }

    scheduleMeasurement();
    void document.fonts?.ready.then(scheduleMeasurement).catch(() => undefined);

    return () => {
      canceled = true;
      window.cancelAnimationFrame(frame);
    };
    // blockSignature already covers every layout-affecting block change.
    // Inline marker wrappers are normalized out, so highlighting must not
    // rebuild the entire paper geometry.
  }, [blockSignature, pageMetrics.contentHeightMm]);

  useEffect(() => {
    if (!onActiveQuestionChange) return;
    if (display.questions.length === 0) {
      onActiveQuestionChange(null);
      return;
    }
    const root = scrollRootRef?.current ?? null;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.questionId;
          if (!id) continue;
          if (entry.isIntersecting) visible.set(id, entry.intersectionRatio);
          else visible.delete(id);
        }

        const next =
          Array.from(visible.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          null;
        onActiveQuestionChange(next);
      },
      {
        root,
        threshold: [0.15, 0.35, 0.6, 0.85],
        rootMargin: "-12% 0px -62% 0px",
      },
    );

    for (const question of display.questions) {
      const node = document.getElementById(`question-${question.id}`);
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [questionIds, onActiveQuestionChange, scrollRootRef]);

  return (
    <div className="paper-canvas flex min-w-full justify-center px-4 py-8 sm:px-6">
      <div className="w-full">
        <PracticeHighlights />
        <div className="paper-preview-zoom-stage w-full">
          <div
            className="paper-page-stack flex flex-wrap items-start justify-center gap-6"
          >
            {display.questions.length === 0 ? (
              <PaperPreviewPage
                pageMetrics={pageMetrics}
                previewScale={previewScale}
                frameStyle={pageFrameStyle}
              >
                <PaperPageShell
                  paperSettings={paperSettings}
                  pageMetrics={pageMetrics}
                  pageNumber={1}
                  totalPages={1}
                footerTitle={display.title}
                >
                  <EmptyPaper t={t} addAndEdit={addAndEdit} />
                </PaperPageShell>
              </PaperPreviewPage>
            ) : (
              pages.map((page, pageIndex) => (
                <PaperPreviewPage
                  key={page.id}
                  pageMetrics={pageMetrics}
                  previewScale={previewScale}
                  frameStyle={pageFrameStyle}
                >
                  <PaperPageShell
                    paperSettings={paperSettings}
                    pageMetrics={pageMetrics}
                    pageNumber={pageIndex + 1}
                    totalPages={pages.length}
                    footerTitle={display.title}
                  >
                    <div className={PAPER_BLOCK_SPACING_CLASS}>
                      {page.blocks.map((block) => (
                        <PaperBlock
                          key={block.id}
                          block={block}
                          display={display}
                          studentView={view === "student"}
                          analysisView={analysisView}
                          onEdit={setEditingId}
                        />
                      ))}
                    </div>
                  </PaperPageShell>
                </PaperPreviewPage>
              ))
            )}
          </div>
        </div>
        {display.questions.length > 0 && (
          <>
            <MeasurementLayer
              refNode={measureRef}
              blocks={blocks}
              display={display}
              studentView={view === "student"}
              analysisView={analysisView}
              paperSettings={paperSettings}
              pageMetrics={pageMetrics}
            />
            {view === "teacher" && (
              <div className="no-print mt-6 border-t border-dashed border-border pt-4 text-center">
                <button
                  type="button"
                  onClick={addAndEdit}
                  className={secondaryBtn}
                >
                  <Plus className="h-4 w-4" />
                  {t("paper.addQuestion")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <QuestionEditModal
          question={editing}
          onClose={() => setEditingId(null)}
        />
      )}
      {newQuestionDraft && (
        <QuestionEditModal
          question={newQuestionDraft}
          onClose={() => setNewQuestionDraft(null)}
          onSave={appendQuestion}
        />
      )}
    </div>
  );
}

interface PaperPreviewPageProps {
  pageMetrics: PageMetrics;
  previewScale: number;
  frameStyle: CSSProperties;
  children: ReactNode;
}

function PaperPreviewPage({
  pageMetrics,
  previewScale,
  frameStyle,
  children,
}: PaperPreviewPageProps) {
  return (
    <div
      className="paper-preview-page-frame relative shrink-0"
      style={frameStyle}
    >
      <div
        className="paper-preview-page absolute left-0 top-0 transition-transform duration-150 ease-out"
        style={{
          width: pageMetrics.width,
          transform: `scale(${previewScale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MeasurementLayer({
  refNode,
  blocks,
  display,
  studentView,
  analysisView,
  paperSettings,
  pageMetrics,
}: {
  refNode: RefObject<HTMLDivElement | null>;
  blocks: PaperLayoutBlock[];
  display: ExamPaper;
  studentView: boolean;
  analysisView: boolean;
  paperSettings: AppSettings;
  pageMetrics: PageMetrics;
}) {
  return (
    <div
      ref={refNode}
      aria-hidden="true"
      className="no-print pointer-events-none fixed left-0 top-0 -z-10 opacity-0"
      style={{ width: pageMetrics.width }}
    >
      <PaperPageShell
        paperSettings={paperSettings}
        pageMetrics={pageMetrics}
        pageNumber={1}
        totalPages={1}
        fixedHeight
      >
        <div className={PAPER_BLOCK_SPACING_CLASS}>
          {blocks.map((block) => (
            <PaperBlock
              key={block.id}
              block={block}
              display={display}
              studentView={studentView}
              analysisView={analysisView}
              onEdit={() => undefined}
              measuring
            />
          ))}
        </div>
      </PaperPageShell>
    </div>
  );
}

interface PaperPageShellProps {
  paperSettings: AppSettings;
  pageMetrics: PageMetrics;
  pageNumber: number;
  totalPages: number;
  footerTitle?: string;
  fixedHeight?: boolean;
  children: ReactNode;
}

function PaperPageShell({
  paperSettings,
  pageMetrics,
  pageNumber,
  totalPages,
  footerTitle,
  fixedHeight = false,
  children,
}: PaperPageShellProps) {
  const header = paperSettings.paperHeader.trim();
  const pageNumberText = formatPageNumber(
    paperSettings.paperPageNumberStyle,
    pageNumber,
    totalPages,
  );
  const headerClassName = [
    "paper-header mb-4 text-muted-foreground",
    paperSettings.paperHeaderFooterLine ? "border-b border-border pb-2" : "",
  ].filter(Boolean).join(" ");
  const footerClassName = [
    "paper-footer mt-4 text-center text-xs text-muted-foreground",
    paperSettings.paperHeaderFooterLine ? "border-t border-border pt-2" : "",
  ].filter(Boolean).join(" ");
  return (
    <section
      className="paper-sheet paper-page flex w-full flex-col rounded-lg bg-card shadow-sm"
      style={{
        fontFamily: PAPER_FONT_STACKS[paperSettings.paperFont],
        fontSize: PAPER_FONT_SIZE_STYLES[paperSettings.paperFontSize],
        lineHeight: PAPER_LINE_HEIGHT_STYLES[paperSettings.paperLineHeight],
        padding: pageMetrics.padding,
        "--paper-page-size": pageMetrics.pageSize,
        "--paper-page-width": pageMetrics.width,
        "--paper-page-height": pageMetrics.height,
        width: pageMetrics.width,
        maxWidth: pageMetrics.width,
        height: fixedHeight ? pageMetrics.height : undefined,
        minHeight: pageMetrics.height,
      } as CSSProperties}
    >
      {header && (
        <div
          className={headerClassName}
          style={{
            fontSize: PAPER_HEADER_FONT_SIZE_STYLES[paperSettings.paperHeaderFontSize],
            textAlign: paperSettings.paperHeaderAlign,
          }}
        >
          {header}
        </div>
      )}
      <div className="paper-page-content min-h-0 flex-1">{children}</div>
      <div className={footerClassName}>
        {footerTitle
          ? `${footerTitle}　${paperFooterPageText(
              paperSettings.paperPageNumberStyle,
              pageNumber,
              totalPages,
            )}`
          : pageNumberText}
      </div>
    </section>
  );
}

function paperFooterPageText(
  _style: AppSettings["paperPageNumberStyle"],
  pageNumber: number,
  totalPages: number,
): string {
  return `第 ${pageNumber} 页　共 ${totalPages} 页`;
}

function formatPageNumber(
  style: AppSettings["paperPageNumberStyle"],
  pageNumber: number,
  totalPages: number,
): string {
  switch (style) {
    case "plain":
      return `${pageNumber}`;
    case "fraction":
      return `${pageNumber} / ${totalPages}`;
    case "zhFraction":
      return `第 ${pageNumber} 页 / 共 ${totalPages} 页`;
    case "zhPage":
      return `第 ${pageNumber} 页`;
  }
}

function PaperBlock({
  block,
  display,
  studentView,
  analysisView,
  onEdit,
  measuring = false,
}: {
  block: PaperLayoutBlock;
  display: ExamPaper;
  studentView: boolean;
  analysisView: boolean;
  onEdit: (id: string) => void;
  measuring?: boolean;
}) {
  const { t } = useTranslation();
  const practiceMode = usePracticeStore((state) => state.practiceMode);
  const practiceAnswers = usePracticeStore((state) => state.answers);
  const practiceSubmitted = usePracticeStore((state) => state.submitted);
  const setPracticeAnswer = usePracticeStore((state) => state.setAnswer);
  const attrs = {
    "data-layout-block-id": block.id,
    "data-layout-block-kind": block.kind,
  };
  switch (block.kind) {
    case "title":
      return (
        <div {...attrs}>
          <h1 className="mb-1 text-center text-[18pt] font-bold text-foreground">
            {block.title}
          </h1>
          {isCet6Paper(display) && (
            <p className="mb-4 text-center text-[9.5pt] text-muted-foreground">
              本卷含听力。满分 710 分，考试时长 130 分钟。非官方 AI 辅助模拟试题。
            </p>
          )}
        </div>
      );
    case "exam-info":
      return (
        <div {...attrs}>
          <ExamInfoHeader paper={display} />
        </div>
      );
    case "answer-summary":
      return (
        <div {...attrs} className="paper-answer-summary">
          <h2 className="text-sm font-bold text-foreground">答案速查</h2>
          <div className="mt-2 grid grid-cols-5 gap-x-5 gap-y-1 text-xs text-foreground">
            {block.questions.map((question) =>
              question.type === "single-choice" ? (
                <span key={question.id}>
                  {question.examSection?.questionNumber}.{" "}
                  {String.fromCharCode(65 + question.correctAnswer)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      );
    case "section":
      {
        const isCetReading = block.section.kind?.startsWith("cet-reading-");
      return (
        <div {...attrs}>
          <h2 className="paper-section-title mt-1 text-[12pt] font-bold text-foreground">
            {block.section.title}
          </h2>
          {block.section.instructions && !analysisView && (
            <p className="paper-section-instructions mt-1 text-[9.5pt] font-semibold leading-normal text-foreground">
              {block.section.instructions}
            </p>
          )}
          {block.section.passage &&
            !analysisView &&
            !isCetReading &&
            !practiceMode && (
            <div className="mt-2 text-sm text-foreground">
              <Markdown>{block.section.passage}</Markdown>
            </div>
          )}
          {block.section.optionBank &&
            block.section.optionBank.length > 0 &&
            !analysisView &&
            !isCetReading && (
            <div className="mt-2 text-sm text-foreground">
              {block.section.kind === "cet-reading-a" ? (
                <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                  {block.section.optionBank.map((word, index) => (
                    <span key={`${word}-${index}`}>
                      {String.fromCharCode(65 + index)}. {word}
                    </span>
                  ))}
                </div>
              ) : (
                <p>
                  Paragraph choices:{" "}
                  {block.section.optionBank
                    .map(
                      (_, index) => String.fromCharCode(65 + index),
                    )
                    .join("　")}
                </p>
              )}
            </div>
          )}
        </div>
      );
      }
    case "reading-passage": {
      const passage =
        block.sectionKind === "cet-reading-a"
          ? formatBankedClozePassage(block.text)
          : block.sectionKind === "cet-reading-b"
            ? formatReadingBParagraphLabel(block.text)
            : block.text;
      const passageQuestion = display.questions.find(
        (question) =>
          question.examSection?.kind === block.sectionKind &&
          question.examSection.passage?.includes(block.text),
      );
      const interactiveReadingA =
        practiceMode &&
        !analysisView &&
        block.sectionKind === "cet-reading-a";
      const renderPracticeBlank = (value: string) => {
        const number = Number(value);
        const question = display.questions.find(
          (candidate) =>
            candidate.examSection?.kind === "cet-reading-a" &&
            candidate.examSection.questionNumber === number,
        );
        if (!question) return <u>{value}</u>;
        return (
          <ReadingABlankInput
            number={number}
            question={question}
            value={practiceAnswers[question.id] ?? ""}
            submitted={practiceSubmitted}
            onChange={(answer) => setPracticeAnswer(question.id, answer)}
          />
        );
      };
      return (
        <div
          {...attrs}
          className="cet-reading-passage text-sm text-foreground"
          data-section-kind={block.sectionKind}
        >
          {block.partTitle && (
            <h3 className="cet-reading-part-title mb-1 text-[11pt] font-bold text-foreground">
              {block.partTitle}
            </h3>
          )}
          {block.questionRange && (
            <p className="mb-1 text-[9.5pt] font-semibold text-foreground">
              {block.questionRange}
            </p>
          )}
          {practiceMode && (
            <div className="no-print mb-1 flex justify-end">
              <PracticeNoteControl
                compact
                noteKey={`passage:${block.id}`}
                label={t("practice.passageLabel", {
                  title: block.partTitle ?? block.sectionKind,
                })}
              />
            </div>
          )}
          <div
            data-markdown-source={
              passageQuestion ? "passage" : undefined
            }
            data-markdown-source-key={`passage:${block.id}`}
            data-markdown-question-id={passageQuestion?.id}
            data-markdown-text={block.text}
          >
            <Markdown
              renderBlank={
                interactiveReadingA ? renderPracticeBlank : undefined
              }
            >
              {passage}
            </Markdown>
          </div>
        </div>
      );
    }
    case "word-bank": {
      const words = normalizeWordBank(block.words);
      const bankQuestion = display.questions.find(
        (question) =>
          question.examSection?.kind === "cet-reading-a" &&
          (question.examSection.optionBank?.length ?? 0) > 0,
      );
      return (
        <div
          {...attrs}
          className="cet-word-bank mt-1 grid grid-cols-2 gap-x-8 gap-y-0.5 border border-border px-5 py-1 text-sm leading-snug text-foreground"
        >
          {words.map((word, index) => {
            const letter = String.fromCharCode(65 + index);
            return (
              <div
                key={`${word}-${index}`}
                className="flex min-w-0 items-center gap-1 whitespace-nowrap"
              >
                <span>{letter})</span>
                {" "}
                <span
                  data-markdown-source={
                    bankQuestion ? "word-bank" : undefined
                  }
                  data-markdown-source-key={`word-bank:${block.id}:${index}`}
                  data-markdown-question-id={bankQuestion?.id}
                  data-markdown-bank-index={index}
                  data-markdown-text={word}
                >
                  {word}
                </span>
                {practiceMode && (
                  <PracticeNoteControl
                    compact
                    noteKey={`word-bank:${block.id}:${index}`}
                    label={`${letter}) ${word}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    }
    case "group-heading":
      return (
        <div {...attrs} className="cet-group-heading mt-1">
          <h3 className="text-[11pt] font-bold text-foreground">
            {block.title}
          </h3>
          {block.questionRange && (
            <p className="mt-0.5 text-[9.5pt] font-semibold text-foreground">
              {block.questionRange}
            </p>
          )}
        </div>
      );
    case "reading-statements":
      return (
        <div {...attrs}>
          <ol className="space-y-1">
            {block.questions.map((question, index) => (
              <QuestionBlock
                key={question.id}
                question={question}
                index={
                  (question.examSection?.questionNumber ?? index + 1) - 1
                }
                studentView={studentView}
                analysisView={analysisView}
                onEdit={measuring ? () => undefined : onEdit}
              />
            ))}
          </ol>
        </div>
      );
    case "question":
      {
        const isCetReading =
          block.question.examSection?.kind?.startsWith("cet-reading-");
        const isCetListening =
          block.question.examSection?.kind?.startsWith("cet-listening-") ??
          false;
      return (
        <div {...attrs}>
          {block.question.examSection?.passage &&
            !isCetReading &&
            !practiceMode &&
            (isCetListening ? analysisView : !analysisView) && (
            <div className="paper-question-passage mb-2 text-sm text-foreground">
              <Markdown>{block.question.examSection.passage}</Markdown>
            </div>
          )}
          <ol className="space-y-2">
            <QuestionBlock
              question={block.question}
              index={block.number - 1}
              studentView={studentView}
              analysisView={analysisView}
              onEdit={measuring ? () => undefined : onEdit}
            />
          </ol>
        </div>
      );
      }
  }
}

function ReadingABlankInput({
  number,
  question,
  value,
  submitted,
  onChange,
}: {
  number: number;
  question: Question;
  value: string;
  submitted: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const correct =
    question.type === "single-choice"
      ? String.fromCharCode(65 + question.correctAnswer)
      : "";
  const statusClass = submitted
    ? value === correct
      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : value
        ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
        : "border-border bg-transparent text-foreground"
    : value
      ? "border-primary bg-primary/10 text-foreground"
      : "border-foreground bg-transparent text-foreground";

  return (
    <input
      type="text"
      inputMode="text"
      maxLength={1}
      pattern="[A-Oa-o]"
      autoComplete="off"
      spellCheck={false}
      value={value}
      aria-label={t("practice.readingABlank", { number })}
      title={t("practice.readingABlankHint", { number })}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.currentTarget.value
          .toUpperCase()
          .replace(/[^A-O]/g, "")
          .slice(-1);
        onChange(next);
      }}
      className={`mx-1 inline-block h-6 w-9 rounded-sm border-b-2 bg-clip-padding px-0 text-center align-baseline text-sm font-semibold outline-none focus:ring-2 focus:ring-ring ${statusClass}`}
    />
  );
}

function EmptyPaper({
  t,
  addAndEdit,
}: {
  t: ReturnType<typeof useTranslation>["t"];
  addAndEdit: () => void;
}) {
  return (
    <div className="py-16 text-center">
      <NotebookPen className="mx-auto mb-4 h-10 w-10 text-muted-foreground/60" />
      <p className="text-base font-medium text-foreground">
        {t("paper.emptyTitle")}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {t("paper.emptySubtitle")}
      </p>
      <button
        type="button"
        onClick={addAndEdit}
        className={`no-print mt-4 ${primaryBtn}`}
      >
        <Plus className="h-4 w-4" />
        {t("paper.addQuestion")}
      </button>
    </div>
  );
}

function pxToMm(px: number): number {
  return px * 0.264583;
}

function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

function previewScaleForSettings(
  settings: AppSettings,
  pageMetrics: PageMetrics,
  viewport: ElementSize,
): number {
  if (isPaperPreviewFixedZoom(settings.paperPreviewZoom)) {
    return PAPER_PREVIEW_FIXED_ZOOM_SCALES[settings.paperPreviewZoom];
  }

  const pageWidth = mmToPx(parseFloat(pageMetrics.width));
  const pageHeight = mmToPx(parseFloat(pageMetrics.height));
  const availableWidth = Math.max(
    120,
    viewport.width - AUTO_ZOOM_PADDING_PX,
  );
  const widthScale = availableWidth / pageWidth;
  if (settings.paperPreviewZoom === "fitWidth") {
    return clamp(widthScale, AUTO_ZOOM_MIN, AUTO_ZOOM_MAX);
  }

  const availableHeight = Math.max(
    120,
    viewport.height - AUTO_ZOOM_PADDING_PX,
  );
  return clamp(
    Math.min(widthScale, availableHeight / pageHeight),
    AUTO_ZOOM_MIN,
    AUTO_ZOOM_MAX,
  );
}

interface ElementSize {
  width: number;
  height: number;
}

function useElementSize(
  ref: RefObject<HTMLElement | null> | undefined,
  enabled = true,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!enabled) return;
    const node = ref?.current;
    if (!node) return;
    const element = node;
    let frame: number | null = null;

    function readSize() {
      const next = {
        width: element.clientWidth || element.getBoundingClientRect().width,
        height: element.clientHeight || element.getBoundingClientRect().height,
      };
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    }

    function scheduleUpdate() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        readSize();
      });
    }

    readSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleUpdate);
      return () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", scheduleUpdate);
      };
    }

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [enabled, ref]);

  return size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function samePages(a: PaperPage[] | null, b: PaperPage[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (page, index) =>
      page.blocks.map((block) => block.id).join("|") ===
      b[index].blocks.map((block) => block.id).join("|"),
  );
}

function blockContentSignature(block: PaperLayoutBlock): string {
  switch (block.kind) {
    case "title":
      return stableSignature([block.id, block.title]);
    case "exam-info":
      return block.id;
    case "answer-summary":
      return stableSignature([
        block.id,
        block.questions.map((question) => [
          question.id,
          question.type === "single-choice" ? question.correctAnswer : null,
        ]),
      ]);
    case "section":
      return stableSignature([
        block.id,
        block.section.title,
        paginationText(block.section.passage ?? ""),
        block.section.questions.map((question) => question.id),
      ]);
    case "reading-passage":
      return stableSignature([
        block.id,
        paginationText(block.text),
        block.partTitle ?? "",
        block.questionRange ?? "",
      ]);
    case "word-bank":
      return stableSignature([
        block.id,
        block.words.map(paginationText),
      ]);
    case "group-heading":
      return stableSignature([
        block.id,
        block.title,
        block.questionRange,
      ]);
    case "reading-statements":
      return stableSignature([
        block.id,
        block.questions.map((question) => question.id),
      ]);
    case "question":
      return stableSignature([
        block.id,
        block.number,
        paginationValue(block.question),
        block.estimatedHeightMm,
      ]);
  }
}

/**
 * Inline color/highlight wrappers do not change visible text or line breaking.
 * Ignoring them prevents every marker stroke from repaginating the whole paper.
 */
function paginationText(value: string): string {
  return value
    .replace(/\{\{(?:color|mark):[a-z]+\|/g, "")
    .replace(/\}\}/g, "");
}

function paginationValue(value: unknown): unknown {
  if (typeof value === "string") return paginationText(value);
  if (Array.isArray(value)) return value.map(paginationValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        paginationValue(entry),
      ]),
    );
  }
  return value;
}

function stableSignature(value: unknown): string {
  return JSON.stringify(value);
}
