import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { whatsappLink, levelMeta } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { oops } from "@/lib/oops";

type LuckyPlayer = { id: string; name: string; photo_url: string | null; level: number; home_city: string | null; bio: string | null };

export const Route = createFileRoute("/_authenticated/lucky")({
  head: () => ({ meta: [{ title: "Lucky Serve — Courtship" }] }),
  component: Lucky,
});

function Lucky() {
  const { t } = useI18n();
  const [player, setPlayer] = useState<LuckyPlayer | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [empty, setEmpty] = useState(false);

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
      const { phone, name } = await getProfilePhone({ data: { targetId: player.id } });
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
        <p className="text-[var(--ink)] font-semibold">{t("lucky.sub")}</p>
      </div>

      {spinning ? (
        <div className="ccard p-8 text-center">
          <div className="text-6xl lucky-spin">🎰</div>
          <div className="font-display text-2xl mt-3">{t("lucky.spinning")}</div>
        </div>
      ) : player ? (
        <div className="ccard p-5 text-center space-y-3">
          <Link to="/players/$id" params={{ id: player.id }} className="inline-block">
            <Avatar src={player.photo_url} name={player.name} seed={player.id} size={140} />
          </Link>
          <div className="font-display text-3xl">{player.name}</div>
          <div className="font-extrabold">📍 {player.home_city ?? "—"} · L<span style={{ color: lm?.color }}>{player.level}</span></div>
          {player.bio && <div className="text-[var(--ink)] italic">"{player.bio}"</div>}
          <button onClick={messageWa} className="cbtn cbtn-green w-full">{t("sos.message_wa")}</button>
          <Link to="/players/$id" params={{ id: player.id }} className="cbtn cbtn-ghost w-full text-center block">{t("lucky.view_profile")}</Link>
          <button onClick={() => void spin()} className="cbtn cbtn-coral w-full">{t("lucky.spin_again")}</button>
        </div>
      ) : empty ? (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🎾</div>
          <div className="font-display text-xl">{t("lucky.empty")}</div>
          <button onClick={() => void spin()} className="cbtn cbtn-coral">{t("lucky.spin_again")}</button>
        </div>
      ) : null}

      <style>{`.lucky-spin{display:inline-block;animation:luckySpin 0.9s linear infinite}@keyframes luckySpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
