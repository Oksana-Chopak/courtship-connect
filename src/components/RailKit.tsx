import { Avatar } from "@/components/Avatar";

/** Shared visual kit for the redesigned board time-rail cards.
 *  Ported from the Claude Design handoff (Retro Flirt). Colors per Oxy:
 *  SOS = coral, planned = green, MY hosted games = grey, events = wood/brown. */

export const LV_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
const INK = "#2B2118";
const INK30 = "rgba(43,33,24,0.30)";
const GREEN = "#C9EE3F";

export type RailTone = "sos" | "plan" | "mine" | "event";

/** Left bar + rail background tint per card type. */
export function railTone(tone: RailTone): { bar: string; bg: string } {
  if (tone === "sos") return { bar: "#F0705B", bg: "#FCE9E4" };
  if (tone === "mine") return { bar: "#9B9186", bg: "#ECE8E0" };   // grey (Oxy's choice)
  if (tone === "event") return { bar: "#8C5A33", bg: "#F1E7DC" };  // wood/brown
  return { bar: GREEN, bg: "#EEF6D6" };                             // planned = green
}

function Racket({ size = 22, fill = GREEN }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }}>
      <path d="M20.5 25.5 L25 37" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="16" cy="15" rx="11.5" ry="13" fill={fill} stroke={INK} strokeWidth="2.4" transform="rotate(-20 16 15)" />
      <g stroke={INK} strokeWidth="0.7" opacity="0.42" transform="rotate(-20 16 15)">
        <path d="M11.5 7 L11.5 23 M16 6.4 L16 23.6 M20.5 7 L20.5 23 M9 11 L23 11 M8.6 15 L23.4 15 M9 19 L23 19" />
      </g>
    </svg>
  );
}

/** Format indicator: 2 rackets for singles, 4 for doubles (overlapping fan). */
export function Rackets({ n = 2, size = 22 }: { n?: number; size?: number }) {
  const step = size * 0.42;
  return (
    <span style={{ position: "relative", display: "inline-block", height: size, width: size + step * (n - 1), verticalAlign: "middle", flexShrink: 0 }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} style={{ position: "absolute", left: i * step, top: 0, transform: `rotate(${(i - (n - 1) / 2) * 11}deg)`, transformOrigin: "50% 92%" }}>
          <Racket size={size} fill={i % 2 ? "#EAF3C8" : GREEN} />
        </span>
      ))}
    </span>
  );
}

export function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK30} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M12 15 V4 M8.5 7 L12 3.5 L15.5 7" />
      <path d="M6 12 v7 a1 1 0 0 0 1 1 h10 a1 1 0 0 0 1 -1 v-7" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK30} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M4 20 h4 L18 10 l-4 -4 L4 16 z M14 6 l4 4" />
    </svg>
  );
}

export function CalIcon({ added }: { added?: boolean }) {
  const c = added ? "#3A4A12" : INK30;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9 h18 M8 3 v4 M16 3 v4" />
      {added && <path d="M8.5 14.5 l2.5 2.5 l4.5 -4.5" />}
    </svg>
  );
}

/** The colored left time-rail: DAY / TIME / court-type emoji, tinted by tone. */
export function TimeRail({ day, time, ct, tone }: { day: string; time: string; ct: string; tone: RailTone }) {
  const { bar, bg } = railTone(tone);
  return (
    <div style={{ width: 70, flexShrink: 0, background: bg, borderRight: "1px solid rgba(43,33,24,0.15)", borderLeft: `4px solid ${bar}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 4px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>{day}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.05, marginTop: 2 }}>{time}</div>
      <div style={{ fontSize: 16, marginTop: 4 }}>{ct}</div>
    </div>
  );
}

/** Circular, ink-outlined photo (uses the app Avatar for real photos + fallback). */
export function RailPhoto({ src, name, seed, size = 52 }: { src: string | null; name: string; seed: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: size / 2, overflow: "hidden", border: "1.5px solid rgba(43,33,24,0.28)" }}>
      <Avatar src={src} name={name} seed={seed} size={size} />
    </div>
  );
}

/** Outer horizontal card shell (rail + content). */
export function RailShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
      {children}
    </div>
  );
}

export const clampLines = (n: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });
