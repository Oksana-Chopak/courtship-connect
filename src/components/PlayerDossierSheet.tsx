import React from "react";
import { useI18n } from "@/lib/i18n";
import { RF } from "@/components/RailKit";
import { Rackets } from "@/components/RailKit";
import { sportMeta, levelMeta, vibeEmoji } from "@/lib/courtship";

export type DossierPlayer = {
  id: string; name: string; level: number; home_city: string | null; bio: string | null; fav_shot: string | null;
  home_cities?: string[] | null; home_courts?: string | null;
  sports?: string[] | null; formats?: string[] | null; play_times?: string[] | null;
  looking_for?: string | null; experience?: string | null; goals?: string[] | null;
  games_played?: number | null; rescues_count?: number | null; member_since?: string | null;
  areas?: string[] | null; vibe?: string | null;
};

/** Sheet-1 stat box: big number, tiny uppercase label (CourtCrush redesign). */
function StatBox({ big, label }: { big: React.ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", border: "1.5px solid rgba(43,33,24,0.2)", borderRadius: 12, padding: "9px 4px", background: "rgba(253,249,238,0.7)" }}>
      <div className="font-display" style={{ fontSize: 19 }}>{big}</div>
      <div className="font-extrabold" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-extrabold" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8C5A33", marginBottom: 7 }}>{children}</div>;
}

export function PlayerDossierSheet({ card, onClose, onLike }: { card: DossierPlayer; onClose: () => void; onLike?: () => void }) {
  const { t } = useI18n();
  const lm = levelMeta(card.level);
  const sports = (card.sports?.length ? card.sports : ["tennis"]) as string[];
  const courts = (card.home_courts ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const chip = (v: React.ReactNode, key: string) => (
    <span key={key} className="font-extrabold" style={{ fontSize: 12.5, border: "1.5px solid rgba(43,33,24,0.28)", borderRadius: 999, padding: "5px 11px" }}>{v}</span>
  );
  const stats: { big: React.ReactNode; label: string }[] = [];
  if (card.experience) stats.push({ big: t(`exp.${card.experience}`), label: t("crush.stat_playing") });
  if ((card.games_played ?? 0) > 0) stats.push({ big: String(card.games_played), label: t("crush.stat_games") });
  if ((card.rescues_count ?? 0) > 0) stats.push({ big: `🚑 ${card.rescues_count}`, label: t("crush.stat_rescues") });
  if (card.member_since) stats.push({ big: String(new Date(card.member_since).getFullYear()), label: t("crush.stat_since") });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,15,10,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto" style={{ maxHeight: "80vh", background: "var(--cream)", backgroundImage: "repeating-linear-gradient(0deg, rgba(43,33,24,0.028) 0 2px, transparent 2px 7px)", border: "2px solid var(--ink)", borderBottom: "none", borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(0,0,0,0.28)", padding: "0 20px 24px" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: "rgba(43,33,24,0.3)", marginTop: 10 }} />
        {/* header: name + level + format + vibe */}
        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display" style={{ fontSize: 26, lineHeight: 1.05 }}>{card.name}</div>
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-extrabold" style={{ fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: lm.color, display: "inline-block" }} />
                L{card.level} · {t(`lvl.${card.level}`)}
              </span>
              <span className="inline-flex items-center gap-1 font-extrabold" style={{ fontSize: 12.5 }}>
                <Rackets n={(card.formats ?? []).includes("doubles") ? 4 : 2} size={15} />
              </span>
              {card.vibe && <span className="font-bold" style={{ fontSize: 12.5, color: "rgba(43,33,24,0.6)" }}>{vibeEmoji(card.vibe)}</span>}
              {sports.some((sp) => sp !== "tennis") && (
                <span className="font-bold" style={{ fontSize: 12.5 }}>{sports.map((sp) => sportMeta(sp).emoji).join(" ")}</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="font-extrabold shrink-0" style={{ fontSize: 20, padding: "2px 6px" }}>✕</button>
        </div>

        {/* quote */}
        {card.bio && <div className="font-display mt-2.5" style={{ fontSize: 16, color: "#8C5A33", lineHeight: 1.35 }}>“{card.bio}”</div>}
        {card.fav_shot && <div className="font-bold mt-1.5" style={{ fontSize: 13, color: "rgba(43,33,24,0.65)" }}>🎾 {card.fav_shot}</div>}

        {/* stat boxes */}
        {stats.length > 0 && (
          <div className="flex gap-2 mt-3.5">
            {stats.slice(0, 4).map((s, n) => <StatBox key={n} big={s.big} label={s.label} />)}
          </div>
        )}

        {/* where they play */}
        {(courts.length > 0 || (card.areas ?? []).length > 0 || card.home_city) && (
          <div className="mt-4">
            <SectionLabel>📍 {t("crush.courts")}</SectionLabel>
            <div className="flex gap-1.5 flex-wrap items-center">
              {courts.map((c) => chip(<>🎾 {c}</>, `c-${c}`))}
              {(card.areas ?? []).map((a) => chip(a, `a-${a}`))}
              {courts.length === 0 && (card.areas ?? []).length === 0 && card.home_city && chip(card.home_city, "city")}
            </div>
          </div>
        )}

        {/* when + what they're after */}
        {((card.play_times ?? []).length > 0 || (card.goals ?? []).length > 0 || card.looking_for) && (
          <div className="mt-4">
            <SectionLabel>🕑 {t("crush.plays")}</SectionLabel>
            <div className="flex gap-1.5 flex-wrap">
              {(card.play_times ?? []).map((p) => chip(p, `p-${p}`))}
              {card.looking_for && chip(t(`lf.${card.looking_for}`), "lf")}
              {(card.goals ?? []).map((g) => chip(t(`goal.${g}`), `g-${g}`))}
            </div>
          </div>
        )}

        {/* actions — pass stays a quiet circle, like is the one green primary */}
        {onLike && (
          <div className="flex items-center gap-3 mt-5">
            <button type="button" onClick={onClose} aria-label={t("match.pass")}
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 50, height: 50, background: "#FDF9EE", border: "2px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", fontSize: 20 }}>✕</button>
            <button type="button" onClick={onLike} className="cbtn cbtn-green flex-1" style={{ fontSize: 15 }}>
              🎾 {t("crush.lets_play")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
