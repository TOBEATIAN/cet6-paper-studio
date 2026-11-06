import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AudioLines,
  FlaskConical,
  KeyRound,
  Loader2,
  Save,
  Volume2,
} from "lucide-react";
import { useConfigStore } from "../../stores/configStore";
import {
  TTS_SPEECH_RATE_MAX,
  TTS_SPEECH_RATE_MIN,
  TTS_PROVIDERS,
  type TtsProvider,
  type TtsSettings,
} from "../../lib/types/config";
import { inputCls, primaryBtn, secondaryBtn } from "../../lib/ui/styles";
import { SecretInput } from "../ui/SecretInput";
import { testTtsConnection } from "../../lib/storage/tauri";
import { ttsConnectionProbe } from "../../lib/tts/audio";

export function TtsSection() {
  const { t } = useTranslation();
  const settings = useConfigStore((s) => s.config.settings.tts);
  const updateSettings = useConfigStore((s) => s.updateSettings);
  const updateTtsApiKey = useConfigStore((s) => s.updateTtsApiKey);
  const getTtsApiKey = useConfigStore((s) => s.getTtsApiKey);
  const [draft, setDraft] = useState<TtsSettings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  const keyProvider =
    draft.activeProvider === "aliyun"
      ? "aliyun"
      : draft.activeProvider === "mimo"
        ? "mimo"
        : draft.activeProvider === "siliconflow"
          ? "siliconflow"
      : draft.activeProvider === "openai-compatible"
        ? "local"
        : null;

  useEffect(() => {
    setApiKey("");
    setKeyConfigured(false);
    if (keyProvider) {
      void getTtsApiKey(keyProvider).then((key) => {
        setKeyConfigured(Boolean(key));
        setApiKey(key ?? "");
      });
    }
  }, [getTtsApiKey, keyProvider]);

  function patch(patchValue: Partial<TtsSettings>) {
    setDraft((current) => ({ ...current, ...patchValue }));
    setStatus("");
  }

  async function saveSettings() {
    await updateSettings({ tts: draft });
    setStatus(t("tts.saved"));
  }

  async function saveKey() {
    if (!keyProvider || !apiKey.trim()) return;
    await updateTtsApiKey(keyProvider, apiKey.trim());
    setKeyConfigured(true);
    setStatus(t("tts.keySaved"));
  }

  async function testConnection() {
    setTesting(true);
    setStatus("");
    try {
      await testTtsConnection(ttsConnectionProbe(draft, apiKey));
      setStatus(t("tts.connectionOk"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(
        `${t("tts.connectionFailed")} ${message.slice(0, 240)}`.trim(),
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-md border border-border bg-background">
        <SettingRow
          icon={<AudioLines className="h-4 w-4" />}
          label={t("tts.provider")}
        >
          <select
            value={draft.activeProvider}
            onChange={(event) =>
              patch({
                activeProvider: event.currentTarget.value as TtsProvider,
              })
            }
            className={`${inputCls} h-9 min-w-56 py-1`}
          >
            {TTS_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {t(`tts.providerName.${provider}`)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          icon={<Volume2 className="h-4 w-4" />}
          label={t("tts.targetWpm")}
        >
          <div className="flex w-full max-w-sm items-center gap-3">
            <input
              type="range"
              min={TTS_SPEECH_RATE_MIN}
              max={TTS_SPEECH_RATE_MAX}
              step={1}
              value={draft.targetWpm}
              onChange={(event) =>
                patch({ targetWpm: Number(event.currentTarget.value) })
              }
              className="min-w-0 flex-1 accent-primary"
            />
            <span className="w-20 text-right font-medium">
              {draft.targetWpm} wpm
            </span>
          </div>
        </SettingRow>
      </section>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {t("tts.speedHint")}
      </p>

      {draft.activeProvider === "aliyun" && (
        <ProviderPanel
          title={t("tts.providerName.aliyun")}
          description={t("tts.aliyunHint")}
        >
          <Field
            label={t("tts.baseUrl")}
            value={draft.aliyunBaseUrl}
            onChange={(aliyunBaseUrl) => patch({ aliyunBaseUrl })}
          />
          <Field
            label={t("tts.model")}
            value={draft.aliyunModel}
            onChange={(aliyunModel) => patch({ aliyunModel })}
          />
          <Field
            label={t("tts.femaleVoice")}
            value={draft.aliyunFemaleVoice}
            onChange={(aliyunFemaleVoice) => patch({ aliyunFemaleVoice })}
          />
          <Field
            label={t("tts.maleVoice")}
            value={draft.aliyunMaleVoice}
            onChange={(aliyunMaleVoice) => patch({ aliyunMaleVoice })}
          />
        </ProviderPanel>
      )}

      {draft.activeProvider === "kitten" && (
        <ProviderPanel
          title={t("tts.providerName.kitten")}
          description={t("tts.kittenHint")}
        >
          <Field
            label={t("tts.femaleVoice")}
            value={draft.kittenFemaleVoice}
            onChange={(kittenFemaleVoice) => patch({ kittenFemaleVoice })}
          />
          <Field
            label={t("tts.maleVoice")}
            value={draft.kittenMaleVoice}
            onChange={(kittenMaleVoice) => patch({ kittenMaleVoice })}
          />
        </ProviderPanel>
      )}

      {draft.activeProvider === "mimo" && (
        <ProviderPanel
          title={t("tts.providerName.mimo")}
          description={t("tts.mimoHint")}
        >
          <Field
            label={t("tts.baseUrl")}
            value={draft.mimoBaseUrl}
            onChange={(mimoBaseUrl) => patch({ mimoBaseUrl })}
          />
          <Field
            label={t("tts.model")}
            value={draft.mimoModel}
            onChange={(mimoModel) => patch({ mimoModel })}
          />
          <Field
            label={t("tts.femaleVoice")}
            value={draft.mimoFemaleVoice}
            onChange={(mimoFemaleVoice) => patch({ mimoFemaleVoice })}
          />
          <Field
            label={t("tts.maleVoice")}
            value={draft.mimoMaleVoice}
            onChange={(mimoMaleVoice) => patch({ mimoMaleVoice })}
          />
        </ProviderPanel>
      )}

      {draft.activeProvider === "siliconflow" && (
        <ProviderPanel
          title={t("tts.providerName.siliconflow")}
          description={t("tts.siliconflowHint")}
        >
          <Field
            label={t("tts.baseUrl")}
            value={draft.siliconflowBaseUrl}
            onChange={(siliconflowBaseUrl) => patch({ siliconflowBaseUrl })}
          />
          <Field
            label={t("tts.model")}
            value={draft.siliconflowModel}
            onChange={(siliconflowModel) => patch({ siliconflowModel })}
          />
          <Field
            label={t("tts.femaleVoice")}
            value={draft.siliconflowFemaleVoice}
            onChange={(siliconflowFemaleVoice) =>
              patch({ siliconflowFemaleVoice })
            }
          />
          <Field
            label={t("tts.maleVoice")}
            value={draft.siliconflowMaleVoice}
            onChange={(siliconflowMaleVoice) =>
              patch({ siliconflowMaleVoice })
            }
          />
        </ProviderPanel>
      )}

      {draft.activeProvider === "openai-compatible" && (
        <ProviderPanel
          title={t("tts.providerName.openai-compatible")}
          description={t("tts.localHint")}
        >
          <Field
            label={t("tts.baseUrl")}
            value={draft.localBaseUrl}
            onChange={(localBaseUrl) => patch({ localBaseUrl })}
          />
          <Field
            label={t("tts.model")}
            value={draft.localModel}
            onChange={(localModel) => patch({ localModel })}
          />
          <Field
            label={t("tts.femaleVoice")}
            value={draft.localFemaleVoice}
            onChange={(localFemaleVoice) => patch({ localFemaleVoice })}
          />
          <Field
            label={t("tts.maleVoice")}
            value={draft.localMaleVoice}
            onChange={(localMaleVoice) => patch({ localMaleVoice })}
          />
        </ProviderPanel>
      )}

      {(keyProvider || draft.activeProvider === "kitten") && (
        <section className="rounded-md border border-border bg-background p-4">
          <p className="flex items-center gap-2 font-medium">
            {keyProvider ? (
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AudioLines className="h-4 w-4 text-muted-foreground" />
            )}
            {keyProvider ? t("tts.apiKey") : t("tts.localRuntime")}
            {keyConfigured && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                {t("settings.apiKeyConfigured")}
              </span>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            {keyProvider && (
              <>
                <SecretInput
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={t("tts.apiKeyHint")}
                />
                <button
                  type="button"
                  disabled={!apiKey.trim()}
                  onClick={() => void saveKey()}
                  className={secondaryBtn}
                >
                  <Save className="h-4 w-4" />
                  {t("settings.save")}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={
                testing ||
                ((keyProvider === "aliyun" || keyProvider === "mimo") &&
                  !apiKey.trim()) ||
                (keyProvider === "siliconflow" && !apiKey.trim())
              }
              onClick={() => void testConnection()}
              className={secondaryBtn}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              {t("settings.testConnection")}
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {status && (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            {status}
          </span>
        )}
        <button
          type="button"
          onClick={() => void saveSettings()}
          className={primaryBtn}
        >
          <Save className="h-4 w-4" />
          {t("tts.saveSettings")}
        </button>
      </div>
    </div>
  );
}

function ProviderPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`${inputCls} h-9 py-1 text-xs`}
      />
    </label>
  );
}

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:items-center">
      <span className="inline-flex items-center gap-2 font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <span className="flex min-w-0 justify-start sm:justify-end">{children}</span>
    </div>
  );
}
