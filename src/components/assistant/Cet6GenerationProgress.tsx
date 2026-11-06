import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FolderOpen,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { CET6_PIPELINE_PHASES } from "../../lib/types/cet";
import { errorMessageKey } from "../../lib/api/errorMessages";
import { useCet6GenerationStore } from "../../stores/cet6GenerationStore";

/** Progress and resumability feedback for the staged CET-6 generator. */
export function Cet6GenerationProgress() {
  const { t } = useTranslation();
  const status = useCet6GenerationStore((s) => s.status);
  const currentPhase = useCet6GenerationStore((s) => s.currentPhase);
  const completedPhases = useCet6GenerationStore((s) => s.completedPhases);
  const qualityReport = useCet6GenerationStore((s) => s.qualityReport);
  const errorCode = useCet6GenerationStore((s) => s.errorCode);
  const errorDetail = useCet6GenerationStore((s) => s.errorDetail);
  const errorPhase = useCet6GenerationStore((s) => s.errorPhase);
  const openDiagnostics = useCet6GenerationStore((s) => s.openDiagnostics);
  const resetCheckpoint = useCet6GenerationStore((s) => s.resetCheckpoint);
  const generationStartedAt = useCet6GenerationStore(
    (s) => s.generationStartedAt,
  );
  const estimatedTotalMs = useCet6GenerationStore((s) => s.estimatedTotalMs);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  if (status === "idle" && completedPhases.length === 0) return null;

  const total = CET6_PIPELINE_PHASES.length;
  const completed = completedPhases.length;
  const phase =
    currentPhase ??
    errorPhase ??
    completedPhases[completedPhases.length - 1];
  const diagnosticText = [
    errorCode ? `错误码：${errorCode}` : "",
    errorPhase
      ? `失败阶段：${t(`cet6.phase.${errorPhase}`)}`
      : "",
    errorDetail ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const elapsedMs = generationStartedAt
    ? Math.max(0, now - Date.parse(generationStartedAt))
    : 0;
  const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);

  async function copyDiagnostics() {
    if (!diagnosticText) return;
    try {
      await navigator.clipboard.writeText(diagnosticText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={
        status === "error"
          ? "rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
          : "rounded-xl border border-primary/25 bg-primary/[0.06] p-3 text-sm text-foreground"
      }
      role={status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {status === "running" ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : status === "error" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {status === "running"
                ? t("cet6.generating")
                : status === "error"
                  ? t("cet6.interrupted")
                  : t("cet6.completed")}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {completed}/{total}
            </span>
          </div>
          {phase && (
            <p className="mt-1 text-xs text-muted-foreground">
              {status === "running"
                ? t("cet6.currentPhase", {
                    phase: t(`cet6.phase.${phase}`),
                  })
                : status === "error"
                  ? t("cet6.resumeHint", { count: completed })
                  : t("cet6.applyHint")}
            </p>
          )}
          {generationStartedAt && estimatedTotalMs > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {status === "completed"
                ? t("cet6.etaComplete", {
                    elapsed: formatGenerationDuration(
                      elapsedMs,
                      t("cet6.etaLessThanMinute"),
                    ),
                  })
                : t("cet6.etaRunning", {
                    total: formatGenerationDuration(
                      estimatedTotalMs,
                      t("cet6.etaLessThanMinute"),
                    ),
                    elapsed: formatGenerationDuration(
                      elapsedMs,
                      t("cet6.etaLessThanMinute"),
                    ),
                    remaining: formatGenerationDuration(
                      remainingMs,
                      t("cet6.etaLessThanMinute"),
                    ),
                  })}
            </p>
          )}
          {status === "error" && (
            <div className="mt-3 rounded-md border border-amber-300/70 bg-background/50 p-2.5 text-xs">
              <p className="font-medium text-foreground">
                {t("cet6.errorCause", {
                  message: errorCode
                    ? t(errorMessageKey({ code: errorCode, detail: errorDetail ?? undefined }))
                    : t("errors.unknown"),
                })}
              </p>
              {errorPhase && (
                <p className="mt-1 text-muted-foreground">
                  {t("cet6.failedPhase", {
                    phase: t(`cet6.phase.${errorPhase}`),
                  })}
                </p>
              )}
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/70 p-2 font-sans text-muted-foreground">
                {errorDetail || t("cet6.noErrorDetail")}
              </pre>
              <p className="mt-2 text-muted-foreground">
                {t("cet6.errorNextStep")}
              </p>
              {diagnosticText && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyDiagnostics()}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied
                      ? t("cet6.copiedDiagnostics")
                      : t("cet6.copyDiagnostics")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openDiagnostics()}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t("cet6.openDiagnostics")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await ask(
                        t("cet6.resetCheckpointMessage"),
                        {
                          title: t("cet6.resetCheckpointTitle"),
                          kind: "warning",
                          okLabel: t("cet6.resetCheckpointConfirm"),
                          cancelLabel: t("settings.cancel"),
                        },
                      );
                      if (confirmed) await resetCheckpoint();
                    }}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("cet6.resetCheckpoint")}
                  </button>
                </div>
              )}
            </div>
          )}
          {status === "completed" && qualityReport && (
            <>
              <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("cet6.qualityPassed", {
                  passed: qualityReport.checks.filter((check) => check.passed)
                    .length,
                  total: qualityReport.checks.length,
                })}
              </p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("cet6.viewQualityReport")}
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-muted-foreground">
                  <dt>{t("cet6.metricListeningWords")}</dt>
                  <dd>{qualityReport.metrics.listeningTranscriptWords.join(" / ")}</dd>
                  <dt>{t("cet6.metricReadingB")}</dt>
                  <dd>{qualityReport.metrics.readingBOverlapMedian.toFixed(1)}%</dd>
                  <dt>{t("cet6.metricReadingCSigma")}</dt>
                  <dd>{qualityReport.metrics.readingCParagraphSigma.map((value) => value.toFixed(1)).join(" / ")}</dd>
                  <dt>{t("cet6.metricReadingCLongWords")}</dt>
                  <dd>{qualityReport.metrics.readingCLongWordPercent.map((value) => `${value.toFixed(1)}%`).join(" / ")}</dd>
                  <dt>{t("cet6.metricTranslation")}</dt>
                  <dd>{qualityReport.metrics.translationChineseCharacters}</dd>
                  <dt>{t("cet6.metricWritingGiven")}</dt>
                  <dd>{qualityReport.metrics.writingGivenSentenceWords}</dd>
                </dl>
                <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                  {qualityReport.checks.map((check) => (
                    <li
                      key={check.id}
                      className={
                        check.passed
                          ? "text-muted-foreground"
                          : "text-destructive"
                      }
                    >
                      {check.passed
                        ? t("cet6.qualityPass")
                        : t("cet6.qualityFail")}{" "}
                      · {check.label}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full origin-left rounded-full bg-primary transition-transform duration-300"
              style={{ transform: `scaleX(${completed / total})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatGenerationDuration(
  durationMs: number,
  lessThanMinute: string,
): string {
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  if (minutes < 1) return lessThanMinute;
  return `${minutes} 分钟`;
}
