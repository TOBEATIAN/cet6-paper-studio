import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Heart, X } from "lucide-react";
import { useConfigStore } from "../../stores/configStore";
import { iconBtn, primaryBtn } from "../../lib/ui/styles";

export function DonateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useConfigStore((state) => state.config.settings);
  const releaseSupportUrl = (
    import.meta.env.VITE_SUPPORT_PAGE_URL as string | undefined
  )?.trim();
  const supportUrl = releaseSupportUrl || settings.supportUrl.trim();
  const safeSupportUrl = isSafeExternalUrl(supportUrl) ? supportUrl : "";

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("donate.title")}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-rose-500/10 text-rose-500">
              <Heart className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("donate.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {settings.supportNote || t("donate.defaultNote")}
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
        </div>

        <div className="mt-6 rounded-lg border border-border bg-muted/20 p-5 text-center">
          {safeSupportUrl ? (
            <>
              <p className="text-base font-semibold">
                {t("donate.afdianTitle")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {t("donate.afdianHint")}
              </p>
              <button
                type="button"
                className={`${primaryBtn} mt-5`}
                onClick={() => void openUrl(safeSupportUrl)}
              >
                <ExternalLink className="h-4 w-4" />
                {t("donate.openAfdian")}
              </button>
              <p className="mt-3 break-all text-xs text-muted-foreground">
                {safeSupportUrl}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold">
                {t("donate.pageNotConfigured")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {t("donate.pageNotConfiguredHint")}
              </p>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t("donate.noPaywall")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function isSafeExternalUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
