import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyGameHistory } from "@/lib/games";
import { activityTier, rescuerTier, recruiterTier, matchmakerTier, weeklyStreak } from "@/lib/courtship";
import { CourtsPassport } from "@/components/CourtsPassport";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Your season — Courtship" }] }),
  component: ProgressPage,
});

type Tier = { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null;

const TRACK_META: Record<string, { emoji: string; key: string }> = {
  activity: { emoji: "🎾", key: "prog.track_activity" },
  rescuer: { emoji: "🚑", key: "prog.track_rescuer" },
  recruiter: { emoji: "🤝", key: "prog.track_recruiter" },
  matchmaker: { emoji: "🎪", key: "prog.track_matchmaker" },
};

function mondayOf(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x.getTime();
}

// games per ISO-week for the last n weeks (DST-safe stepping); last entry = current week
function weekBuckets(dates: string[], n = 10): number[] {
  const counts = new Map<number, number>();
  for (const s of dates) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const k = mondayOf(d);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const weeks: number[] = [];
  let cur = mondayOf(new Date());
  for (let i = 0; i < n; i++) {
    weeks.unshift(cur);
    const d = new Date(cur);
    d.setDate(d.getDate() - 7);
    cur = mondayOf(d);
  }
  return weeks.map((wk) => counts.get(wk) || 0);
}

function ProgressPage() {
  const { t } = useI18n();
  const [games, setGames] = useState(0);
  const [rescues, setRescues] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [hosted, setHosted] = useState(0);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("games_played,rescues_count,referrals_count")
        .eq("id", u.user.id)
        .maybeSingle();
      if (prof) {
        setGames(prof.games_played ?? 0);
        setRescues(prof.rescues_count ?? 0);
        setReferrals(prof.referrals_count ?? 0);
      }
      try {
        const { count } = await (supabase as any)
          .from("sos_requests")
          .select("id", { count: "exact", head: true })
          .eq("caller_id", u.user.id)
          .eq("kind", "open");
        setHosted(count ?? 0);
      } catch {
        /* ignore */
      }
      const hist = await fetchMyGameHistory(u.user.id, 200);
      setDates(hist.map((g) => g.played_at));
    })();
  }, []);

  const tracks: { track: string; tier: Tier; count: number }[] = [
    { track: "activity", tier: activityTier(games), count: games },
    { track: "rescuer", tier: rescuerTier(rescues), count: rescues },
    { track: "recruiter", tier: recruiterTier(referrals), count: referrals },
    { track: "matchmaker", tier: matchmakerTier(hosted), count: hosted },
  ];

  const streak = weeklyStreak(dates);
  const bars = weekBuckets(dates, 10);
  const maxBar = Math.max(...bars, 1);

  // closest rank-up = the started track with the smallest gap to its next tier
  const closest = tracks
    .filter((x) => x.tier && x.tier.next != null)
    .map((x) => ({ ...x, toNext: (x.tier!.next as number) - x.count, span: (x.tier!.next as number) - x.tier!.at }))
    .sort((a, b) => a.toNext - b.toNext)[0];

  async function share() {
    const top = tracks.filter((x) => x.tier).sort((a, b) => (b.tier!.level - a.tier!.level))[0];
    const bits = [
      streak.weeks >= 1 ? t("prog.share_streak", { n: streak.weeks }) : "",
      top ? `${top.tier!.emoji} ${top.tier!.name}` : "",
    ].filter(Boolean);
    const text = `${bits.join(" · ")} — ${t("prog.share_tag")}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success(t("prog.copied"));
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl leading-none">{t("prog.title")}</h1>

      {/* weekly pulse hero */}
      <div className="ccard p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display text-3xl">{streak.weeks}</span>
            <span className="font-extrabold text-xs leading-tight" style={{ color: "var(--wood, #8a6d3b)" }}>
              {t("prog.week_streak")}
            </span>
          </div>
          {streak.weeks >= 1 && (
            <span
              className="font-extrabold text-xs px-2.5 py-1 rounded-full"
              style={{ background: "var(--green-pop)", border: "1px solid var(--ink)" }}
            >
              {streak.playedThisWeek ? t("streak.safe") : t("streak.keep")}
            </span>
          )}
        </div>
        <div className="flex items-end gap-1.5 mt-3" style={{ height: 64 }}>
          {bars.map((v, i) => {
            const isNow = i === bars.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  style={{
                    width: "100%",
                    height: Math.max(6, (v / maxBar) * 52),
                    borderRadius: 4,
                    border: "1.5px solid var(--ink)",
                    background: isNow ? "var(--coral)" : v ? "var(--green-pop)" : "var(--cream2)",
                  }}
                />
                <span className="text-[8px] font-extrabold" style={{ color: isNow ? "var(--coral)" : "var(--ink)" }}>
                  {isNow ? t("prog.now") : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-xs font-bold text-center mt-1" style={{ color: "var(--ink)", opacity: 0.6 }}>
          {t("prog.per_week")}
        </div>
      </div>

      {/* closest rank-up */}
      {closest && (
        <div>
          <div className="csection-label">{t("prog.closest")}</div>
          <div className="ccard p-4 flex items-center gap-3 mt-2">
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 56, height: 56, background: "var(--green-pop)", border: "2px solid var(--ink)" }}
            >
              <span style={{ fontSize: 28 }}>{closest.tier!.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg leading-tight">
                {closest.tier!.name} → {closest.tier!.nextName}
              </div>
              <div className="mt-2 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)" }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(6, ((closest.count - closest.tier!.at) / Math.max(1, closest.span)) * 100))}%`,
                    height: "100%",
                    background: "var(--coral)",
                  }}
                />
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: "var(--ink)", opacity: 0.65 }}>
                {t("prog.to_go", { n: closest.toNext })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* all four ranks */}
      <div>
        <div className="csection-label">{t("prog.all_ranks")}</div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {tracks.map((x) => {
            const meta = TRACK_META[x.track];
            const started = !!x.tier;
            return (
              <div key={x.track} className="ccard p-2 flex flex-col items-center text-center gap-1">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 46,
                    height: 46,
                    background: started ? "var(--green-pop)" : "var(--cream2)",
                    border: "2px solid var(--ink)",
                    opacity: started ? 1 : 0.55,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{started ? x.tier!.emoji : meta.emoji}</span>
                </div>
                <div className="font-extrabold text-[11px] leading-tight">{started ? x.tier!.name : t("prog.not_yet")}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--wood, #8a6d3b)" }}>
                  {t(meta.key)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CourtsPassport />

      <button type="button" onClick={share} className="cbtn cbtn-coral w-full" style={{ padding: "13px 0", fontSize: 16 }}>
        📲 {t("prog.share")}
      </button>
    </div>
  );
}
