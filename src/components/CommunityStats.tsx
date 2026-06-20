import { useEffect, useMemo, useState } from "react";
import { fetchCommunityStats, type CommunityStats } from "@/lib/sos";
import { useI18n } from "@/lib/i18n";

const TAGLINES_EN = [
  "Rock on, {city} 🤘",
  "{city} never plays alone.",
  "Keep the flares coming 🚨",
  "Love means nothing here. Games mean everything.",
];
const TAGLINES_SV = [
  "Kör hårt, {city} 🤘",
  "I {city} spelar ingen ensam.",
  "Fler nödraketer, tack 🚨",
];

export function CommunityStatsWidget({ city }: { city: string }) {
  const { t, lang } = useI18n();
  const [s, setS] = useState<CommunityStats | null>(null);

  useEffect(() => {
    fetchCommunityStats(city).then(setS);
  }, [city]);

  // Recompute with the city so the tagline never lags behind the header.
  const tagline = useMemo(() => {
    const arr = lang === "sv" ? TAGLINES_SV : TAGLINES_EN;
    return arr[Math.floor(Math.random() * arr.length)].replace("{city}", city);
  }, [city, lang]);

  if (!s) return null;
  // Only worth showing once there's real match activity — never advertise a wall of zeros.
  if (s.sets_saved === 0 && s.games_matched === 0) return null;

  const setsKey = s.sets_saved === 1 ? "stats.sets_saved_one" : "stats.sets_saved";
  const gamesKey = s.games_matched === 1 ? "stats.games_matched_one" : "stats.games_matched";
  const buddiesKey = s.new_buddies === 1 ? "stats.new_buddies_one" : "stats.new_buddies";

  return (
    <div className="ccard p-4 space-y-2">
      <div className="csection-label">{t("stats.this_week_in", { city })}</div>
      <div className="space-y-1">
        <div className="font-extrabold text-lg">🚑 {t(setsKey, { n: s.sets_saved })}</div>
        <div className="font-extrabold text-lg">🎾 {t(gamesKey, { n: s.games_matched })}</div>
        {s.new_buddies > 0 && (
          <div className="font-extrabold text-lg">🤝 {t(buddiesKey, { n: s.new_buddies })}</div>
        )}
      </div>
      <div className="text-sm font-semibold">{t("stats.all_time", { n: s.all_time_games, city })}</div>
      <div className="text-base font-semibold italic">{tagline}</div>
    </div>
  );
}
