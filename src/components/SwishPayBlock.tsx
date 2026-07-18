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
  const [open, setOpen] = useState(false);
  function payNow() {
    setOpen(true);
    openSwish();
  }
  return (
    <div className="space-y-2">
      {/* Primary, consumer-standard: one Pay button. Details reveal quietly under it. */}
      <button type="button" onClick={payNow} className="cbtn cbtn-green w-full">
        💸 {t("swish.pay_cta", { amount: amountSek })}
      </button>
      {open && (
        <div className="space-y-1.5" style={{ border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, background: "rgba(253,249,238,0.6)", padding: "10px 12px" }}>
          <Row label={t("swish.number")} value={`📱 ${number}`} onCopy={() => copy(number, "num")} done={done === "num"} />
          <Row label={t("swish.amount")} value={`${amountSek} SEK`} />
          <Row label={t("swish.message")} value={message} onCopy={() => copy(message, "msg")} done={done === "msg"} />
          <div className="text-xs font-semibold" style={{ color: "rgba(43,33,24,0.6)" }}>{t("swish.confirm_note")}</div>
          <button type="button" onClick={openSwish} className="font-extrabold underline text-sm">📲 {t("swish.open")}</button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, onCopy, done }: { label: string; value: string; onCopy?: () => void; done?: boolean }) {
  const inner = (
    <>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(43,33,24,0.5)", flexShrink: 0 }}>{label}</span>
      <span className="font-extrabold text-right" style={{ fontSize: 15, minWidth: 0, overflowWrap: "anywhere" }}>{value}{onCopy ? <span className="ml-2 text-sm">{done ? "✓" : "📋"}</span> : null}</span>
    </>
  );
  return onCopy ? (
    <button type="button" onClick={onCopy} className="w-full flex items-center justify-between gap-3 text-left">{inner}</button>
  ) : (
    <div className="flex items-center justify-between gap-3">{inner}</div>
  );
}
