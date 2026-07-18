import { Link } from "@tanstack/react-router";
import React from "react";
import { useI18n } from "@/lib/i18n";
import { RF } from "@/components/RailKit";
import { sportMeta } from "@/lib/courtship";

export type DossierPlayer = {
  id: string; name: string; level: number; home_city: string | null; bio: string | null; fav_shot: string | null;
  home_cities?: string[] | null; home_courts?: string | null;
  sports?: string[] | null; formats?: string[] | null; play_times?: string[] | null;
  looking_for?: string | null; experience?: string | null; goals?: string[] | null;
  games_played?: number | null; rescues_count?: number | null; member_since?: string | null;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: RF.club }}>{children}</div>
    </div>
  );
}

export function PlayerDossierSheet({ card, onClose }: { card: DossierPlayer; onClose: () => void }) {
  const { t } = useI18n();
  const sports = (card.sports?.length ? card.sports : ["tennis"]) as string[];
  const chips = (arr?: string[] | null, keyPrefix?: string) =>
    (arr ?? []).length ? (
      <span className="inline-flex gap-1.5 flex-wrap">
        {(arr ?? []).map((v) => (
          <span key={v} className="cchip" style={{ pointerEvents: "none", fontSize: 13, padding: "3px 10px" }}>{keyPrefix ? t(`${keyPrefix}.${v}`) : v}</span>
        ))}
      </span>
    ) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(43,33,24,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto" style={{ maxHeight: "78vh", background: "var(--cream2)", borderTop: "2.5px solid var(--ink)", borderLeft: "2.5px solid var(--ink)", borderRight: "2.5px solid var(--ink)", borderRadius: "18px 18px 0 0", padding: "18px 18px 26px" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-display" style={{ fontSize: 26 }}>{card.name}</div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="font-extrabold" style={{ fontSize: 22, padding: "0 6px" }}>✕</button>
        </div>
        <div className="space-y-4 mt-3">
          {card.bio && <div className="font-display italic" style={{ fontSize: RF.note, lineHeight: 1.35 }}>"{card.bio}"</div>}
          <DetailRow label={`🎾 ${t("crush.tennis")}`}>
            L{card.level}
            {card.experience && <> · {t(`exp.${card.experience}`)}</>}
            {card.fav_shot && <> · {card.fav_shot}</>}
          </DetailRow>
          <DetailRow label={`🏃 ${t("crush.plays")}`}>
            <div className="space-y-1.5">
              <div>{sports.map((sp) => `${sportMeta(sp).emoji} ${t(sportMeta(sp).key)}`).join(" · ")}{card.looking_for ? ` · ${t(`lf.${card.looking_for}`)}` : ""}</div>
              {chips(card.formats ?? undefined)}
              {chips(card.play_times ?? undefined)}
            </div>
          </DetailRow>
          {(card.goals ?? []).length > 0 && <DetailRow label={`🎯 ${t("crush.goals")}`}>{chips(card.goals ?? undefined, "goal")}</DetailRow>}
          {(card.home_courts || card.home_city || (card.home_cities ?? []).length > 0) && (
            <DetailRow label={`📍 ${t("crush.courts")}`}>
              {[...new Set([card.home_city, ...(card.home_cities ?? [])].filter(Boolean))].join(" · ")}
              {card.home_courts && <div style={{ marginTop: 2 }}>{card.home_courts}</div>}
            </DetailRow>
          )}
          {((card.games_played ?? 0) > 0 || (card.rescues_count ?? 0) > 0) && (
            <DetailRow label={`📈 ${t("crush.progress")}`}>
              {[
                (card.games_played ?? 0) > 0 ? `🎾 ${t("crush.games_n", { n: card.games_played as number })}` : null,
                (card.rescues_count ?? 0) > 0 ? `🚑 ${t("crush.rescues_n", { n: card.rescues_count as number })}` : null,
              ].filter(Boolean).join(" · ")}
            </DetailRow>
          )}
          {card.member_since && (
            <div className="font-bold" style={{ fontSize: 13, color: "rgba(43,33,24,0.55)" }}>
              {t("crush.member_since", { d: new Date(card.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
