import { createFileRoute, Link } from "@tanstack/react-router";
import { LogGameCard } from "@/components/LogGameCard";
import { GamesHistory } from "@/components/GamesHistory";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Match history — Courtship" }] }),
  component: MatchesPage,
});

function MatchesPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl">{t("matches.title")}</h1>
      <LogGameCard />
      <GamesHistory />
    </div>
  );
}
