import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { usePaperStore } from "../../stores/paperStore";

export function TopBar() {
  const { t } = useTranslation();
  const paperTitle = usePaperStore((state) => state.paper.title);
  const setTitle = usePaperStore((state) => state.setTitle);
  const saveStatus = usePaperStore((state) => state.saveStatus);
  const StatusIcon = statusIcon[saveStatus];

  return (
    <header className="no-print flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <div className="flex shrink-0 items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {t("app.title")}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 ring-1 ring-transparent transition-shadow focus-within:ring-ring">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          aria-label={t("app.title")}
          value={paperTitle}
          placeholder={t("app.untitled")}
          onChange={(event) => setTitle(event.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <span className={statusPill[saveStatus]}>
        <StatusIcon
          className={
            saveStatus === "saving"
              ? "h-3.5 w-3.5 animate-spin"
              : "h-3.5 w-3.5"
          }
        />
        <span className="hidden sm:inline">{t(`saveStatus.${saveStatus}`)}</span>
      </span>
    </header>
  );
}

const statusIcon = {
  saved: CheckCircle2,
  saving: Loader2,
  unsaved: CircleAlert,
};

const statusPill = {
  saved:
    "inline-flex h-7 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  saving:
    "inline-flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-xs font-medium text-muted-foreground",
  unsaved:
    "inline-flex h-7 items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};
