import { createFileRoute, Link } from "@tanstack/react-router";
import { SeasonPanel } from "@/components/SeasonPanel";
import { CourtsPassport } from "@/components/CourtsPassport";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Your season — Courtship" }] }),
  component: ProgressPage,
});

function ProgressPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl leading-none">{t("prog.title")}</h1>
      <SeasonPanel showShare />
      <CourtsPassport />
    </div>
  );
}
