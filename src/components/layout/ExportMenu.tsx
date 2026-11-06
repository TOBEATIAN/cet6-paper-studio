import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  FileJson,
  Loader2,
  Pause,
  Play,
  Printer,
  RotateCcw,
  RotateCw,
  Upload,
  X,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { usePaperStore } from "../../stores/paperStore";
import { useConfigStore } from "../../stores/configStore";
import { useExportStore, type ExamInfoFields } from "../../stores/exportStore";
import { ghostBtn } from "../../lib/ui/styles";
import {
  exportJson,
  exportMarkdown,
  importJson,
} from "../../lib/export/exportFile";
import { defaultListeningAudioPath } from "../../lib/tts/audio";
import { buildListeningSpeechPlan } from "../../lib/tts/plan";
import { assertCompleteListeningPlan } from "../../lib/tts/audio";
import { readAudioFile } from "../../lib/storage/tauri";
import {
  TTS_SPEECH_RATE_MAX,
  TTS_SPEECH_RATE_MIN,
} from "../../lib/types/config";
import {
  useTtsAudioStore,
  type TtsAudioJob,
} from "../../stores/ttsAudioStore";

interface ExportMenuProps {
  triggerClassName?: string;
  variant?: "all" | "audio";
  iconOnly?: boolean;
}

const FIELD_KEYS: (keyof ExamInfoFields)[] = [
  "subject",
  "studentName",
  "duration",
  "totalScore",
  "score",
];
const NOTICE_TIMEOUT_MS = 3000;
const PRINT_LAYOUT_TIMEOUT_MS = 1000;

/**
 * Top-bar export menu: save JSON project, import JSON, export Markdown / PDF in
 * teacher or student variant, plus exam-info header field toggles. Markdown uses
 * the pure assembler; PDF reuses the live sheet via window.print(), switching
 * the on-screen view first so the printout matches the chosen variant.
 */
export function ExportMenu({
  triggerClassName = ghostBtn,
  variant = "all",
  iconOnly = false,
}: ExportMenuProps) {
  const { t } = useTranslation();
  const audioOnly = variant === "audio";
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const paper = usePaperStore((s) => s.paper);
  const activePaperId = usePaperStore((s) => s.activePaperId);
  const view = usePaperStore((s) => s.view);
  const setView = usePaperStore((s) => s.setView);
  const replacePaper = usePaperStore((s) => s.replacePaper);
  const dataDir = useConfigStore((s) => s.dataDir);
  const ttsSettings = useConfigStore((s) => s.config.settings.tts);
  const updateSettings = useConfigStore((s) => s.updateSettings);
  const audioJob = useTtsAudioStore((s) => s.job);
  const startListeningAudio = useTtsAudioStore((s) => s.start);
  const reportAudioError = useTtsAudioStore((s) => s.reportError);
  const clearAudioJob = useTtsAudioStore((s) => s.clear);
  const [audioWpm, setAudioWpm] = useState(ttsSettings.targetWpm);
  const expectedAudioPath = dataDir
    ? defaultListeningAudioPath(
        dataDir,
        paper.title,
        activePaperId ?? undefined,
      )
    : null;

  const showHeader = useExportStore((s) => s.showHeader);
  const fields = useExportStore((s) => s.fields);
  const setShowHeader = useExportStore((s) => s.setShowHeader);
  const toggleField = useExportStore((s) => s.toggleField);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open && !audioOnly) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [audioOnly, open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setAudioWpm(ttsSettings.targetWpm);
  }, [ttsSettings.targetWpm]);

  const header = showHeader ? fields : undefined;

  async function doJson() {
    await runExport(() => exportJson(paper, dataDir), t("export.json"));
  }

  async function doImport() {
    try {
      const imported = await importJson(dataDir);
      if (imported) await replacePaper(imported);
    } catch {
      window.alert(t("export.importFailed"));
    }
    setOpen(false);
  }

  async function doMarkdown(includeAnswers: boolean) {
    const label = includeAnswers
      ? t("export.markdownAnswersOnly")
      : t("export.markdownStudent");
    await runExport(
      () => exportMarkdown(paper, dataDir, { includeAnswers, header }),
      label,
    );
  }

  async function doListeningAudio() {
    if (
      audioJob?.status === "preparing" ||
      audioJob?.status === "running" ||
      audioJob?.status === "assembling"
    ) {
      return;
    }
    setOpen(false);
    try {
      const plan = buildListeningSpeechPlan(paper, audioWpm);
      assertCompleteListeningPlan(plan);
      const generationSettings = { ...ttsSettings, targetWpm: audioWpm };
      if (audioWpm !== ttsSettings.targetWpm) {
        await updateSettings({ tts: generationSettings });
      }

      const path = await save({
        defaultPath: dataDir
          ? defaultListeningAudioPath(dataDir, paper.title, activePaperId ?? undefined)
          : undefined,
        filters: [{ name: "MP3", extensions: ["mp3"] }],
      });
      if (typeof path !== "string") {
        return;
      }
      await startListeningAudio(paper, path, { targetWpm: audioWpm });
    } catch (error) {
      console.error("Listening audio export failed", error);
      reportAudioError(error);
    }
  }

  function commitAudioWpm() {
    if (audioWpm === ttsSettings.targetWpm) return;
    void updateSettings({
      tts: { ...ttsSettings, targetWpm: audioWpm },
    }).catch((error) => {
      console.error("Could not save listening speed", error);
    });
  }

  async function runExport(
    action: () => Promise<boolean>,
    label: string,
  ): Promise<void> {
    try {
      const exported = await action();
      if (exported) {
        setNotice({
          kind: "success",
          text: t("export.exportSucceeded", { format: label }),
        });
      }
    } catch {
      setNotice({
        kind: "error",
        text: t("export.exportFailed", { format: label }),
      });
    }
    setOpen(false);
  }

  async function doPdf(includeAnswers: boolean) {
    const previousView = view;
    const nextView = includeAnswers ? "answers" : "student";
    if (view !== nextView) {
      document.documentElement.dataset.paperPaginationReady = "false";
    }
    setView(nextView);
    setOpen(false);
    await waitForPrintLayout();
    const restoreView = () => setView(previousView);
    window.addEventListener("afterprint", restoreView, { once: true });
    window.print();
    window.setTimeout(() => {
      window.removeEventListener("afterprint", restoreView);
      restoreView();
    }, 10_000);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(audioOnly ? "export.listening" : "export.title")}
        title={t(audioOnly ? "export.listening" : "export.title")}
        className={triggerClassName}
      >
        {audioOnly ? (
          <AudioLines className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {!iconOnly && t(audioOnly ? "export.listening" : "export.title")}
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {notice && (
        <div
          role="status"
          className={`absolute z-20 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-md border px-3 py-2 text-xs shadow-lg ${
            audioOnly ? "left-0" : "right-0"
          } ${
            notice.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {audioOnly && audioJob && (
        <AudioJobCard
          job={audioJob}
          onClose={clearAudioJob}
        />
      )}

      {open && (
        <div
          className={`absolute z-20 mt-1 animate-fade-in rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg ${
            audioOnly
              ? "left-0 w-[min(22rem,calc(100vw-2rem))]"
              : "right-0 w-60"
          }`}
        >
          {!audioOnly && (
            <>
              <MenuItem
                label={t("export.json")}
                icon={<FileJson className="h-4 w-4" />}
                onClick={doJson}
              />
              <MenuItem
                label={t("export.importJson")}
                icon={<Upload className="h-4 w-4" />}
                onClick={doImport}
              />

              <Section
                label={t("export.pdfWysiwyg")}
                icon={<Printer className="h-4 w-4" />}
              >
                <Variant label={t("export.answersOnly")} onClick={() => doPdf(true)} />
                <Variant label={t("export.student")} onClick={() => doPdf(false)} />
              </Section>

              <Section label={t("export.markdownBackup")}>
                <Variant label={t("export.answersOnly")} onClick={() => doMarkdown(true)} />
                <Variant label={t("export.student")} onClick={() => doMarkdown(false)} />
              </Section>
            </>
          )}

          {audioOnly && (
            <>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("export.currentVoiceEngine")}：
                <span className="font-medium text-foreground">
                  {t(`tts.providerName.${ttsSettings.activeProvider}`)}
                </span>
              </div>
              <div className="my-1 border-t border-border" />
              <div className="px-2 py-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("export.generatedAudio")}
                </p>
                {expectedAudioPath &&
                audioJob?.status !== "complete" ? (
                  <AudioPlayback
                    path={expectedAudioPath}
                    showMissing
                  />
                ) : !expectedAudioPath ? (
                  <p className="text-xs text-muted-foreground">
                    {t("export.audioPathUnavailable")}
                  </p>
                ) : null}
              </div>
              <div className="my-1 border-t border-border" />
              <label className="block px-2 py-1.5">
                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  {t("export.audioSpeed")}
                  <span className="font-semibold text-foreground">{audioWpm} wpm</span>
                </span>
                <input
                  type="range"
                  min={TTS_SPEECH_RATE_MIN}
                  max={TTS_SPEECH_RATE_MAX}
                  step={1}
                  value={audioWpm}
                  aria-label={t("export.audioSpeed")}
                  onChange={(event) =>
                    setAudioWpm(Number(event.currentTarget.value))
                  }
                  onPointerUp={commitAudioWpm}
                  onKeyUp={commitAudioWpm}
                  onBlur={commitAudioWpm}
                  className="mt-2 w-full accent-primary"
                />
              </label>
              <MenuItem
                label={t("export.listeningAudio", {
                  wpm: audioWpm,
                })}
                icon={<AudioLines className="h-4 w-4" />}
                onClick={() => void doListeningAudio()}
              />
            </>
          )}

          {!audioOnly && (
            <>
              <div className="my-1 border-t border-border" />
              <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showHeader}
                  onChange={(e) => setShowHeader(e.currentTarget.checked)}
                  className="h-3.5 w-3.5 accent-primary cursor-pointer"
                />
                {t("export.examInfoHeader")}
              </label>
              {showHeader &&
                FIELD_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1 pl-5 text-xs text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={fields[key]}
                      onChange={() => toggleField(key)}
                      className="h-3.5 w-3.5 accent-primary cursor-pointer"
                    />
                    {t(`examInfo.${key}`)}
                  </label>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AudioJobCard({
  job,
  onClose,
}: {
  job: TtsAudioJob;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isWorking =
    job.status === "preparing" ||
    job.status === "running" ||
    job.status === "assembling";
  const completed = isWorking ? job.completed : 0;
  const total = isWorking ? job.total : 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div
      role={job.status === "error" ? "alert" : "status"}
      className="fixed bottom-5 right-5 z-50 w-80 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-xl"
    >
      <div className="flex items-start gap-3">
        {job.status === "error" ? (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        ) : job.status === "complete" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {job.status === "complete"
              ? t("export.audioComplete")
              : job.status === "error"
                ? t("export.audioFailed")
                : job.status === "assembling"
                  ? t("export.audioAssembling")
                  : t("export.audioGenerating", {
                      completed,
                      total,
                    })}
          </p>
          {isWorking && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  total > 0
                    ? "h-full rounded-full bg-primary transition-[width]"
                    : "h-full w-1/3 animate-pulse rounded-full bg-primary"
                }
                style={total > 0 ? { width: `${percent}%` } : undefined}
              />
            </div>
          )}
          {job.status === "complete" && (
            <>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("export.audioSummary", {
                  duration: formatDuration(job.result.durationMs),
                  wpm: Math.round(job.result.effectiveWpm),
                })}
                <span className="mt-1 block truncate" title={job.result.outputPath}>
                  {job.result.outputPath}
                </span>
              </p>
              {job.fallbackFrom && (
                <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  {t("export.audioFallbackUsed", {
                    provider: t(`tts.providerName.${job.fallbackFrom}`),
                  })}
                </p>
              )}
              <AudioPlayback path={job.result.outputPath} />
            </>
          )}
          {job.status === "error" && (
            <>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(job.message)}
              </p>
              {job.detail && (
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {t("export.audioErrorDetails")}
                  </summary>
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-sans">
                    {job.detail}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
        {!isWorking && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("export.closeAudioStatus")}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AudioPlayback({
  path,
  showMissing = false,
}: {
  path: string;
  showMissing?: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let canceled = false;
    setStatus("loading");
    setUrl(null);
    setPlaying(false);
    setCurrentSeconds(0);
    setDurationSeconds(0);
    void readAudioFile(path)
      .then((bytes) => {
        if (canceled) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: "audio/mpeg" }),
        );
        setUrl(objectUrl);
        setStatus("ready");
      })
      .catch(() => {
        setUrl(null);
        setStatus("missing");
      });
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (status === "loading") {
    return (
      <p className="text-xs text-muted-foreground">
        {t("export.audioChecking")}
      </p>
    );
  }
  if (!url) {
    return showMissing ? (
      <p className="text-xs text-muted-foreground">
        {t("export.noGeneratedAudio")}
      </p>
    ) : null;
  }
  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(
      0,
      Math.min(audio.duration || 0, audio.currentTime + seconds),
    );
  };
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };
  return (
    <div
      role="group"
      aria-label={t("export.generatedAudio")}
      className="mt-2 rounded-md border border-border bg-muted/30 p-2"
    >
      <audio
        ref={audioRef}
        preload="metadata"
        src={url}
        onLoadedMetadata={(event) =>
          {
            event.currentTarget.playbackRate = playbackRate;
            setDurationSeconds(
              Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : 0,
            );
          }
        }
        onTimeUpdate={(event) =>
          setCurrentSeconds(event.currentTarget.currentTime)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <input
        type="range"
        min={0}
        max={durationSeconds || 0}
        step={0.1}
        value={Math.min(currentSeconds, durationSeconds || 0)}
        aria-label={t("export.audioProgress")}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (audioRef.current) audioRef.current.currentTime = next;
          setCurrentSeconds(next);
        }}
        className="w-full accent-primary"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => seekBy(-15)}
            aria-label={t("export.audioBack15")}
            title={t("export.audioBack15")}
            className={audioControlBtn}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="text-[10px]">15</span>
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={t(
              playing ? "export.audioPause" : "export.audioPlay",
            )}
            title={t(playing ? "export.audioPause" : "export.audioPlay")}
            className={audioControlBtn + " bg-primary/10 text-primary"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => seekBy(15)}
            aria-label={t("export.audioForward15")}
            title={t("export.audioForward15")}
            className={audioControlBtn}
          >
            <RotateCw className="h-4 w-4" />
            <span className="text-[10px]">15</span>
          </button>
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatPlaybackTime(currentSeconds)} /{" "}
          {formatPlaybackTime(durationSeconds)}
        </span>
      </div>
      <label className="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>{t("export.audioPlaybackSpeed")}</span>
        <select
          value={playbackRate}
          aria-label={t("export.audioPlaybackSpeed")}
          onChange={(event) => {
            const rate = Number(event.currentTarget.value);
            setPlaybackRate(rate);
            if (audioRef.current) audioRef.current.playbackRate = rate;
          }}
          className="h-7 rounded border border-border bg-background px-1.5 text-foreground"
        >
          {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const audioControlBtn =
  "inline-flex h-7 min-w-8 items-center justify-center gap-0.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function waitForPrintLayout(): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = window.performance.now();

    function check() {
      if (
        document.documentElement.dataset.paperPaginationReady === "true" ||
        window.performance.now() - startedAt >= PRINT_LAYOUT_TIMEOUT_MS
      ) {
        resolve();
        return;
      }
      window.requestAnimationFrame(check);
    }

    window.requestAnimationFrame(check);
  });
}

function MenuItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {icon}
      {label}
    </button>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-0.5 flex gap-1">{children}</div>
    </div>
  );
}

function Variant({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {label}
    </button>
  );
}
