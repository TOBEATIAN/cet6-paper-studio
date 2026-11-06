import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { auditCet6Paper } from "../../lib/cet/quality/audit";
import { usePaperStore } from "../../stores/paperStore";
import { iconBtn } from "../../lib/ui/styles";
import { secondaryBtn } from "../../lib/ui/styles";

interface QualityReportModalProps {
  onClose: () => void;
}

/** Deterministic quality report for the active paper. */
export function QualityReportModal({ onClose }: QualityReportModalProps) {
  const { t } = useTranslation();
  const paper = usePaperStore((s) => s.paper);
  const hasQuestions = paper.questions.length > 0;
  const report = useMemo(
    () =>
      hasQuestions
        ? auditCet6Paper(paper)
        : {
            checks: [],
            metrics: {
              listeningTranscriptWords: [],
              readingBOverlapMedian: 0,
              readingCParagraphSigma: [],
              readingCLongWordPercent: [],
              translationChineseCharacters: 0,
              writingGivenSentenceWords: 0,
            },
            errors: [],
            warnings: [],
            passed: false,
          },
    [hasQuestions, paper],
  );
  const passedCount = report.checks.filter((check) => check.passed).length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("quality.title")}
        className="flex h-[86vh] max-h-[46rem] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${
                report.passed
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              }`}
            >
              {report.passed ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </span>
            <div>
              <h2 className="font-semibold">{t("quality.title")}</h2>
              <p className="text-xs text-muted-foreground">
                {hasQuestions
                  ? t("quality.summary", {
                      passed: passedCount,
                      total: report.checks.length,
                    })
                  : t("quality.emptyPaper")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("settings.cancel")}
            onClick={onClose}
            className={iconBtn}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {!hasQuestions && (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/60" />
              <div>
                <p className="text-sm font-medium">{t("quality.emptyPaper")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("quality.emptyPaperHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={secondaryBtn}
              >
                {t("quality.back")}
              </button>
            </div>
          )}
          {hasQuestions && (
            <>
          <section className="rounded-md border border-border bg-background p-3">
            <h3 className="text-sm font-semibold">{t("quality.metrics")}</h3>
            <dl className="mt-2 grid grid-cols-[minmax(10rem,auto)_1fr] gap-x-4 gap-y-1 text-xs">
              <Metric
                label={t("cet6.metricListeningWords")}
                value={report.metrics.listeningTranscriptWords.join(" / ")}
              />
              <Metric
                label={t("cet6.metricReadingB")}
                value={`${report.metrics.readingBOverlapMedian.toFixed(1)}%`}
              />
              <Metric
                label={t("cet6.metricReadingCSigma")}
                value={report.metrics.readingCParagraphSigma
                  .map((value) => value.toFixed(1))
                  .join(" / ")}
              />
              <Metric
                label={t("cet6.metricReadingCLongWords")}
                value={report.metrics.readingCLongWordPercent
                  .map((value) => `${value.toFixed(1)}%`)
                  .join(" / ")}
              />
              <Metric
                label={t("cet6.metricTranslation")}
                value={String(report.metrics.translationChineseCharacters)}
              />
              <Metric
                label={t("cet6.metricWritingGiven")}
                value={String(report.metrics.writingGivenSentenceWords)}
              />
            </dl>
          </section>

          <section className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">
              {t("quality.checks")}
            </h3>
            <ul className="space-y-1.5">
              {report.checks.map((check) => (
                <li
                  key={check.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    check.passed
                      ? "border-border bg-background"
                      : check.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
                        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                  }`}
                >
                  {check.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{check.label}</span>
                    {check.detail && (
                      <span className="mt-0.5 block opacity-75">
                        {check.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </>
  );
}
