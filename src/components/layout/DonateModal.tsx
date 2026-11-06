import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Heart, Maximize2, X } from "lucide-react";
import { useConfigStore } from "../../stores/configStore";
import { iconBtn, primaryBtn } from "../../lib/ui/styles";
import {
  readDefaultDonationQr,
  readImageFile,
} from "../../lib/storage/tauri";

type DonationQrKind = "wechat" | "alipay";

export function DonateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useConfigStore((state) => state.config.settings);
  const [qrFailed, setQrFailed] = useState<Record<DonationQrKind, boolean>>({
    wechat: false,
    alipay: false,
  });
  const [qrSources, setQrSources] = useState<
    Record<DonationQrKind, string | null>
  >({ wechat: null, alipay: null });
  const [loadingQr, setLoadingQr] = useState(false);
  const [expandedQr, setExpandedQr] = useState<DonationQrKind | null>(null);
  const methods = (
    [
      {
        kind: "wechat" as const,
        path: settings.supportQrPath,
        label: t("donate.wechatQr"),
        alt: t("donate.wechatQrAlt"),
        enlargeLabel: t("donate.enlargeWechatQr"),
      },
      {
        kind: "alipay" as const,
        path: settings.supportAlipayQrPath,
        label: t("donate.alipayQr"),
        alt: t("donate.alipayQrAlt"),
        enlargeLabel: t("donate.enlargeAlipayQr"),
      },
    ] satisfies Array<{
      kind: DonationQrKind;
      path: string;
      label: string;
      alt: string;
      enlargeLabel: string;
    }>
  );
  const expandedMethod = methods.find(
    (method) => method.kind === expandedQr,
  );

  useEffect(() => {
    let canceled = false;
    const objectUrls: string[] = [];
    setQrFailed({ wechat: false, alipay: false });
    setExpandedQr(null);
    setQrSources({ wechat: null, alipay: null });
    const entries = [
      ["wechat", settings.supportQrPath],
      ["alipay", settings.supportAlipayQrPath],
    ] as const;
    setLoadingQr(true);

    void Promise.all(
      entries.map(async ([kind, path]) => {
        try {
          let bytes: Uint8Array;
          try {
            bytes = path
              ? await readImageFile(path)
              : await readDefaultDonationQr(kind);
          } catch (error) {
            if (!path) throw error;
            bytes = await readDefaultDonationQr(kind);
          }
          const url = URL.createObjectURL(
            new Blob(
              [bytes],
              { type: imageMime(path || `${kind}.jpg`) },
            ),
          );
          objectUrls.push(url);
          return [kind, url] as const;
        } catch {
          if (!canceled) {
            setQrFailed((current) => ({ ...current, [kind]: true }));
          }
          return [kind, null] as const;
        }
      }),
    ).then((loaded) => {
      if (canceled) return;
      setQrSources(
        Object.fromEntries(loaded) as Record<
          DonationQrKind,
          string | null
        >,
      );
      setLoadingQr(false);
    });

    return () => {
      canceled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [settings.supportQrPath, settings.supportAlipayQrPath]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("donate.title")}
        className="max-h-[94vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/10 text-rose-500">
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

        <div className="mt-5 grid min-h-56 place-items-center rounded-lg border border-dashed border-border bg-muted/25 p-4">
          {methods.length > 0 ? (
            <div className="grid w-full gap-4 md:grid-cols-2">
              {methods.map((method) => (
                <section
                  key={method.kind}
                  className="min-w-0 rounded-md border border-border bg-background p-3"
                >
                  <h3 className="mb-2 text-center text-sm font-semibold">
                    {method.label}
                  </h3>
                  {loadingQr ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      {t("donate.qrLoading")}
                    </p>
                  ) : qrSources[method.kind] && !qrFailed[method.kind] ? (
                    <button
                      type="button"
                      onClick={() => setExpandedQr(method.kind)}
                      className="group relative w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={method.enlargeLabel}
                    >
                      <img
                        src={qrSources[method.kind] ?? undefined}
                        alt={method.alt}
                        onError={() =>
                          setQrFailed((current) => ({
                            ...current,
                            [method.kind]: true,
                          }))
                        }
                        className="mx-auto max-h-[46vh] w-auto max-w-full rounded-md bg-white object-contain shadow-sm"
                      />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/65 px-2 py-1 text-xs text-white opacity-80 transition-opacity group-hover:opacity-100">
                        <Maximize2 className="h-3.5 w-3.5" />
                        {t("donate.clickToEnlarge")}
                      </span>
                    </button>
                  ) : (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {t("donate.qrLoadFailed")}
                      </p>
                      <p className="mt-2 leading-5">
                        {t("donate.qrLoadFailedHint")}
                      </p>
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">
                {t("donate.notConfigured")}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t("donate.configureHint")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t("donate.noPaywall")}
          </p>
          {settings.supportUrl.trim() ? (
            <button
              type="button"
              onClick={() => void openUrl(settings.supportUrl.trim())}
              className={primaryBtn}
            >
              <ExternalLink className="h-4 w-4" />
              {t("donate.openSupportPage")}
            </button>
          ) : null}
        </div>

        {expandedMethod && qrSources[expandedMethod.kind] && (
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t("donate.enlargedQr")}
            onClick={() => setExpandedQr(null)}
          >
            <button
              type="button"
              aria-label={t("settings.cancel")}
              onClick={() => setExpandedQr(null)}
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={qrSources[expandedMethod.kind] ?? undefined}
              alt={expandedMethod.alt}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[92vh] max-w-[92vw] rounded-md bg-white object-contain shadow-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function imageMime(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}
