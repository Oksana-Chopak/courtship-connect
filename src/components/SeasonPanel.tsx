import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyGameHistory } from "@/lib/games";
import { activityTier, rescuerTier, recruiterTier, matchmakerTier, weeklyStreak, RANK_LADDERS } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";

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

/**
 * The whole "Your season" block — streak, weekly rhythm, closest rank-up and the
 * four rank tracks (each tappable for its ladder). Shared by /me (profile home)
 * and /progress so there's a single source of truth, no duplicated layout.
 */
export function SeasonPanel({ showShare = false }: { showShare?: boolean }) {
  const { t } = useI18n();
  const [games, setGames] = useState(0);
  const [rescues, setRescues] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [hosted, setHosted] = useState(0);
  const [dates, setDates] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openTrack, setOpenTrack] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const [profRes, hostedCount, hist] = await Promise.all([
        (supabase as any).from("profiles").select("games_played,rescues_count,referrals_count").eq("id", uid).maybeSingle().then((r: any) => r, () => null),
        (supabase as any).from("sos_requests").select("id", { count: "exact", head: true }).eq("caller_id", uid).eq("kind", "open").then((r: any) => r?.count ?? 0, () => 0),
        fetchMyGameHistory(uid, 200).catch(() => [] as any[]),
      ]);
      const prof = (profRes as any)?.data;
      if (prof) {
        setGames(prof.games_played ?? 0);
        setRescues(prof.rescues_count ?? 0);
        setReferrals(prof.referrals_count ?? 0);
      }
      setHosted((hostedCount as number) ?? 0);
      setDates((hist as any[]).map((g) => g.played_at));
      setLoaded(true);
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
  const hasActivity = games > 0 || rescues > 0 || referrals > 0 || hosted > 0 || dates.length > 0;

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
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast.success(t("prog.copied")); }
    } catch { /* cancelled */ }
  }

  if (!loaded) {
    return <div className="ccard p-6 text-center text-[var(--ink)]/60 font-semibold">{t("common.loading")}</div>;
  }

  // Ranks always show (a newcomer should see the four things they can grow); the
  // streak/rhythm blocks only appear once there's real activity.
  return (
    <div className="space-y-4">
      {streak.weeks >= 1 && (
        <div className="ccard p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <span className="font-display text-3xl">{streak.weeks}</span>
              <span className="font-extrabold text-xs leading-tight" style={{ color: "var(--wood, #8a6d3b)" }}>{t("prog.week_streak")}</span>
            </div>
            <span className="font-extrabold text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--green-pop)", border: "1px solid var(--ink)" }}>
              {streak.playedThisWeek ? t("streak.safe") : t("streak.keep")}
            </span>
          </div>
          {hasActivity && (
            <>
              <div className="flex items-end gap-1.5 mt-3" style={{ height: 64 }}>
                {bars.map((v, i) => {
                  const isNow = i === bars.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div style={{ width: "100%", height: Math.max(6, (v / maxBar) * 52), borderRadius: 4, border: "1.5px solid var(--ink)", background: isNow ? "var(--coral)" : v ? "var(--green-pop)" : "var(--cream2)" }} />
                      <span className="text-[8px] font-extrabold" style={{ color: isNow ? "var(--coral)" : "var(--ink)" }}>{isNow ? t("prog.now") : ""}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs font-bold text-center mt-1" style={{ color: "var(--ink)", opacity: 0.6 }}>{t("prog.per_week")}</div>
            </>
          )}
        </div>
      )}

      {closest && (
        <div>
          <div className="csection-label">{t("prog.closest")}</div>
          <div className="ccard p-4 flex items-center gap-3 mt-2">
            <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 56, height: 56, background: "var(--green-pop)", border: "2px solid var(--ink)" }}>
              <span style={{ fontSize: 28 }}>{closest.tier!.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg leading-tight">{closest.tier!.name} → {closest.tier!.nextName}</div>
              <div className="mt-2 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)" }}>
                <div style={{ width: `${Math.min(100, Math.max(6, ((closest.count - closest.tier!.at) / Math.max(1, closest.span)) * 100))}%`, height: "100%", background: "var(--coral)" }} />
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: "var(--ink)", opacity: 0.65 }}>{t("prog.to_go", { n: closest.toNext })}</div>
            </div>
          </div>
        </div>
      )}

      {/* the four ranks — each with a legible name + what it measures */}
      <div>
        <div className="csection-label">{t("prog.all_ranks")}</div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {tracks.map((x) => {
            const meta = TRACK_META[x.track];
            const started = !!x.tier;
            return (
              <button key={x.track} type="button" onClick={() => setOpenTrack(x.track)} className="ccard p-2 flex flex-col items-center text-center gap-1 relative">
                <span className="absolute top-1 right-1.5 text-xs leading-none opacity-40">ⓘ</span>
                <div className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: started ? "var(--green-pop)" : "var(--cream2)", border: "2px solid var(--ink)", opacity: started ? 1 : 0.55 }}>
                  <span style={{ fontSize: 24 }}>{started ? x.tier!.emoji : meta.emoji}</span>
                </div>
                <div className="font-extrabold text-xs leading-tight">{started ? x.tier!.name : t("prog.not_yet")}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--wood, #8a6d3b)" }}>{t(meta.key)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {showShare && hasActivity && (
        <button type="button" onClick={share} className="cbtn cbtn-coral w-full" style={{ padding: "13px 0", fontSize: 16 }}>
          📲 {t("prog.share")}
        </button>
      )}

      {openTrack && (
        <RankSheet track={openTrack} count={tracks.find((x) => x.track === openTrack)?.count ?? 0} onClose={() => setOpenTrack(null)} />
      )}
    </div>
  );
}

function RankSheet({ track, count, onClose }: { track: string; count: number; onClose: () => void }) {
  const { t } = useI18n();
  const ladder = RANK_LADDERS[track] ?? [];
  const meta = TRACK_META[track];
  let curIdx = -1;
  ladder.forEach((tier, i) => { if (count >= tier.at) curIdx = i; });
  const next = curIdx < ladder.length - 1 ? ladder[curIdx + 1] : null;
  const toNext = next ? next.at - count : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full sm:max-w-md ccard p-5 space-y-3" style={{ background: "var(--cream)", borderColor: "var(--ink)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 26 }}>{meta?.emoji}</span>
          <div className="font-display text-2xl">{t(meta?.key ?? "")}</div>
        </div>
        <div className="text-sm text-[var(--ink)]/70">{t(`prog.ladder_${track}`)}</div>
        <div className="space-y-1.5">
          {ladder.map((tier, i) => {
            const reached = count >= tier.at;
            const isCur = i === curIdx;
            return (
              <div key={tier.level} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: isCur ? "var(--green-pop)" : "var(--cream2)", border: "2px solid var(--ink)", opacity: reached || isCur ? 1 : 0.55 }}>
                <span style={{ fontSize: 20 }}>{tier.emoji}</span>
                <span className="font-extrabold flex-1">{tier.name}</span>
                {isCur && <span className="text-[10px] font-bold uppercase tracking-wide">{t("prog.ladder_current")}</span>}
                <span className="font-extrabold tabular-nums">{tier.at}</span>
              </div>
            );
          })}
        </div>
        <div className="text-sm font-semibold">
          {next ? t("prog.ladder_togo", { n: toNext, name: `${next.emoji} ${next.name}` }) : t("prog.ladder_maxed")}
        </div>
        <button type="button" onClick={onClose} className="cbtn cbtn-ghost w-full">{t("prog.ladder_close")}</button>
      </div>
    </div>
  );
}
