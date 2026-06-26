import { createFileRoute, Link } from "@tanstack/react-router";
import { SupportCard } from "@/components/SupportCard";
import { SUPPORT_WA } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help — Courtship" }] }),
  component: HelpPage,
});

function HelpPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl">{t("help.title")}</h1>

      <div className="ccard p-4 space-y-2">
        <div className="font-display text-xl">{t("help.feedback_title")}</div>
        <div className="text-sm font-semibold" style={{ color: "var(--ink)", opacity: 0.65 }}>{t("help.feedback_sub")}</div>
        <button
          onClick={() => {
            try {
              window.open(`https://wa.me/${SUPPORT_WA.replace(/[^\d]/g, "")}?text=${encodeURIComponent(t("feedback.prefill"))}`, "_blank");
            } catch {
              /* ignore */
            }
          }}
          className="cbtn cbtn-green w-full"
        >
          {t("help.message_us")}
        </button>
      </div>

      <SupportCard />
    </div>
  );
}
