import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  FilePlus2,
  FolderOpen,
  Heart,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { usePaperStore } from "../../stores/paperStore";
import { usePracticeStore } from "../../stores/practiceStore";
import { ghostBtn, iconBtn } from "../../lib/ui/styles";
import { ExportMenu } from "./ExportMenu";

interface ActionBarProps {
  onOpenSettings: () => void;
  onOpenPaperManager: () => void;
  onQuickGenerate: () => void;
  onOpenReview: () => void;
  onOpenQuality: () => void;
  onOpenDonate: () => void;
}

export function ActionBar({
  onOpenSettings,
  onOpenPaperManager,
  onQuickGenerate,
  onOpenReview,
  onOpenQuality,
  onOpenDonate,
}: ActionBarProps) {
  const { t } = useTranslation();
  const paperTitle = usePaperStore((state) => state.paper.title);
  const questionCount = usePaperStore((state) => state.paper.questions.length);
  const newPaper = usePaperStore((state) => state.newPaper);
  const practiceMode = usePracticeStore((state) => state.practiceMode);
  const setPracticeMode = usePracticeStore((state) => state.setPracticeMode);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const isBlank = !paperTitle.trim() && questionCount === 0;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

  return (
    <div
      className="no-print flex min-w-0 flex-wrap items-center gap-1 border-b border-border bg-card px-4 py-1.5"
      role="toolbar"
      aria-label={t("app.moreActions")}
    >
      <ExportMenu variant="audio" triggerClassName={primaryActionBtn} />
      <button
        type="button"
        onClick={() => setPracticeMode(!practiceMode)}
        title={t(practiceMode ? "practice.exit" : "practice.start")}
        className={primaryActionBtn}
      >
        <SquarePen className="h-4 w-4" />
        <span>{t(practiceMode ? "practice.exit" : "practice.start")}</span>
      </button>
      <button
        type="button"
        onClick={onQuickGenerate}
        title={t("app.generateCet")}
        className={primaryActionBtn}
      >
        <Sparkles className="h-4 w-4" />
        <span>{t("app.generateCet")}</span>
      </button>
      <ExportMenu triggerClassName={outlineActionBtn} iconOnly />
      <button
        type="button"
        aria-label={t("donate.title")}
        title={t("donate.title")}
        onClick={onOpenDonate}
        className={iconBtn}
      >
        <Heart className="h-5 w-5 text-rose-500" />
      </button>
      <div ref={moreRef} className="relative">
        <button
          type="button"
          aria-label={t("app.moreActions")}
          title={t("app.moreActions")}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
          className={iconBtn}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {moreOpen && (
          <div
            role="menu"
            className="absolute left-0 z-30 mt-1 w-48 rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
          >
            <ActionItem
              label={t("app.newPaper")}
              icon={<FilePlus2 className="h-4 w-4" />}
              disabled={isBlank}
              onClick={() => {
                setMoreOpen(false);
                void newPaper();
              }}
            />
            <ActionItem
              label={t("paperLibrary.title")}
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => {
                setMoreOpen(false);
                onOpenPaperManager();
              }}
            />
            <ActionItem
              label={t("review.title")}
              icon={<ClipboardCheck className="h-4 w-4" />}
              onClick={() => {
                setMoreOpen(false);
                onOpenReview();
              }}
            />
            <ActionItem
              label={t("quality.title")}
              icon={<ShieldCheck className="h-4 w-4" />}
              onClick={() => {
                setMoreOpen(false);
                onOpenQuality();
              }}
            />
            <div className="my-1 border-t border-border" />
            <ActionItem
              label={t("settings.title")}
              icon={<Settings className="h-4 w-4" />}
              onClick={() => {
                setMoreOpen(false);
                onOpenSettings();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const outlineActionBtn = ghostBtn + " h-8 whitespace-nowrap border border-border";
const primaryActionBtn =
  ghostBtn +
  " h-8 whitespace-nowrap border border-primary/40 text-primary hover:bg-primary/10 hover:text-primary";

function ActionItem({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
