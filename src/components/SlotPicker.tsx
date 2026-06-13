import { useEffect, useMemo, useRef } from "react";
import { generateSlots } from "@/lib/courtship";

/** Vertical scroll list of valid time slots for a given city. */
export function SlotPicker({
  city,
  value,
  onChange,
  ariaLabel,
}: {
  city: string;
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  const slots = useMemo(() => generateSlots(city), [city]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the selected row into view when value or list changes.
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLButtonElement>(
      `button[data-slot="${value}"]`,
    );
    if (el && containerRef.current) {
      const c = containerRef.current;
      const top = el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2;
      c.scrollTo({ top, behavior: "auto" });
    }
  }, [value, city]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={ariaLabel}
      className="border-2 border-[var(--ink)] rounded-2xl overflow-y-auto"
      style={{ background: "var(--cream2)", maxHeight: 260 }}
    >
      {slots.map((s) => {
        const on = s === value;
        return (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={on}
            data-slot={s}
            onClick={() => onChange(s)}
            className="w-full text-left px-4 font-extrabold border-b border-[var(--ink)]/15 last:border-b-0"
            style={{
              minHeight: 48,
              fontSize: "1.1875rem", // 19px
              background: on ? "var(--green-pop)" : "transparent",
              color: "var(--ink)",
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}