import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { useConfigStore } from "./stores/configStore";
import { usePaperStore } from "./stores/paperStore";
import { useTheme } from "./hooks/useTheme";
import { useGlobalFont } from "./hooks/useGlobalFont";
import { FirstLaunch } from "./components/layout/FirstLaunch";
import { TopBar } from "./components/layout/TopBar";
import { ActionBar } from "./components/layout/ActionBar";
import { PaperToolbar } from "./components/layout/PaperToolbar";
import { MarkdownFormatProvider } from "./components/layout/MarkdownFormatContext";
import { PaperOutline } from "./components/paper/PaperOutline";
import { PaperCanvas } from "./components/paper/PaperCanvas";
import { PaperErrorBoundary } from "./components/paper/PaperErrorBoundary";
import { AssistantDrawer } from "./components/assistant/AssistantDrawer";
import { SettingsModal } from "./components/settings/SettingsModal";
import { DonateModal } from "./components/layout/DonateModal";
import { PaperManagerModal } from "./components/paper/PaperManagerModal";
import { PracticeBar } from "./components/practice/PracticeBar";
import {
  ReviewModal,
  type ReviewInitialPractice,
} from "./components/review/ReviewModal";
import { QualityReportModal } from "./components/review/QualityReportModal";
import { ModalErrorBoundary } from "./components/layout/ModalErrorBoundary";
import { useAssistantStore } from "./stores/assistantStore";
import { useCet6GenerationStore } from "./stores/cet6GenerationStore";
import {
  configurePracticePersistence,
  usePracticeStore,
} from "./stores/practiceStore";
import { correctLetter } from "./lib/cet/quality/textMetrics";
import type { ModelConfig } from "./lib/types/config";
import { useTranslation } from "react-i18next";
import * as storage from "./lib/storage/tauri";

const WORKBENCH_BASE_WIDTH = 1280;
const WORKBENCH_BASE_HEIGHT = 800;

export default function App() {
  const { t } = useTranslation();
  const { loaded, dataDir, init } = useConfigStore();
  const closeBehavior = useConfigStore(
    (state) => state.config.settings.closeBehavior,
  );
  const paper = usePaperStore((s) => s.paper);
  const activePaperId = usePaperStore((s) => s.activePaperId);
  const loadPaper = usePaperStore((s) => s.load);
  const loadAssistantForPaper = useAssistantStore((s) => s.loadForPaper);
  const loadCet6Generation = useCet6GenerationStore((s) => s.load);
  const startCet6Generation = useCet6GenerationStore((s) => s.start);
  const activeConfig = useConfigStore((s): ModelConfig | null =>
    s.config.configs.find((config) => config.id === s.config.activeConfigId) ?? null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paperManagerOpen, setPaperManagerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [reviewInitialPractice, setReviewInitialPractice] =
    useState<ReviewInitialPractice>();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const paperScrollRef = useRef<HTMLElement | null>(null);
  const viewportSize = useViewportSize();
  const workbenchScale = computeWorkbenchScale(
    viewportSize.width,
    viewportSize.height,
  );
  const workbenchStyle = getWorkbenchStyle(workbenchScale, viewportSize);
  const loadPractice = usePracticeStore((state) => state.load);
  const hydratePractice = usePracticeStore((state) => state.hydrate);

  useTheme();
  useGlobalFont();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!loaded) return;
    void storage
      .setWindowCloseBehavior(closeBehavior === "background")
      .catch(() => undefined);
  }, [closeBehavior, loaded]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("generation-close-requested", async () => {
      const confirmed = await ask(t("app.exitWhileGeneratingMessage"), {
        title: t("app.exitWhileGeneratingTitle"),
        kind: "warning",
        okLabel: t("app.exitConfirm"),
        cancelLabel: t("app.cancel"),
      });
      if (confirmed) {
        await storage.exitApp().catch(() => undefined);
      }
    }).then((dispose) => {
      unlisten = dispose;
      if (disposed) dispose();
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t]);

  useEffect(() => {
    if (dataDir) void loadPaper();
  }, [dataDir, loadPaper]);

  useEffect(() => {
    if (activePaperId) void loadAssistantForPaper(activePaperId);
  }, [activePaperId, loadAssistantForPaper]);

  useEffect(() => {
    if (activePaperId) void loadCet6Generation(activePaperId);
  }, [activePaperId, loadCet6Generation]);

  useEffect(() => {
    configurePracticePersistence(dataDir);
    loadPractice(activePaperId);
    void hydratePractice(activePaperId);
  }, [activePaperId, dataDir, hydratePractice, loadPractice]);

  useEffect(() => {
    if (paper.questions.length === 0) {
      setActiveQuestionId(null);
      return;
    }
    setActiveQuestionId((current) =>
      current && paper.questions.some((question) => question.id === current)
        ? current
        : paper.questions[0].id,
    );
  }, [paper.questions]);

  // Esc closes the settings modal / collapses the drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (qualityOpen) setQualityOpen(false);
        else if (donateOpen) setDonateOpen(false);
        else if (reviewOpen) setReviewOpen(false);
        else if (paperManagerOpen) setPaperManagerOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else setDrawerOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, paperManagerOpen, reviewOpen, qualityOpen, donateOpen]);

  if (!loaded) {
    return <div className="grid h-full place-items-center bg-background text-muted-foreground" />;
  }

  if (!dataDir) {
    return <FirstLaunch />;
  }

  function quickGenerate() {
    if (!activeConfig) {
      setSettingsOpen(true);
      return;
    }
    if (paper.questions.length > 0) {
      window.alert(t("cet6.nonEmptyPaper"));
      return;
    }
    setDrawerOpen(true);
    void startCet6Generation();
  }

  function openReview() {
    setReviewInitialPractice(undefined);
    setReviewOpen(true);
  }

  function openReviewFromPractice() {
    const practice = usePracticeStore.getState();
    const answers: Record<string, string> = {};
    for (const question of paper.questions) {
      const number = question.examSection?.questionNumber;
      const selected = practice.answers[question.id];
      if (
        question.type !== "single-choice" ||
        number == null ||
        !selected ||
        selected === correctLetter(question.correctAnswer)
      ) {
        continue;
      }
      answers[String(number)] = selected;
    }
    setReviewInitialPractice({
      key: `${activePaperId ?? "paper"}-${Date.now()}`,
      answers,
      writingAnswer: practice.writingAnswer,
      translationAnswer: practice.translationAnswer,
    });
    setReviewOpen(true);
  }

  return (
    <MarkdownFormatProvider>
      <div className="h-full w-full overflow-hidden bg-background">
        <div
          className="origin-top-left bg-background text-foreground"
          style={workbenchStyle}
        >
          <div className="flex h-full flex-col bg-background text-foreground">
            <TopBar />
            <ActionBar
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenPaperManager={() => setPaperManagerOpen(true)}
              onQuickGenerate={quickGenerate}
              onOpenReview={openReview}
              onOpenQuality={() => setQualityOpen(true)}
              onOpenDonate={() => setDonateOpen(true)}
            />
            <PaperToolbar />
            <PracticeBar onOpenReview={openReviewFromPractice} />
            <div className="flex min-h-0 flex-1">
              <PaperOutline
                questions={paper.questions}
                activeQuestionId={activeQuestionId}
                open={outlineOpen}
                onToggle={() => setOutlineOpen((value) => !value)}
                onActiveQuestionChange={setActiveQuestionId}
              />
              <main ref={paperScrollRef} className="min-w-0 flex-1 overflow-auto">
                <PaperErrorBoundary key={activePaperId ?? "none"}>
                  <PaperCanvas
                    scrollRootRef={paperScrollRef}
                    onActiveQuestionChange={setActiveQuestionId}
                  />
                </PaperErrorBoundary>
              </main>
              <AssistantDrawer
                open={drawerOpen}
                onToggle={() => setDrawerOpen((v) => !v)}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
            {settingsOpen && (
              <SettingsModal onClose={() => setSettingsOpen(false)} />
            )}
            {paperManagerOpen && (
              <PaperManagerModal onClose={() => setPaperManagerOpen(false)} />
            )}
            {reviewOpen && (
              <ModalErrorBoundary
                title={t("modalError.title")}
                message={t("modalError.message")}
                closeLabel={t("modalError.close")}
                backLabel={t("modalError.back")}
                retryLabel={t("modalError.retry")}
                onClose={() => setReviewOpen(false)}
              >
                <ReviewModal
                  onClose={() => setReviewOpen(false)}
                  initialPractice={reviewInitialPractice}
                />
              </ModalErrorBoundary>
            )}
            {qualityOpen && (
              <ModalErrorBoundary
                title={t("modalError.title")}
                message={t("modalError.message")}
                closeLabel={t("modalError.close")}
                backLabel={t("modalError.back")}
                retryLabel={t("modalError.retry")}
                onClose={() => setQualityOpen(false)}
              >
                <QualityReportModal onClose={() => setQualityOpen(false)} />
              </ModalErrorBoundary>
            )}
            {donateOpen && <DonateModal onClose={() => setDonateOpen(false)} />}
          </div>
        </div>
      </div>
    </MarkdownFormatProvider>
  );
}

export function getWorkbenchStyle(
  scale: number,
  viewport: { width: number; height: number },
): {
  width: number | "100%";
  height: number | "100%";
  transform?: string;
} {
  if (scale >= 0.999) {
    return { width: "100%", height: "100%" };
  }
  return {
    width: WORKBENCH_BASE_WIDTH,
    height: Math.max(WORKBENCH_BASE_HEIGHT, viewport.height / scale),
    transform: `scale(${scale})`,
  };
}

export function computeWorkbenchScale(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 1;
  return Math.min(
    1,
    viewportWidth / WORKBENCH_BASE_WIDTH,
    viewportHeight / WORKBENCH_BASE_HEIGHT,
  );
}

function readViewportSize(): { width: number; height: number } {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() =>
    typeof window === "undefined"
      ? { width: WORKBENCH_BASE_WIDTH, height: WORKBENCH_BASE_HEIGHT }
      : readViewportSize(),
  );

  useEffect(() => {
    function updateSize() {
      const next = readViewportSize();
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    }

    updateSize();
    window.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("resize", updateSize);
    };
  }, []);

  return size;
}
