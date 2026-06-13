import { useMemo, useState } from "react";
import { generateSlots } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

/** Tap-to-open time picker. Shows valid slots for the city AND the chosen date. */
export function SlotPicker({
  city,
  date,
  value,
  onChange,
  ariaLabel,
}: {
  city: string;
  date: Date;
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const slots = useMemo(() => generateSlots(city, date), [city, date]);

  return (
    <div>
      <button
        type="button"
        className={`cchip ${value ? "cchip-on" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        style={{ minHeight: 48, fontSize: "1.1875rem" }}
      >
        🕐 {value || t("slot.pick")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="ccard p-4 w-full max-w-md space-y-3"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--cream2)" }}
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl">{t("slot.pick_title")}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-base font-extrabold underline"
              >
                {t("date.close")}
              </button>
            </div>
            {slots.length === 0 ? (
              <div className="text-base font-semibold text-[var(--ink)] py-4 text-center">
                {t("slot.none_today")}
              </div>
            ) : (
              <div
                role="listbox"
                aria-label={ariaLabel}
                className="border-2 border-[var(--ink)] rounded-2xl overflow-y-auto"
                style={{ background: "var(--cream)", maxHeight: 320 }}
              >
                {slots.map((s) => {
                  const on = s === value;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => { onChange(s); setOpen(false); }}
                      className="w-full text-left px-4 font-extrabold border-b border-[var(--ink)]/15 last:border-b-0"
                      style={{
                        minHeight: 48,
                        fontSize: "1.1875rem",
                        background: on ? "var(--green-pop)" : "transparent",
                        color: "var(--ink)",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
