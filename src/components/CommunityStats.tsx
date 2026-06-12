import { useEffect, useState } from "react";
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
const QUIET_EN = "Quiet week. Be the spark 🎾";
const QUIET_SV = "Lugn vecka. Tänd gnistan 🎾";

export function CommunityStatsWidget({ city }: { city: string }) {
  const { t, lang } = useI18n();
  const [s, setS] = useState<CommunityStats | null>(null);
  const [tagline] = useState<string>(() => {
    const arr = lang === "sv" ? TAGLINES_SV : TAGLINES_EN;
    return arr[Math.floor(Math.random() * arr.length)].replace("{city}", city);
  });

  useEffect(() => { fetchCommunityStats(city).then(setS); }, [city]);

  if (!s) return null;
  const allZero = s.sets_saved === 0 && s.games_matched === 0 && s.new_buddies === 0;

  return (
    <div className="ccard p-4 space-y-2">
      <div className="csection-label">{t("stats.this_week_in", { city })}</div>
      {allZero ? (
        <>
          <div className="font-display text-2xl leading-tight">
            🎾 {t("stats.all_time", { n: s.all_time_games, city })}
          </div>
          <div className="text-base font-semibold italic">
            {lang === "sv" ? QUIET_SV : QUIET_EN}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <div className="font-extrabold text-lg">🚑 {t("stats.sets_saved", { n: s.sets_saved })}</div>
            <div className="font-extrabold text-lg">🎾 {t("stats.games_matched", { n: s.games_matched })}</div>
            {s.new_buddies > 0 && (
              <div className="font-extrabold text-lg">🤝 {t("stats.new_buddies", { n: s.new_buddies })}</div>
            )}
          </div>
          <div className="text-sm font-semibold">
            {t("stats.all_time", { n: s.all_time_games, city })}
          </div>
          <div className="text-base font-semibold italic">{tagline}</div>
        </>
      )}
    </div>
  );
}