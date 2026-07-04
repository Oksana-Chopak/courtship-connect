import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/Avatar";
import { SeasonPanel } from "@/components/SeasonPanel";
import { CourtsPassport } from "@/components/CourtsPassport";
import { fetchPendingRequestsTo } from "@/lib/buddies";
import { levelMeta, vibeEmoji } from "@/lib/courtship";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Profile — Courtship" }] }),
  component: MePage,
});

function MePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name: string; photo_url: string | null; level: number; vibe: string } | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [pendingReqs, setPendingReqs] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      setUid(uid);
      const [profRes, reqs] = await Promise.all([
        (supabase as any).rpc("get_my_full_profile").maybeSingle().then((r: any) => r, () => null),
        fetchPendingRequestsTo(uid).then((r: any) => r, () => [] as any[]),
      ]);
      const data = (profRes as any)?.data;
      if (!data) { navigate({ to: "/onboarding" }); return; }
      const d = data as any;
      setProfile({ name: d.name ?? "", photo_url: d.photo_url ?? null, level: d.level ?? 3, vibe: d.vibe ?? "friendly" });
      setGamesPlayed(d.games_played ?? 0);
      setPendingReqs((reqs as any[]).length);
    })();
  }, [navigate]);

  if (!profile || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  }

  const lm = levelMeta(profile.level);

  return (
    <div className="space-y-4">
      {/* Identity + settings gear */}
      <div className="ccard p-4 flex items-center gap-3">
        <Avatar src={profile.photo_url} name={profile.name} seed={uid} size={64} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-none truncate">{profile.name || "🎾"}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lm.color }} />
            <span className="font-extrabold text-sm">{lm.name}</span>
            <span className="text-sm">· {vibeEmoji(profile.vibe)}</span>
          </div>
        </div>
        <Link
          to="/settings"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 40, height: 40, background: "var(--cream2)", border: "2px solid var(--ink)" }}
          aria-label={t("settings.title")}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </Link>
      </div>

      {/* YOUR SEASON — right under the name, the point of the profile */}
      <SeasonPanel />

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/matches" className="ccard p-4 flex flex-col items-center text-center gap-1">
          <span className="text-2xl">🎾</span>
          <span className="font-display text-lg leading-tight">{t("matches.title")}</span>
          <span className="text-xs font-semibold" style={{ opacity: 0.55 }}>{t("menu.matches_sub", { n: gamesPlayed })}</span>
        </Link>
        <Link to="/people" className="ccard p-4 flex flex-col items-center text-center gap-1 relative">
          {pendingReqs > 0 && (
            <span className="absolute top-2 right-2 text-xs font-extrabold px-2 py-0.5 rounded-full" style={{ background: "var(--coral)", color: "#fff" }}>{pendingReqs}</span>
          )}
          <span className="text-2xl">🤝</span>
          <span className="font-display text-lg leading-tight">{t("people.title")}</span>
          <span className="text-xs font-semibold" style={{ opacity: 0.55 }}>{t("menu.people_sub")}</span>
        </Link>
      </div>

      {/* Courts Passport — collection lives at the bottom */}
      <CourtsPassport />

      <Link to="/help" className="block text-center text-sm font-extrabold underline py-2" style={{ color: "var(--wood, #8a6d3b)" }}>
        💬 {t("help.title")}
      </Link>
    </div>
  );
}
