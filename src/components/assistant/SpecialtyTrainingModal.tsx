import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Sparkles, X } from "lucide-react";
import {
  CET6_CONTENT_STAGES,
  type Cet6ContentStage,
  type SpecialtyStageTopics,
} from "../../lib/types/cet";
import type { Cet6GenerationScope } from "../../lib/types/cet";
import { useConfigStore } from "../../stores/configStore";
import { inputCls, primaryBtn, secondaryBtn } from "../../lib/ui/styles";
import { stageLabelKey } from "../../lib/i18n/stageLabel";

interface SpecialtyTrainingModalProps {
  onClose: () => void;
  onStart: (scope: Cet6GenerationScope) => Promise<void>;
}

export function SpecialtyTrainingModal({
  onClose,
  onStart,
}: SpecialtyTrainingModalProps) {
  const { t } = useTranslation();
  const settings = useConfigStore((state) => state.config.settings.specialtyTraining);
  const updateSettings = useConfigStore((state) => state.updateSettings);
  const [selected, setSelected] = useState<Cet6ContentStage[]>(
    settings.selectedStages,
  );
  const [stageTopics, setStageTopics] = useState<SpecialtyStageTopics>(
    settings.stageTopics,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function toggle(stage: Cet6ContentStage) {
    setSelected((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...CET6_CONTENT_STAGES.filter((item) => item === stage || current.includes(item))],
    );
  }

  async function start() {
    if (selected.length === 0) {
      setError(t("specialty.emptySelection"));
      return;
    }
    setStarting(true);
    setError("");
    try {
      await updateSettings({
        specialtyTraining: {
          selectedStages: selected,
          focusTopic: "",
          stageTopics,
        },
      });
      await onStart({
        mode: "specialty",
        selectedStages: selected,
        stageTopics,
        focusTopic: "",
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.unknown"));
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("specialty.title")}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("specialty.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("specialty.description")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("specialty.cancel")}
            title={t("specialty.cancel")}
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">
            {t("specialty.stagesLabel")}
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CET6_CONTENT_STAGES.map((stage) => {
              const active = selected.includes(stage);
              return (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(stage)}
                  className={[
                    "flex min-h-10 items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  <span>{t(stageLabelKey(stage))}</span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 space-y-3">
          {selected.map((stage) => (
            <div key={stage} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">{t(stageLabelKey(stage))}</p>
              {stage === "reading-c" ? (
                <label className="mt-2 block text-xs text-muted-foreground">
                  {t("specialty.readingSingleTopic")}
                  <input
                    value={stageTopics["reading-c"].first}
                    onChange={(event) => {
                      const topic = event.target.value;
                      setStageTopics((current) => ({
                        ...current,
                        "reading-c": {
                          first: topic,
                          second: "Not selected",
                        },
                      }));
                    }}
                    placeholder={t("specialty.randomIfEmpty")}
                    className={`${inputCls} mt-1 w-full`}
                    maxLength={120}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("specialty.readingSingleHint")}
                  </span>
                </label>
              ) : (
                <input
                  value={stageTopics[stage] as string}
                  onChange={(event) => {
                    const topic = event.target.value;
                    setStageTopics((current) => ({
                      ...current,
                      [stage]: topic,
                    }));
                  }}
                  placeholder={t("specialty.randomIfEmpty")}
                  aria-label={t("specialty.topicForStage", {
                    stage: t(stageLabelKey(stage)),
                  })}
                  className={`${inputCls} mt-2 w-full`}
                  maxLength={120}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            {t("specialty.cancel")}
          </button>
          <button
            type="button"
            disabled={starting}
            onClick={() => void start()}
            className={primaryBtn}
          >
            <Sparkles className="h-4 w-4" />
            {starting ? t("specialty.starting") : t("specialty.start")}
          </button>
        </div>
      </section>
    </div>
  );
}
