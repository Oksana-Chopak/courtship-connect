import { useEffect, useMemo } from "react";
import type { Celebration } from "@/lib/celebrate";
import { useI18n } from "@/lib/i18n";

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

  // Stable confetti burst (computed once per mount).
  const pieces = useMemo(
    () =>
      Array.from({ length: 38 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.45,
        dur: 1.7 + Math.random() * 1.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        size: 6 + Math.random() * 9,
      })),
    []
  );

  let title: string;
  let subtitle: string;
  let bigEmoji: string;
  if (c.leveledUp) {
    title = t("celebrate.levelup_title");
    subtitle = t(c.kind === "rescue" ? "celebrate.levelup_sub_rescue" : "celebrate.levelup_sub_game", {
      n: c.count,
      name: `${c.tierEmoji} ${c.tierName}`,
    });
    bigEmoji = c.tierEmoji;
  } else if (c.kind === "rescue") {
    title = t("celebrate.rescue_title");
    subtitle = t("celebrate.rescue_sub", { n: c.count });
    bigEmoji = "🚑";
  } else {
    title = t("celebrate.game_title");
    subtitle = t("celebrate.game_sub", { n: c.count });
    bigEmoji = "🎾";
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
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
        @keyframes ccfall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(560deg); opacity: 0; }
        }
        @keyframes ccpop {
          0% { transform: scale(0.72); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="ccard relative w-full max-w-sm p-6 text-center"
        style={{ animation: "ccpop 0.35s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl leading-none mb-2">{bigEmoji}</div>
        <div className="font-display text-3xl leading-tight">{title}</div>
        <p className="text-[var(--ink)] font-semibold mt-2">{subtitle}</p>

        <div
          className="inline-flex items-center gap-1 text-sm font-extrabold px-3 py-1.5 rounded-full mt-4"
          style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
        >
          {c.tierEmoji} {c.tierName}
        </div>

        {c.toNext != null && c.nextName && (
          <p className="text-sm text-[var(--ink)]/70 mt-3">
            {t("celebrate.to_next", { n: c.toNext, name: c.nextName })}
          </p>
        )}

        <button type="button" className="cbtn cbtn-coral w-full mt-5" onClick={onClose}>
          {t("celebrate.cta")}
        </button>
      </div>
    </div>
  );
}
