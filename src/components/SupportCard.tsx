import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

// Friendly, no-pressure "chip in via Swish" card. The Swish number lives in an env
// var (VITE_SUPPORT_SWISH) so it never sits in the public repo; if it's unset, the
// card simply doesn't render.
export function SupportCard() {
  const { t } = useI18n();
  const number = ((import.meta.env.VITE_SUPPORT_SWISH as string | undefined) ?? "").trim();
  if (!number) return null;

  function copy() {
    navigator.clipboard?.writeText(number).then(() => toast.success(t("support.copied"))).catch(() => {});
  }

  return (
    <div className="ccard p-4 space-y-1.5" style={{ background: "var(--cream2)" }}>
      <div className="font-extrabold">💛 {t("support.title")}</div>
      <div className="text-sm text-[var(--ink)]/70">{t("support.blurb")}</div>
      <button type="button" className="font-extrabold text-lg tracking-wide text-left" onClick={copy}>
        📱 {number} <span className="text-sm">📋</span>
      </button>
      <div className="text-xs text-[var(--ink)]/60">{t("support.note")}</div>
    </div>
  );
}
