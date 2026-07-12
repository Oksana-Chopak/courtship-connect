import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { FLAGS } from "@/lib/flags";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { whatsappLink, levelMeta, monogramColors } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { oops } from "@/lib/oops";

type Card = { id: string; name: string; photo_url: string | null; level: number; home_city: string | null; bio: string | null; fav_shot: string | null };

export const Route = createFileRoute("/_authenticated/match")({
  beforeLoad: () => { if (!FLAGS.swipeDeck) throw redirect({ to: "/players" }); },
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
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(0);

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
        <p className="text-[var(--ink)] font-semibold" style={{ fontSize: 16.5 }}>{t("match.sub")}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>
      ) : card ? (
        <>
          <div className="relative flex justify-center" style={{ minHeight: 480, touchAction: "pan-y" }}>
            {deck[i + 1] && (
              <div className="absolute" style={{ top: 10, width: 286, height: 460, borderRadius: 22, background: "var(--cream2)", border: "2px solid var(--ink)", transform: "rotate(3deg)" }} />
            )}
            <div
              style={{ transform: `translateX(${drag}px) rotate(${drag / 14}deg)`, transition: dragging ? "none" : "transform 0.25s ease", position: "relative" }}
              onPointerDown={(e) => { if (busy) return; setDragging(true); dragStart.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { if (!dragging) return; setDrag(e.clientX - dragStart.current); }}
              onPointerUp={() => {
                setDragging(false);
                if (Math.abs(drag) > 90) {
                  const like = drag > 0;
                  setDrag(like ? 500 : -500);
                  setTimeout(() => { setDrag(0); void swipe(like); }, 180);
                } else setDrag(0);
              }}
              onPointerCancel={() => { setDragging(false); setDrag(0); }}
            >
              <SwipeCard card={card} />
              {/* drag verdict badges */}
              <div style={{ position: "absolute", top: 22, left: 18, transform: "rotate(-12deg)", opacity: Math.min(1, Math.max(0, drag / 70)), pointerEvents: "none" }}>
                <span className="font-display" style={{ fontSize: 30, color: "var(--green-pop)", border: "3px solid var(--green-pop)", borderRadius: 10, padding: "2px 12px", background: "rgba(22,18,13,0.45)" }}>{t("match.like")} 🎾</span>
              </div>
              <div style={{ position: "absolute", top: 22, right: 18, transform: "rotate(12deg)", opacity: Math.min(1, Math.max(0, -drag / 70)), pointerEvents: "none" }}>
                <span className="font-display" style={{ fontSize: 30, color: "#FFF6E8", border: "3px solid #FFF6E8", borderRadius: 10, padding: "2px 12px", background: "rgba(240,112,91,0.75)" }}>{t("match.pass")}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6">
            <button onClick={() => swipe(false)} disabled={busy} aria-label={t("match.pass")} className="flex items-center justify-center rounded-full disabled:opacity-50" style={{ width: 64, height: 64, background: "var(--cream2)", border: "2.5px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)", fontSize: 26 }}>✕</button>
            <button onClick={() => swipe(true)} disabled={busy} aria-label={t("match.like")} className="flex items-center justify-center rounded-full disabled:opacity-50" style={{ width: 64, height: 64, background: "var(--green-pop)", border: "2.5px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)", fontSize: 26 }}>🎾</button>
          </div>
          <div className="text-center text-xs font-bold" style={{ color: "rgba(43,33,24,0.5)" }}>{t("match.pass")} · {t("match.like")}</div>
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

function SwipeCard({ card }: { card: Card }) {
  const lm = levelMeta(card.level);
  const [bg, fg] = monogramColors(card.id);
  const hasPhoto = !!card.photo_url;
  return (
    <div className="relative overflow-hidden mx-auto" style={{ width: 300, maxWidth: "100%", aspectRatio: "300 / 468", borderRadius: 22, border: "2.5px solid var(--ink)", boxShadow: "5px 5px 0 rgba(43,33,24,0.18)", background: bg }}>
      {hasPhoto ? (
        <img src={card.photo_url!} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 11px)" }} />
          <div className="absolute left-0 right-0 text-center font-display" style={{ top: "8%", fontSize: 150, lineHeight: 1, color: fg, opacity: 0.92 }}>{card.name[0]}</div>
        </>
      )}
      <div className="absolute" style={{ top: 14, right: 14 }}>
        <span className="font-extrabold rounded-full" style={{ fontSize: 12, padding: "3px 10px", color: "#FFF6E8", background: "rgba(22,18,13,0.5)", border: `1.5px solid ${lm.color}` }}>L{card.level}</span>
      </div>
      <div className="absolute left-0 right-0 bottom-0" style={{ padding: "46px 16px 16px", background: "linear-gradient(to top, rgba(22,18,13,0.92), rgba(22,18,13,0.55) 60%, transparent)" }}>
        <div className="flex items-baseline gap-2">
          <span className="font-display" style={{ fontSize: 30, color: "#FFF6E8" }}>{card.name}</span>
          <span className="ml-auto inline-flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="rounded-full" style={{ width: 8, height: 8, background: n <= card.level ? lm.color : "transparent", border: `1.5px solid ${n <= card.level ? lm.color : "rgba(236,230,216,0.5)"}`, boxSizing: "border-box" }} />
            ))}
          </span>
        </div>
        {card.home_city && <div className="font-bold mt-1" style={{ fontSize: 14.5, color: "rgba(236,230,216,0.85)" }}>📍 {card.home_city}</div>}
        {card.bio && <div className="font-display italic mt-2" style={{ fontSize: 16.5, color: "#FFF6E8", lineHeight: 1.3 }}>"{card.bio}"</div>}
        {card.fav_shot && <div className="mt-2" style={{ fontSize: 14.5, color: "rgba(236,230,216,0.85)" }}>🎾 {card.fav_shot}</div>}
      </div>
    </div>
  );
}