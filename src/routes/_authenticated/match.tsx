import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { whatsappLink, levelMeta } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { oops } from "@/lib/oops";

type Card = { id: string; name: string; photo_url: string | null; level: number; home_city: string | null; bio: string | null; fav_shot: string | null };

export const Route = createFileRoute("/_authenticated/match")({
  head: () => ({ meta: [{ title: "Match — Courtship" }] }),
  component: MatchDeck,
});

function MatchDeck() {
  const { t } = useI18n();
  const [deck, setDeck] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<Card | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).rpc("swipe_deck");
      setDeck((data as Card[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const card = deck[i];

  async function swipe(like: boolean) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const { data } = await (supabase as any).rpc("do_swipe", { _target: card.id, _like: like });
      const isMatch = Array.isArray(data) ? data[0]?.is_match : (data as any)?.is_match;
      if (like && isMatch) setMatched(card);
      else setI((n) => n + 1);
    } catch (e: any) { oops(e); }
    finally { setBusy(false); }
  }

  async function messageWa(p: Card) {
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      const { phone, name } = await getProfilePhone({ data: { targetId: p.id } });
      const url = whatsappLink(phone, name);
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) { if (w) w.close(); oops(e); }
  }

  if (matched) {
    const lm = levelMeta(matched.level);
    return (
      <div className="space-y-5">
        <div className="ccard p-6 text-center space-y-3" style={{ background: "var(--coral)", color: "#FFF6E8", borderColor: "var(--ink)" }}>
          <div className="text-5xl">💘</div>
          <h1 className="font-display text-4xl">{t("match.its_a_match")}</h1>
          <div className="font-extrabold">{t("match.match_sub", { name: matched.name })}</div>
        </div>
        <div className="ccard p-5 text-center space-y-3">
          <Avatar src={matched.photo_url} name={matched.name} seed={matched.id} size={140} />
          <div className="font-display text-3xl">{matched.name}</div>
          <div className="font-extrabold">📍 {matched.home_city ?? "—"} · L<span style={{ color: lm.color }}>{matched.level}</span></div>
          <button onClick={() => messageWa(matched)} className="cbtn cbtn-green w-full">{t("sos.message_wa")}</button>
          <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-coral w-full text-center block">{t("match.plan_game")}</Link>
          <button onClick={() => { setMatched(null); setI((n) => n + 1); }} className="cbtn cbtn-ghost w-full">{t("match.keep_swiping")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/players" className="text-sm font-extrabold underline">{t("players.back")}</Link>
      <div className="text-center">
        <h1 className="font-display text-4xl">{t("match.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("match.sub")}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>
      ) : card ? (
        <>
          <div className="ccard p-0 overflow-hidden">
            <div className="flex justify-center pt-6"><Avatar src={card.photo_url} name={card.name} seed={card.id} size={200} /></div>
            <div className="p-5 space-y-2 text-center">
              <div className="font-display text-3xl">{card.name}</div>
              <div className="font-extrabold">📍 {card.home_city ?? "—"} · L<span style={{ color: levelMeta(card.level).color }}>{card.level}</span></div>
              {card.bio && <div className="text-[var(--ink)] italic">"{card.bio}"</div>}
              {card.fav_shot && <div className="text-sm text-[var(--ink)]">🎾 {card.fav_shot}</div>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => swipe(false)} disabled={busy} className="cbtn cbtn-ghost" style={{ minHeight: 64, fontSize: "1.5rem" }}>❌ {t("match.pass")}</button>
            <button onClick={() => swipe(true)} disabled={busy} className="cbtn cbtn-coral" style={{ minHeight: 64, fontSize: "1.5rem" }}>❤️ {t("match.like")}</button>
          </div>
        </>
      ) : (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🎾</div>
          <div className="font-display text-xl">{t("match.empty")}</div>
          <Link to="/me" className="cbtn cbtn-coral inline-flex">{t("empty.dir_new_cta")}</Link>
        </div>
      )}
    </div>
  );
}
