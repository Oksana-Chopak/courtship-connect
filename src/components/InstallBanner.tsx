import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { subscribeToPush } from "@/lib/push";

const DISMISS_KEY = "courtship.install.dismissed_at";
const WEEK_MS = 7 * 24 * 3600 * 1000;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function InstallBanner() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || "0");
      if (at && Date.now() - at < WEEK_MS) return;
    } catch {}
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", handler);
    if (isIOS()) setShow(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
    setIosOpen(false);
  }

  function copyLink() {
    try {
      navigator.clipboard?.writeText(window.location.origin);
      toast.success(t("install.link_copied"));
    } catch {}
  }

  async function install() {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {}
      setDeferred(null);
      dismiss();
    } else if (isIOS()) {
      setIosOpen(true);
    }
  }

  if (!show) return null;

  return (
    <>
      <div className="ccard p-4 space-y-3" style={{ background: "var(--cream2)", borderColor: "var(--coral)" }}>
        <div className="font-display text-2xl leading-tight">{t("install.title")}</div>
        <div className="text-base text-[var(--ink)] font-semibold">{t("install.sub")}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={install} className="cbtn cbtn-coral">
            {deferred ? t("install.install") : t("install.show_me")}
          </button>
          <button onClick={dismiss} className="cbtn cbtn-ghost">{t("install.dismiss")}</button>
        </div>
      </div>

      {iosOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setIosOpen(false)}>
          <div className="ccard p-5 max-w-md w-full space-y-4 bg-[var(--cream)]" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-3xl">{t("install.ios_title")}</div>
            <div className="ccard p-3 space-y-2" style={{ background: "var(--cream2)", borderColor: "var(--coral)" }}>
              <div className="font-extrabold">{t("install.ios_safari_warn")}</div>
              <div className="text-sm text-[var(--ink)]">{t("install.ios_safari_sub")}</div>
              <button onClick={copyLink} className="cbtn cbtn-coral w-full">{t("install.copy_link")}</button>
            </div>
            <ol className="space-y-3 text-lg font-semibold">
              <li><span className="font-display text-2xl mr-2">1.</span>{t("install.ios_step1")}</li>
              <li><span className="font-display text-2xl mr-2">2.</span>{t("install.ios_step2")}</li>
              <li><span className="font-display text-2xl mr-2">3.</span>{t("install.ios_step3")}</li>
            </ol>
            <button onClick={dismiss} className="cbtn cbtn-green w-full">{t("install.ios_close")}</button>
          </div>
        </div>
      )}
    </>
  );
}

const NOTIF_KEY = "courtship.notif.asked";
export function StandaloneNotifPrompt() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try { if (localStorage.getItem(NOTIF_KEY)) return; } catch {}
    if (isStandalone()) { setShow(true); return; }
    // Browser case: only where web push actually works (not iOS Safari, which
    // needs the installed PWA), and only once the install nudge has been
    // dismissed — so the two banners never stack.
    if (isIOS()) return;
    let installDismissed = false;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || "0");
      installDismissed = !!at && Date.now() - at < WEEK_MS;
    } catch {}
    if (installDismissed) setShow(true);
  }, []);
  function close() {
    try { localStorage.setItem(NOTIF_KEY, "1"); } catch {}
    setShow(false);
  }
  async function enable() {
    // Requests permission AND registers a real Web Push subscription (prod only;
    // in preview/dev the SW is unregistered so this no-ops gracefully).
    try { await subscribeToPush(); } catch { /* best-effort */ }
    close();
  }
  if (!show) return null;
  return (
    <div className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
      <div className="font-display text-2xl leading-tight">{t("install.notif_title")}</div>
      <div className="text-base text-[var(--ink)] font-semibold">{t("install.notif_sub")}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={enable} className="cbtn cbtn-coral">{t("install.notif_yes")}</button>
        <button onClick={close} className="cbtn cbtn-ghost">{t("install.notif_skip")}</button>
      </div>
    </div>
  );
}