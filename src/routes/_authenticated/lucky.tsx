import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { FLAGS } from "@/lib/flags";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { whatsappLink, levelMeta, sportMeta, vibeEmoji, waErrorKey } from "@/lib/courtship";
import { RF } from "@/components/RailKit";
import { PlayerDossierSheet, type DossierPlayer } from "@/components/PlayerDossierSheet";
import { useI18n } from "@/lib/i18n";
import { oops } from "@/lib/oops";

type LuckyPlayer = {
  id: string; name: string; photo_url: string | null; level: number; home_city: string | null; bio: string | null;
  sports?: string[] | null; vibe?: string | null; fav_shot?: string | null;
  games_played?: number | null; rescues_count?: number | null; experience?: string | null;
};

export const Route = createFileRoute("/_authenticated/lucky")({
  beforeLoad: () => { if (!FLAGS.luckyServe) throw redirect({ to: "/players" }); },
  head: () => ({ meta: [{ title: "Lucky Serve — Courtship" }] }),
  component: Lucky,
});

function Lucky() {
  const { t } = useI18n();
  const [player, setPlayer] = useState<LuckyPlayer | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [sheet, setSheet] = useState(false);

  async function spin() {
    setSpinning(true);
    setEmpty(false);
    const { data } = await (supabase as any).rpc("random_player_for_me");
    const row = Array.isArray(data) ? data[0] : data;
    await new Promise((r) => setTimeout(r, 700)); // brief suspense
    setSpinning(false);
    if (!row) { setEmpty(true); setPlayer(null); return; }
    setPlayer(row as LuckyPlayer);
  }

  useEffect(() => {
    void spin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function messageWa() {
    if (!player) return;
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      let phone: string, name: string;
      try {
        ({ phone, name } = await getProfilePhone({ data: { targetId: player.id } }));
      } catch (e: any) { toast.info(t(waErrorKey(e?.message))); return; }
      const url = whatsappLink(phone, name);
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) { if (w) w.close(); oops(e); }
  }

  const lm = player ? levelMeta(player.level) : null;

  return (
    <div className="space-y-5">
      <Link to="/players" className="text-sm font-extrabold underline">{t("players.back")}</Link>
      <div className="text-center">
        <h1 className="font-display text-4xl">{t("lucky.title")}</h1>
        <p className="text-[var(--ink)] font-semibold" style={{ fontSize: 16.5 }}>{t("lucky.sub")}</p>
      </div>

      {spinning ? (
        <div className="ccard p-8 text-center">
          <div className="text-6xl lucky-spin">🎰</div>
          <div className="font-display text-2xl mt-3">{t("lucky.spinning")}</div>
        </div>
      ) : player ? (
        <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
          <div style={{ width: 70, flexShrink: 0, background: "#EEF6D6", borderLeft: "4px solid var(--green-pop)", borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 4px" }}>
            <div style={{ fontSize: 26 }}>🎰</div>
            <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)", marginTop: 6, textAlign: "center" }}>{t("lucky.rail")}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: "14px 14px" }}>
            <div className="flex items-center gap-3">
              <Link to="/players/$id" params={{ id: player.id }} className="shrink-0" style={{ borderRadius: 999, overflow: "hidden", border: "1.5px solid rgba(43,33,24,0.28)", display: "block" }}>
                <Avatar src={player.photo_url} name={player.name} seed={player.id} size={64} />
              </Link>
              <div className="min-w-0" role="button" onClick={() => setSheet(true)}>
                <div className="font-display" style={{ fontSize: RF.name, lineHeight: 1.05 }}>{player.name} <span style={{ fontSize: 13, opacity: 0.5 }}>ⓘ</span></div>
                <div style={{ fontWeight: 800, fontSize: RF.club, color: "#8C5A33", marginTop: 2 }}>📍 {player.home_city ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2" style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.65)" }}>
              <span>L<span style={{ color: lm?.color, fontWeight: 800 }}>{player.level}</span></span>
              {(player.sports ?? ["tennis"]).length > 0 && <span>{(player.sports ?? ["tennis"]).map((sp) => sportMeta(sp).emoji).join(" ")}</span>}
              {player.vibe && <span>{vibeEmoji(player.vibe)}</span>}
              {(player.games_played ?? 0) > 0 && <span>🎾 {player.games_played}</span>}
              {(player.rescues_count ?? 0) > 0 && <span>🚑 {player.rescues_count}</span>}
            </div>
            {player.fav_shot && <div style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.65)", marginTop: 4 }}>🎾 {player.fav_shot}</div>}
            {player.bio && <div className="font-display italic" style={{ fontSize: RF.note, marginTop: 6, lineHeight: 1.3 }}>"{player.bio}"</div>}
            <button type="button" className="font-extrabold underline text-sm mt-1" onClick={() => setSheet(true)}>{t("crush.tap_more")}</button>
            <div className="space-y-2 mt-3">
              <button onClick={messageWa} className="cbtn cbtn-green w-full">{t("sos.message_wa")}</button>
              <div className="grid grid-cols-2 gap-2">
                <Link to="/players/$id" params={{ id: player.id }} className="cbtn cbtn-ghost text-center block">{t("lucky.view_profile")}</Link>
                <button onClick={() => void spin()} className="cbtn cbtn-coral">{t("lucky.spin_again")}</button>
              </div>
            </div>
          </div>
        </div>
      ) : empty ? (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🎾</div>
          <div className="font-display text-xl">{t("lucky.empty")}</div>
          <button onClick={() => void spin()} className="cbtn cbtn-coral">{t("lucky.spin_again")}</button>
        </div>
      ) : null}

      <style>{`.lucky-spin{display:inline-block;animation:luckySpin 0.9s linear infinite}@keyframes luckySpin{to{transform:rotate(360deg)}}`}</style>
      {sheet && player && <PlayerDossierSheet card={player as unknown as DossierPlayer} onClose={() => setSheet(false)} />}
    </div>
  );
}
