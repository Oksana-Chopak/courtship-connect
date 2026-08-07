import { useEffect, useRef, useState } from "react";

/* ═══ Wizard kit — shared atoms for the 3-step game wizards ═══
   Used by BOTH the member create/edit wizard (/sos/new) and the guest
   reverse-funnel wizard (/post), so the two flows never drift apart visually.
   Board tokens from the TennisBuddies 9 handoff. */

export const HAIR = "rgba(43,33,24,0.18)";
export const CARD = "rgba(253,249,238,0.6)";
export const WOOD = "#8C5A33";
export const LIME = "#C9EE3F";
export const CORAL = "#F0705B";
export const LV_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];


export function WizLbl({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline mb-2">
      <span className="flex-1 font-extrabold uppercase" style={{ fontSize: 13, letterSpacing: "0.1em", color: WOOD }}>{children}</span>
      {right}
    </div>
  );
}

export function SegRow({ items, sel, onSel, small }: { items: Array<{ key: string; label: string; icon?: React.ReactNode }>; sel: string; onSel: (k: string) => void; small?: boolean }) {
  return (
    <div role="radiogroup" style={{ display: "flex", background: "rgba(43,33,24,0.06)", border: `1px solid ${HAIR}`, borderRadius: 999, padding: 3 }}>
      {items.map((it) => {
        const on = it.key === sel;
        return (
          <button key={it.key} type="button" role="radio" aria-checked={on} onClick={() => onSel(it.key)}
            className="font-extrabold"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: small ? 13.5 : 15, padding: small ? "9px 0" : "12px 0", borderRadius: 999, background: on ? LIME : "transparent", border: on ? "1.5px solid var(--ink)" : "1.5px solid transparent", color: "var(--ink)", minWidth: 0 }}>
            {it.icon}<span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CheckBox({ on }: { on: boolean }) {
  return <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${on ? "var(--ink)" : "rgba(43,33,24,0.35)"}`, background: on ? LIME : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{on ? "✓" : ""}</span>;
}

export function QuietNext({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-end gap-2 font-extrabold"
      style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 13, fontSize: 17, background: "transparent" }}>
      {label} <span style={{ fontSize: 20 }}>→</span>
    </button>
  );
}

export function ToggleRow({ label, sub, on, onToggle, last }: { label: string; sub?: string; on: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 text-left"
      style={{ padding: "13px 13px", borderBottom: last ? "none" : `1px solid ${HAIR}`, background: "transparent" }}>
      <span className="flex-1 min-w-0">
        <span className="block font-bold" style={{ fontSize: 15.5 }}>{label}</span>
        {sub && <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 46, height: 27, borderRadius: 999, background: on ? LIME : "transparent", border: `1.5px solid ${on ? "var(--ink)" : HAIR}`, position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 2, left: on ? 21 : 2, width: 19, height: 19, borderRadius: "50%", background: "var(--cream2)", border: "1.5px solid var(--ink)", boxSizing: "border-box", transition: "left 120ms" }} />
      </span>
    </button>
  );
}

export function DetailCard({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px solid ${HAIR}`, borderRadius: 12, background: CARD, overflow: "hidden" }}>{children}</div>;
}

export function AccordionRow({ label, value, children, last }: { label: string; value: string; children: React.ReactNode; last?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: last ? "none" : `1px solid ${HAIR}` }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 text-left" style={{ padding: "13px 13px", background: "transparent" }} aria-expanded={open}>
        <span className="flex-1 font-bold" style={{ fontSize: 15.5 }}>{label}</span>
        <span className="font-bold truncate" style={{ fontSize: 14.5, opacity: 0.6, maxWidth: 150 }}>{value}</span>
        <span style={{ fontSize: 15, opacity: 0.6, flexShrink: 0 }}>{open ? "▲" : "›"}</span>
      </button>
      {open && children}
    </div>
  );
}

/** Level range as a tappable track: tap a dot → the NEAREST endpoint moves there. */
export function LevelTrack({ lo, hi, onChange, endLow, endHigh }: { lo: number; hi: number; onChange: (lo: number, hi: number) => void; endLow: string; endHigh: string }) {
  const n = 5;
  const pct = (i: number) => (i / (n - 1)) * 100;
  function tap(level: number) {
    if (level < lo) onChange(level, hi);
    else if (level > hi) onChange(lo, level);
    else if (Math.abs(level - lo) <= Math.abs(level - hi)) onChange(level, hi);
    else onChange(lo, level);
  }
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display" style={{ fontSize: 20 }}>L</span>
        <span className="font-display" style={{ fontSize: 20, color: LV_COLORS[lo - 1] }}>{lo}</span>
        <span className="font-display" style={{ fontSize: 20, opacity: 0.5 }}>–</span>
        <span className="font-display" style={{ fontSize: 20, color: LV_COLORS[hi - 1] }}>{hi}</span>
      </div>
      <div style={{ position: "relative", height: 34, margin: "4px 9px 0" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 13, height: 7, borderRadius: 999, background: "rgba(43,33,24,0.16)" }} />
        <div style={{ position: "absolute", left: `${pct(lo - 1)}%`, right: `${100 - pct(hi - 1)}%`, top: 13, height: 7, borderRadius: 999, background: LIME }} />
        {Array.from({ length: n }).map((_, i) => {
          const on = i + 1 >= lo && i + 1 <= hi;
          return (
            <button key={i} type="button" onClick={() => tap(i + 1)}
              aria-label={`L${i + 1}`}
              style={{ position: "absolute", left: `${pct(i)}%`, top: 0, transform: "translateX(-50%)", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", padding: 0 }}>
              <span style={{ width: 17, height: 17, borderRadius: "50%", background: on ? "var(--ink)" : "var(--cream2)", border: `2px solid ${on ? "var(--ink)" : "rgba(43,33,24,0.35)"}`, display: "block" }} />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="font-bold" style={{ fontSize: 12.5, opacity: 0.6 }}>{endLow}</span>
        <span className="font-bold" style={{ fontSize: 12.5, opacity: 0.6 }}>{endHigh}</span>
      </div>
    </div>
  );
}

/** Vertical scroll wheel (native-picker feel): center row large, neighbors fade,
 *  scroll-snap + tap-to-select. "—" as the first row = nothing chosen yet. */
export const WHEEL_ITEM = 38;
export const WHEEL_H = 138;
export function Wheel({ label, items, value, onChange, disabled }: { label: string; items: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsKey = items.join("|");

  // external value → scroll position (initial mount, prefill, resets)
  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value));
    setCenter(idx);
    const el = ref.current;
    if (el && Math.round(el.scrollTop / WHEEL_ITEM) !== idx) el.scrollTop = idx * WHEEL_ITEM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, itemsKey]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM)));
    setCenter(idx);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { if (items[idx] !== undefined && items[idx] !== value) onChange(items[idx]); }, 140);
  }

  return (
    <div style={{ flex: 1, opacity: disabled ? 0.35 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div className="text-center font-extrabold uppercase" style={{ fontSize: 12, letterSpacing: "0.1em", color: WOOD, marginBottom: 4 }}>{label}</div>
      <div style={{ position: "relative", height: WHEEL_H, WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 28%, black 72%, transparent 100%)", maskImage: "linear-gradient(180deg, transparent 0%, black 28%, black 72%, transparent 100%)" }}>
        <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 40, background: "rgba(43,33,24,0.07)", borderRadius: 8 }} />
        <div ref={ref} onScroll={onScroll} role="listbox" aria-label={label}
          style={{ position: "absolute", inset: 0, overflowY: "auto", scrollSnapType: "y mandatory", scrollbarWidth: "none", paddingTop: (WHEEL_H - WHEEL_ITEM) / 2, paddingBottom: (WHEEL_H - WHEEL_ITEM) / 2 }}>
          {items.map((h, i) => {
            const dist = Math.abs(i - center);
            const isCenter = i === center;
            return (
              <button key={h + i} type="button" role="option" aria-selected={h === value}
                onClick={() => onChange(h)}
                className={isCenter ? "font-display" : "font-bold"}
                style={{ height: WHEEL_ITEM, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "center", fontSize: isCenter ? 27 : 16, color: "var(--ink)", opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.28, background: "transparent", padding: 0 }}>
                {h}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
