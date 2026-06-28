import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

// Friendly, no-pressure "chip in via Swish" card. The Swish number lives in the DB
// (app_config row, served via the get_support_swish RPC) — never in the public repo.
// If it isn't set, the card simply doesn't render.
export function SupportCard() {
  const { t } = useI18n();
  const [number, setNumber] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("get_support_swish");
        if (!cancelled) setNumber(((data as string | null) ?? "").trim());
      } catch {
        /* not configured yet — card stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!number) return null;

  function copy() {
    navigator.clipboard?.writeText(number).then(() => toast.success(t("support.copied"))).catch(() => {});
  }

  return (
    <div className="ccard p-4 space-y-1.5" style={{ background: "var(--cream2)" }}>
      <div className="font-extrabold">💛 {t("support.title")}</div>
      <div className="text-sm text-[var(--ink)]/70">{t("support.blurb")}</div>
      {revealed ? (
        <button type="button" className="font-extrabold text-lg tracking-wide text-left" onClick={copy}>
          📱 {number} <span className="text-sm">📋</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="font-extrabold rounded-full border-2 border-[var(--ink)] px-4 py-2 text-sm"
          style={{ background: "var(--green-pop)", color: "var(--ink)" }}
        >
          {t("support.reveal")} 💛
        </button>
      )}
    </div>
  );
}
