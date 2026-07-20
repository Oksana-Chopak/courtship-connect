import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { rememberNext } from "@/lib/share";
import { BallHeart, RF, clampLines, SkeletonRail, type RailTone } from "@/components/RailKit";
import { courtTypeMeta } from "@/lib/courtship";
import { formatLabel } from "@/lib/sos";
import { Avatar } from "@/components/Avatar";

type PublicGame = {
  id: string; kind: string; status: string; play_at: string; play_until: string | null;
  format: string; level_min: number; level_max: number;
  court_name: string; court_city: string; court_type: string; court_type_any: boolean; court_status: string;
  spots_needed: number | null; spots_filled: number | null;
  host_name: string | null; host_photo: string | null;
};

export const Route = createFileRoute("/g/$id")({
  head: () => ({ meta: [{ title: "A game is looking for you — Courtship 🎾" }] }),
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code ? s.code : undefined,
  }),
  component: PublicGamePage,
});

/** Share links land HERE — the game itself, viewable by anyone. Signup is
 *  asked only at the moment of intent ("I'm in"), and the apply intent is
 *  remembered so it fires automatically right after onboarding. */
function PublicGamePage() {
  const { t, lang } = useI18n();
  const { id } = Route.useParams();
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const [game, setGame] = useState<PublicGame | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");

  useEffect(() => {
    void (async () => {
      // already signed in → the real game page is strictly better
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) { navigate({ to: "/sos/$id", params: { id }, replace: true }); return; }
      const { data, error } = await (supabase as any).rpc("public_game", { _id: id });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState("gone"); return; }
      setGame(row as PublicGame);
      setState("ok");
    })();
  }, [id]);

  function joinNow() {
    // remember the intent; after signup + onboarding the game page auto-applies
    rememberNext(`/sos/${id}?apply=1`);
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    params.set("next", `/sos/${id}?apply=1`);
    navigate({ to: "/auth", search: Object.fromEntries(params.entries()) as any });
  }

  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const active = game?.status === "active";

  return (
    <div className="min-h-dvh terry-bg" style={{ background: "var(--cream)" }}>
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <Link to="/" className="font-display text-2xl flex items-center gap-2 justify-center">
          <BallHeart size={26} /> Courtship
        </Link>

        {state === "loading" && <SkeletonRail lines={3} />}

        {state === "gone" && (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🌅</div>
            <div className="font-display text-2xl">{t("g.gone_title")}</div>
            <p className="font-semibold" style={{ opacity: 0.7 }}>{t("g.gone_sub")}</p>
            <Link to="/post" className="cbtn cbtn-coral inline-block">🎾 {t("g.post_own")}</Link>
          </div>
        )}

        {state === "ok" && game && (() => {
          const d = new Date(game.play_at);
          const winEnd = game.play_until ? new Date(game.play_until) : null;
          const now = new Date();
          const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
          const day = d.toDateString() === now.toDateString() ? t("rail.today") : d.toDateString() === tmr.toDateString() ? t("rail.tmrw") : d.toLocaleDateString(locale, { weekday: "short" });
          const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
          const time = winEnd ? `${d.getHours()}–${winEnd.getHours()}` : d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
          const tone: RailTone = game.kind === "sos" ? "sos" : "plan";
          const ctMeta = courtTypeMeta(game.court_type, lang);
          const isRange = time.includes("–");
          return (
            <>
              <div className="text-center">
                <div className="font-display" style={{ fontSize: 26, lineHeight: 1.15 }}>
                  {game.kind === "sos" ? t("g.hero_sos", { name: game.host_name ?? "A player" }) : t("g.hero_open", { name: game.host_name ?? "A player" })}
                </div>
              </div>

              <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
                <div style={{ width: 70, flexShrink: 0, background: tone === "sos" ? "#FCE9E4" : "#EEF6D6", borderLeft: `4px solid ${tone === "sos" ? "#F0705B" : "#C9EE3F"}`, borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 4px", textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>{day}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, color: "rgba(43,33,24,0.55)", marginTop: 1 }}>{dateStr}</div>
                  <div className="font-display" style={{ fontSize: isRange ? RF.time - 4 : RF.time, marginTop: 3, whiteSpace: "nowrap" }}>{time}</div>
                  <div style={{ fontSize: 16, marginTop: 4 }}>{game.court_type_any ? "🏟️" : ctMeta.emoji}</div>
                  <div style={{ fontWeight: 800, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(43,33,24,0.5)" }}>{game.court_type_any ? t("ct.sub_any") : game.court_type === "indoor" ? t("ct.sub_in") : t("ct.sub_out")}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                  <div className="flex items-center gap-2">
                    <Avatar src={game.host_photo} name={game.host_name ?? "?"} seed={game.id} size={34} />
                    <div className="font-display" style={{ fontSize: RF.name - 3, ...clampLines(1) }}>{game.host_name ?? "A player"}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: RF.club, color: "#8C5A33", marginTop: 6, ...clampLines(1) }}>📍 {game.court_city} · {game.court_name}</div>
                  <div style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)", marginTop: 6 }}>
                    {formatLabel(game.format)} · L{game.level_min}–{game.level_max}
                  </div>
                </div>
              </div>

              {active ? (
                <div className="space-y-2">
                  <button type="button" onClick={joinNow} className="cbtn cbtn-coral w-full" style={{ fontSize: 17 }}>
                    🎾 {t("g.im_in")}
                  </button>
                  <p className="text-center text-sm font-semibold" style={{ opacity: 0.65 }}>{t("g.signup_note")}</p>
                </div>
              ) : (
                <div className="ccard p-4 text-center space-y-2">
                  <div className="font-display text-xl">{t("g.taken")}</div>
                  <Link to="/post" className="cbtn cbtn-coral inline-block">🎾 {t("g.post_own")}</Link>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
