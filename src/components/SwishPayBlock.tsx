import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/** Manual Swish payment block — number + amount + message, all copyable.
 *  This is the reliable path for PERSONAL Swish numbers: the app.swish.nu
 *  prefilled deep link only works for merchant (Handel) numbers and is
 *  rejected ("Incorrect link") for personal ones, so we don't use it. */
export function SwishPayBlock({ number, amountSek, message }: { number: string; amountSek: number; message: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState<string | null>(null);
  function copy(text: string, which: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { setDone(which); toast.success(t("swish.copied")); setTimeout(() => setDone(null), 1500); }).catch(() => {});
  }
  function openSwish() {
    // Put the message on the clipboard first so it's ready to paste in Swish.
    navigator.clipboard?.writeText(message).catch(() => {});
    toast.info(t("swish.opening"));
    const store = "https://apps.apple.com/se/app/swish-betalningar/id563204724";
    const t0 = Date.now();
    // If the Swish app is installed the scheme handles it and the tab blurs;
    // otherwise, after a moment, send them to the store.
    const fallback = window.setTimeout(() => {
      if (Date.now() - t0 < 2200) window.location.href = store;
    }, 1400);
    const clear = () => window.clearTimeout(fallback);
    window.addEventListener("blur", clear, { once: true });
    window.addEventListener("pagehide", clear, { once: true });
    window.location.href = "swish://";
  }
  return (
    <div className="ccard p-3 space-y-2" style={{ background: "var(--cream2)" }}>
      <div className="font-extrabold">{t("swish.pay_title")}</div>
      <button type="button" onClick={() => copy(number, "num")}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left" style={{ background: "var(--cream)", border: "2px solid var(--ink)" }}>
        <span><span className="text-xs font-bold uppercase tracking-wide opacity-60 block">{t("swish.number")}</span><span className="font-extrabold text-lg tracking-wide">📱 {number}</span></span>
        <span className="text-sm font-extrabold shrink-0">{done === "num" ? "✓" : "📋"}</span>
      </button>
      <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--cream)", border: "2px solid var(--ink)" }}>
        <span className="text-xs font-bold uppercase tracking-wide opacity-60">{t("swish.amount")}</span>
        <span className="font-extrabold text-lg">{amountSek} SEK</span>
      </div>
      <button type="button" onClick={() => copy(message, "msg")}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left" style={{ background: "var(--cream)", border: "2px solid var(--ink)" }}>
        <span className="min-w-0"><span className="text-xs font-bold uppercase tracking-wide opacity-60 block">{t("swish.message")}</span><span className="font-extrabold">✏️ {message}</span></span>
        <span className="text-sm font-extrabold shrink-0">{done === "msg" ? "✓" : "📋"}</span>
      </button>
      <button type="button" onClick={openSwish} className="cbtn cbtn-coral w-full">
        📲 {t("swish.open")}
      </button>
      <div className="text-xs text-[var(--ink)] opacity-70">{t("swish.confirm_note")}</div>
    </div>
  );
}
