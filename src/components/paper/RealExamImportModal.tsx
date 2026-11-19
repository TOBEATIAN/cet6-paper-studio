import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  FileSearch,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import { CET6_CONTENT_STAGES, type Cet6ContentStage } from "../../lib/types/cet";
import {
  ImportedPaperDraftSchema,
  type AnswerSearchRow,
} from "../../lib/types/import";
import { useRealExamImportStore } from "../../stores/realExamImportStore";
import { primaryBtn, secondaryBtn } from "../../lib/ui/styles";
import { stageLabelKey } from "../../lib/i18n/stageLabel";

interface RealExamImportModalProps {
  onClose: () => void;
  onApplied: () => void;
}

export function RealExamImportModal({
  onClose,
  onApplied,
}: RealExamImportModalProps) {
  const { t } = useTranslation();
  const status = useRealExamImportStore((state) => state.status);
  const progress = useRealExamImportStore((state) => state.progress);
  const draft = useRealExamImportStore((state) => state.draft);
  const answers = useRealExamImportStore((state) => state.answers);
  const bankCount = useRealExamImportStore((state) => state.bankCount);
  const error = useRealExamImportStore((state) => state.error);
  const extract = useRealExamImportStore((state) => state.extract);
  const searchAnswers = useRealExamImportStore((state) => state.searchAnswers);
  const updateAnswer = useRealExamImportStore((state) => state.updateAnswer);
  const apply = useRealExamImportStore((state) => state.apply);
  const replaceDraft = useRealExamImportStore((state) => state.replaceDraft);
  const importBank = useRealExamImportStore((state) => state.importBank);
  const exportBank = useRealExamImportStore((state) => state.exportBank);
  const refreshBankCount = useRealExamImportStore(
    (state) => state.refreshBankCount,
  );
  const clear = useRealExamImportStore((state) => state.clear);
  const [mode, setMode] = useState<"full" | "section">("full");
  const [selectedStages, setSelectedStages] = useState<Cet6ContentStage[]>([
    "reading-c",
  ]);
  const [questionFiles, setQuestionFiles] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftError, setDraftError] = useState("");
  const busy = ["extracting", "searching", "applying"].includes(status);
  const localize = (value: string) => {
    const [first, ...details] = value.split("\n");
    const label = first.startsWith("realImport.") ? t(first) : first;
    return [label, ...details].filter(Boolean).join("\n");
  };

  useEffect(() => {
    setDraftText(draft ? JSON.stringify(draft, null, 2) : "");
  }, [draft]);

  useEffect(() => {
    void refreshBankCount();
  }, [refreshBankCount]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.stopPropagation();
      clear();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, clear, onClose]);

  const counts = useMemo(() => {
    if (!draft) return [];
    return CET6_CONTENT_STAGES.flatMap((stage) => {
      const blocks = draft.blocks.filter((block) => block.stage === stage);
      const count = blocks.reduce(
        (sum, block) => sum + block.questions.length,
        0,
      );
      return count > 0 ? [{ stage, count }] : [];
    });
  }, [draft]);

  async function chooseQuestions() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: t("realImport.fileFilter"),
          extensions: ["pdf", "jpg", "jpeg", "png", "webp"],
        },
      ],
    });
    const paths =
      typeof selected === "string"
        ? [selected]
        : Array.isArray(selected)
          ? selected
          : [];
    setQuestionFiles(paths);
  }

  async function chooseAudio() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("realImport.audioFilter"),
          extensions: ["mp3", "wav", "m4a"],
        },
      ],
    });
    setAudioFile(typeof selected === "string" ? selected : "");
  }

  async function chooseBankImport() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("realImport.bankFile"), extensions: ["json"] }],
    });
    if (typeof selected === "string") await importBank(selected);
  }

  async function chooseBankExport() {
    const target = await save({
      defaultPath: "六级智卷答案库.json",
      filters: [{ name: t("realImport.bankFile"), extensions: ["json"] }],
    });
    if (target) await exportBank(target);
  }

  async function startExtraction() {
    if (questionFiles.length === 0) return;
    await extract({
      paths: questionFiles,
      mode,
      selectedStages:
        mode === "full" ? [...CET6_CONTENT_STAGES] : selectedStages,
      listeningAudioPath: audioFile,
    });
  }

  function commitDraftText() {
    try {
      replaceDraft(ImportedPaperDraftSchema.parse(JSON.parse(draftText)));
      setDraftError("");
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function applyDraft() {
    const applied = await apply();
    if (!applied) return;
    onApplied();
    onClose();
  }

  function toggleStage(stage: Cet6ContentStage) {
    setSelectedStages((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage],
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("realImport.title")}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileSearch className="h-5 w-5 text-primary" />
              {t("realImport.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("realImport.description")}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label={t("realImport.close")}
            title={t("realImport.close")}
            onClick={() => {
              clear();
              onClose();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {!draft && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{t("realImport.scope")}</p>
                <div className="mt-2 flex gap-2">
                  {(["full", "section"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={mode === item}
                      onClick={() => setMode(item)}
                      className={
                        mode === item
                          ? "rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary"
                          : secondaryBtn
                      }
                    >
                      {t(`realImport.mode.${item}`)}
                    </button>
                  ))}
                </div>
                {mode === "section" && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CET6_CONTENT_STAGES.map((stage) => (
                      <button
                        key={stage}
                        type="button"
                        aria-pressed={selectedStages.includes(stage)}
                        onClick={() => toggleStage(stage)}
                        className={
                          selectedStages.includes(stage)
                            ? "rounded border border-primary bg-primary/10 px-2 py-1.5 text-xs text-primary"
                            : "rounded border border-border px-2 py-1.5 text-xs hover:bg-accent"
                        }
                      >
                        {t(stageLabelKey(stage))}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border p-4">
                <button
                  type="button"
                  onClick={() => void chooseQuestions()}
                  className={secondaryBtn}
                >
                  <Upload className="h-4 w-4" />
                  {t("realImport.chooseQuestions")}
                </button>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {questionFiles.length > 0
                    ? questionFiles.join("\n")
                    : t("realImport.noFiles")}
                </p>
                <button
                  type="button"
                  onClick={() => void chooseAudio()}
                  className={`${secondaryBtn} mt-3`}
                >
                  {t("realImport.chooseAudio")}
                </button>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {audioFile || t("realImport.optional")}
                </p>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-medium">
                    {t("realImport.bankCount", { count: bankCount })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void chooseBankImport()}
                      className={secondaryBtn}
                    >
                      {t("realImport.importBank")}
                    </button>
                    <button
                      type="button"
                      disabled={bankCount === 0}
                      onClick={() => void chooseBankExport()}
                      className={secondaryBtn}
                    >
                      {t("realImport.exportBank")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {localize(progress) || t("realImport.working")}
            </div>
          )}

          {draft && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  {t("realImport.draftReady")}
                </span>
                {counts.map((item) => (
                  <span
                    key={item.stage}
                    className="rounded-full border border-border px-2.5 py-1 text-xs"
                  >
                    {t(stageLabelKey(item.stage))} · {item.count}
                  </span>
                ))}
                {draft.examDate && (
                  <span className="text-xs text-muted-foreground">
                    {draft.examDate} {draft.setLabel}
                  </span>
                )}
              </div>
              {draft.warnings.length > 0 && (
                <ul className="list-disc space-y-1 rounded-md bg-amber-50 px-6 py-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {draft.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}

              <details open>
                <summary className="cursor-pointer text-sm font-medium">
                  {t("realImport.editDraft")}
                </summary>
                <textarea
                  value={draftText}
                  onChange={(event) => setDraftText(event.currentTarget.value)}
                  aria-label={t("realImport.editDraft")}
                  className="mt-2 min-h-72 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={commitDraftText}
                    className={secondaryBtn}
                  >
                    {t("realImport.applyDraftEdit")}
                  </button>
                  {draftError && (
                    <span className="text-xs text-destructive">{draftError}</span>
                  )}
                </div>
              </details>

              {answers && answers.rows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">
                      {t("realImport.answerTable")}
                    </h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void searchAnswers()}
                      className={secondaryBtn}
                    >
                      <Search className="h-4 w-4" />
                      {t("realImport.searchAgain")}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("realImport.answerHint")}
                  </p>
                  <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2">{t("realImport.section")}</th>
                          <th className="px-2 py-2">{t("realImport.number")}</th>
                          <th className="px-2 py-2">{t("realImport.answer")}</th>
                          <th className="px-2 py-2">{t("realImport.status")}</th>
                          <th className="px-2 py-2">{t("realImport.sources")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {answers.rows.map((row) => (
                          <AnswerRow
                            key={`${row.stage}-${row.groupId}-${row.sourceQuestionNumber}`}
                            row={row}
                            onChange={(letter) =>
                              updateAnswer(
                                row.stage,
                                row.groupId,
                                row.sourceQuestionNumber,
                                letter,
                              )
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {(error || progress) && !busy && (
            <p
              role={error ? "alert" : "status"}
              className={
                error
                  ? "mt-3 whitespace-pre-wrap text-sm text-destructive"
                  : "mt-3 text-sm text-muted-foreground"
              }
            >
              {error ? localize(error) : localize(progress)}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {!draft ? (
            <button
              type="button"
              disabled={
                questionFiles.length === 0 ||
                busy ||
                (mode === "section" && selectedStages.length === 0)
              }
              onClick={() => void startExtraction()}
              className={primaryBtn}
            >
              <FileSearch className="h-4 w-4" />
              {t("realImport.start")}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  clear();
                  setQuestionFiles([]);
                }}
                className={secondaryBtn}
              >
                {t("realImport.restart")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyDraft()}
                className={primaryBtn}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t("realImport.apply")}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function AnswerRow({
  row,
  onChange,
}: {
  row: AnswerSearchRow;
  onChange: (letter: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1.5">{t(stageLabelKey(row.stage))}</td>
      <td className="px-2 py-1.5 tabular-nums">{row.sourceQuestionNumber}</td>
      <td className="px-2 py-1.5">
        <select
          value={row.answerLetter ?? ""}
          aria-label={`${t("realImport.answer")} ${row.sourceQuestionNumber}`}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-7 rounded border border-border bg-background px-1.5"
        >
          <option value="">—</option>
          {["A", "B", "C", "D"].map((letter) => (
            <option key={letter} value={letter}>
              {letter}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">{t(`realImport.answerStatus.${row.status}`)}</td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {row.sources.slice(0, 3).map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.evidence}
              className="text-primary underline decoration-primary/40"
            >
              {safeHost(source.url)}
            </a>
          ))}
          {row.sources.length === 0 && (
            <span className="text-muted-foreground">{t("realImport.noSource")}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
