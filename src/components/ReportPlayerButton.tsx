import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";

const REASONS = ["harassment", "fake", "inappropriate", "illegal", "other"] as const;

/** DSA art. 16 notice-and-action entry point: report a profile/content.
 *  Deliberately muted — a safety valve, not a feature to advertise. */
export function ReportPlayerButton({ targetId, targetName }: { targetId: string; targetName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("report_user", {
      _target: targetId,
      _reason: reason,
      _details: details || null,
    });
    setBusy(false);
    if (error) { toast.error(t("report.err")); return; }
    setOpen(false);
    setDetails("");
    toast.success(t("report.sent"));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-center text-sm font-extrabold underline"
        style={{ opacity: 0.55 }}
      >
        {t("report.btn")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }} onClick={() => !busy && setOpen(false)}>
          <div className="ccard p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="font-display text-2xl">{t("report.title", { name: targetName })}</div>
            <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("report.sub")}</p>
            <div>
              <label className="csection-label block mb-1">{t("report.reason_label")}</label>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)}
                    className={`cchip ${reason === r ? "cchip-on" : ""}`}>
                    {t(`report.r_${r}`)}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="cinput"
              rows={3}
              placeholder={t("report.details_ph")}
              value={details}
              maxLength={1000}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              <button onClick={send} disabled={busy} className="cbtn cbtn-ghost flex-1" style={{ color: "var(--coral)" }}>
                {busy ? "..." : t("report.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
