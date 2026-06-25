import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyGameHistory } from "@/lib/games";
import { weeklyStreak } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export function StreakCard() {
  const { t } = useI18n();
  const [s, setS] = useState<{ weeks: number; playedThisWeek: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const hist = await fetchMyGameHistory(u.user.id, 150);
      setS(weeklyStreak(hist.map((g) => g.played_at)));
    })();
  }, []);

  // Only show once there's an active streak — no zero-state nudge cluttering /me.
  if (!s || s.weeks < 1) return null;

  return (
    <div className="ccard p-4 flex items-center gap-3" style={{ background: "var(--cream2)" }}>
      <div className="text-3xl leading-none">🔥</div>
      <div>
        <div className="font-display text-xl leading-tight">{t("streak.weeks", { n: s.weeks })}</div>
        <div className="text-sm text-[var(--ink)]/70">
          {s.playedThisWeek ? t("streak.safe") : t("streak.keep")}
        </div>
      </div>
    </div>
  );
}
