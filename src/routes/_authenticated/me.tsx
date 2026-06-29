import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/Avatar";
import { StreakCard } from "@/components/StreakCard";
import { fetchPendingRequestsTo } from "@/lib/buddies";
import { activityTier, rescuerTier, recruiterTier, matchmakerTier, levelMeta, vibeEmoji } from "@/lib/courtship";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Profile — Courtship" }] }),
  component: MePage,
});

type Tier = { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null;

function RankCircle({ tier, fallbackEmoji, label }: { tier: Tier; fallbackEmoji: string; label: string }) {
  const started = !!tier;
  return (
    <div className="flex flex-col items-center text-center gap-1">
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: 52, height: 52, background: started ? "var(--green-pop)" : "var(--cream2)", border: "2px solid var(--ink)", opacity: started ? 1 : 0.5 }}
      >
        <span style={{ fontSize: 24 }}>{started ? tier!.emoji : fallbackEmoji}</span>
      </div>
      <div className="font-extrabold text-[10px] leading-tight">{started ? tier!.name : "—"}</div>
      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--wood, #8a6d3b)" }}>{label}</div>
    </div>
  );
}

function MenuLink({ to, icon, label, sub, badge }: { to: string; icon: string; label: string; sub?: string; badge?: number }) {
  return (
    <Link to={to} className="ccard p-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">{label}</span>
            {badge && badge > 0 ? (
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{ background: "var(--coral)", color: "#fff" }}>{badge}</span>
            ) : null}
          </div>
          {sub && <div className="text-xs font-semibold leading-tight" style={{ color: "var(--ink)", opacity: 0.55 }}>{sub}</div>}
        </div>
      </div>
      <span className="text-2xl shrink-0" style={{ opacity: 0.4 }}>›</span>
    </Link>
  );
}

function MePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name: string; photo_url: string | null; level: number; vibe: string } | null>(null);
  const [rescues, setRescues] = useState(0);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [hosted, setHosted] = useState(0);
  const [pendingReqs, setPendingReqs] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      setUid(uid);
      // Profile gates the redirect, but the hosted-count and pending requests only
      // need the user id — fetch all three together rather than in sequence.
      const [profRes, hostedCount, reqs] = await Promise.all([
        (supabase as any).rpc("get_my_full_profile").maybeSingle().then((r: any) => r, () => null),
        (supabase as any).from("sos_requests").select("id", { count: "exact", head: true }).eq("caller_id", uid).eq("kind", "open").then((r: any) => r?.count ?? 0, () => 0),
        fetchPendingRequestsTo(uid).then((r: any) => r, () => [] as any[]),
      ]);
      const data = (profRes as any)?.data;
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      const d = data as any;
      setProfile({ name: d.name ?? "", photo_url: d.photo_url ?? null, level: d.level ?? 3, vibe: d.vibe ?? "friendly" });
      setRescues(d.rescues_count ?? 0);
      setGamesPlayed(d.games_played ?? 0);
      setReferrals(d.referrals_count ?? 0);
      setHosted((hostedCount as number) ?? 0);
      setPendingReqs((reqs as any[]).length);
    })();
  }, [navigate]);

  if (!profile || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  }

  const lm = levelMeta(profile.level);

  return (
    <div className="space-y-4">
      <Link to="/settings" className="ccard p-4 flex items-center gap-3">
        <Avatar src={profile.photo_url} name={profile.name} seed={uid} size={64} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-none truncate">{profile.name || "🎾"}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lm.color }} />
            <span className="font-extrabold text-sm">{lm.name}</span>
            <span className="text-sm">· {vibeEmoji(profile.vibe)}</span>
          </div>
        </div>
        <span
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 36, height: 36, background: "var(--cream2)", border: "2px solid var(--ink)" }}
          aria-label={t("me.edit_profile")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
        </span>
      </Link>

      <StreakCard />

      <div className="ccard p-3 grid grid-cols-4 gap-2">
        <RankCircle tier={activityTier(gamesPlayed)} fallbackEmoji="🎾" label={t("prog.track_activity")} />
        <RankCircle tier={rescuerTier(rescues)} fallbackEmoji="🚑" label={t("prog.track_rescuer")} />
        <RankCircle tier={recruiterTier(referrals)} fallbackEmoji="🤝" label={t("prog.track_recruiter")} />
        <RankCircle tier={matchmakerTier(hosted)} fallbackEmoji="🎪" label={t("prog.track_matchmaker")} />
      </div>

      <div className="space-y-2">
        <MenuLink to="/progress" icon="📈" label={t("prog.title")} sub={t("menu.progress_sub")} />
        <MenuLink to="/matches" icon="🎾" label={t("matches.title")} sub={t("menu.matches_sub", { n: gamesPlayed })} />
        <MenuLink to="/people" icon="🤝" label={t("people.title")} sub={t("menu.people_sub")} badge={pendingReqs} />
        <MenuLink to="/help" icon="💬" label={t("help.title")} sub={t("menu.help_sub")} />
      </div>
    </div>
  );
}
