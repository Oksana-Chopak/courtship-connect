import { createFileRoute, Link } from "@tanstack/react-router";
import { LogGameCard } from "@/components/LogGameCard";
import { GamesHistory } from "@/components/GamesHistory";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Match history — Courtship" }] }),
  validateSearch: (s: Record<string, unknown>): { log?: boolean } => ({
    log: s.log === true || s.log === "1" ? true : undefined,
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const { t } = useI18n();
  const { log } = Route.useSearch();
  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl">{t("matches.title")}</h1>
      <LogGameCard defaultOpen={!!log} />
      <GamesHistory />
    </div>
  );
}
