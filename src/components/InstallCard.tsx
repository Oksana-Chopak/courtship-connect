import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

// A permanent, always-findable "how to install" reference for the Help page.
// Unlike InstallBanner (a transient, dismissable prompt on the board), this is
// a calm explainer the user can return to any time. Reuses the install.* keys.
export function InstallCard() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function copyLink() {
    try {
      navigator.clipboard?.writeText(window.location.origin);
      toast.success(t("install.link_copied"));
    } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    try { await deferred.prompt(); await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
  }

  return (
    <div className="ccard p-4 space-y-3">
      <div className="font-display text-xl">{t("install.help_title")}</div>
      <div className="text-sm font-semibold" style={{ color: "var(--ink)", opacity: 0.65 }}>
        {t("install.help_sub")}
      </div>

      {standalone ? (
        <div className="font-extrabold text-[var(--ink)]">{t("install.installed")}</div>
      ) : (
        <>
          {deferred && (
            <button onClick={install} className="cbtn cbtn-coral w-full">{t("install.install")}</button>
          )}
          <div className="ccard p-3 space-y-1" style={{ background: "var(--cream2)" }}>
            <div className="font-extrabold text-sm">{t("install.iphone_label")}</div>
            <div className="text-sm" style={{ color: "var(--ink)" }}>{t("install.iphone_steps")}</div>
          </div>
          <div className="ccard p-3 space-y-1" style={{ background: "var(--cream2)" }}>
            <div className="font-extrabold text-sm">{t("install.android_label")}</div>
            <div className="text-sm" style={{ color: "var(--ink)" }}>{t("install.android_steps")}</div>
          </div>
          <button onClick={copyLink} className="cbtn cbtn-ghost w-full">{t("install.copy_link")}</button>
        </>
      )}
    </div>
  );
}
