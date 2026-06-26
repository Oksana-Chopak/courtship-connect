import { useEffect, useMemo } from "react";
import type { Celebration } from "@/lib/celebrate";
import { useI18n } from "@/lib/i18n";

// Dark "celebration moment" — the elevated reward screen. Driven entirely by our
// own tracks (games/rescues/recruits + tier crossings). No points currency.
const DARK = "#16120D";
const CREAM = "#FFF6E8";
const CONFETTI_COLORS = ["var(--coral)", "var(--green-pop)", "#ffd166", "#ef476f", "#118ab2"];

export function CelebrationOverlay({ c, onClose }: { c: Celebration; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.9 + Math.random() * 1.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        size: 7 + Math.random() * 9,
      })),
    []
  );

  // Map our reward data onto the celebration layout.
  let kicker: string | null = null;
  let title: string;
  let subtitle: string;
  let bigEmoji: string;
  if (c.leveledUp) {
    kicker = t("celebrate.kicker_levelup");
    title = c.tierName; // the new tier IS the headline
    const subKey =
      c.kind === "rescue" ? "celebrate.levelup_sub_rescue" : c.kind === "recruit" ? "celebrate.levelup_sub_recruit" : c.kind === "host" ? "celebrate.levelup_sub_host" : "celebrate.levelup_sub_game";
    subtitle = t(subKey, { n: c.count });
    bigEmoji = c.tierEmoji;
  } else if (c.kind === "rescue") {
    title = t("celebrate.rescue_title");
    subtitle = t("celebrate.rescue_sub", { n: c.count });
    bigEmoji = "🚑";
  } else if (c.kind === "recruit") {
    title = t("celebrate.recruit_title");
    subtitle = t("celebrate.recruit_sub", { n: c.count });
    bigEmoji = "🎁";
  } else if (c.kind === "host") {
    title = t("celebrate.host_title");
    subtitle = t("celebrate.host_sub", { n: c.count });
    bigEmoji = "🎪";
  } else {
    title = t("celebrate.game_title");
    subtitle = t("celebrate.game_sub", { n: c.count });
    bigEmoji = "🎾";
  }

  const ringColor = c.kind === "rescue" ? "var(--coral)" : "var(--green-pop)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: DARK }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-6%",
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: 2,
              transform: `rotate(${p.rot}deg)`,
              animation: `ccfall ${p.dur}s ${p.delay}s ease-in forwards`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ccfall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(112vh) rotate(560deg); opacity: 0; } }
        @keyframes ccpop { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div
        className="relative z-[2] flex flex-col items-center text-center w-full max-w-sm"
        style={{ animation: "ccpop 0.4s ease-out", color: CREAM }}
        onClick={(e) => e.stopPropagation()}
      >
        {kicker && (
          <div className="font-extrabold text-xs tracking-[0.2em] uppercase mb-4" style={{ color: "var(--green-pop)" }}>
            {kicker}
          </div>
        )}

        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 150,
            height: 150,
            background: ringColor,
            border: `3px solid ${CREAM}`,
            boxShadow: `0 0 0 8px ${c.kind === "rescue" ? "rgba(255,87,71,0.18)" : "rgba(201,238,63,0.18)"}`,
            color: DARK,
          }}
        >
          <span style={{ fontSize: 74, lineHeight: 1 }}>{bigEmoji}</span>
        </div>

        <div className="font-display mt-6" style={{ fontSize: 34, lineHeight: 1.05 }}>{title}</div>
        <p className="font-semibold mt-2" style={{ color: "rgba(255,246,232,0.72)", maxWidth: 280 }}>{subtitle}</p>

        {c.toNext != null && c.nextName && (
          <div
            className="inline-flex items-center gap-1 font-extrabold mt-5 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,246,232,0.1)", color: CREAM }}
          >
            {t("celebrate.to_next", { n: c.toNext, name: c.nextName })}
          </div>
        )}

        <button type="button" className="cbtn cbtn-green w-full mt-8" onClick={onClose}>
          {t("celebrate.cta")}
        </button>
      </div>
    </div>
  );
}
