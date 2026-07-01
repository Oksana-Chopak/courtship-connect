import { useMemo, useState } from "react";
import { useI18n, type Lang } from "@/lib/i18n";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function fmtChip(d: Date, lang: Lang): string {
  return d.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Day chips: Today, Tomorrow, [picked date if any], "Pick a date" → calendar. */
export function DateChipPicker({ value, onChange, maxDays = 21 }: { value: Date; onChange: (d: Date) => void; maxDays?: number }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const maxDate = addDays(today, maxDays);
  const v = startOfDay(value);
  const mode: "today" | "tomorrow" | "custom" = sameDay(v, today) ? "today" : sameDay(v, tomorrow) ? "tomorrow" : "custom";

  function pickPreset(d: Date) {
    const next = new Date(d);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`cchip ${mode === "today" ? "cchip-on" : ""}`} onClick={() => pickPreset(today)}>
          {t("sos.today")}
        </button>
        <button type="button" className={`cchip ${mode === "tomorrow" ? "cchip-on" : ""}`} onClick={() => pickPreset(tomorrow)}>
          {t("sos.tomorrow")}
        </button>
        {mode === "custom" && (
          <button type="button" className="cchip cchip-on" onClick={() => setOpen(true)}>
            {fmtChip(v, lang)}
          </button>
        )}
        <button type="button" className="cchip" onClick={() => setOpen(true)}>
          📅 {t("date.pick")}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }}
          onClick={() => setOpen(false)}>
          <div className="ccard p-4 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl">{t("date.pick_title")}</div>
              <button type="button" onClick={() => setOpen(false)} className="text-base font-extrabold underline">{t("date.close")}</button>
            </div>
            <CalendarMonths
              selected={v}
              today={today}
              maxDate={maxDate}
              lang={lang}
              onPick={(d) => { pickPreset(d); setOpen(false); }}
            />
            <div className="text-base font-semibold text-[var(--ink)]">{t("date.window_help", { days: maxDays })}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarMonths({ selected, today, maxDate, lang, onPick }: {
  selected: Date; today: Date; maxDate: Date; lang: Lang; onPick: (d: Date) => void;
}) {
  const months = useMemo(() => {
    const list: Date[] = [];
    let m = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    while (m <= end) {
      list.push(m);
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
    return list;
  }, [today, maxDate]);
  return (
    <div className="space-y-5">
      {months.map((m) => (
        <MonthGrid key={m.toISOString()} month={m} selected={selected} today={today} maxDate={maxDate} lang={lang} onPick={onPick} />
      ))}
    </div>
  );
}

function MonthGrid({ month, selected, today, maxDate, lang, onPick }: {
  month: Date; selected: Date; today: Date; maxDate: Date; lang: Lang; onPick: (d: Date) => void;
}) {
  const monthLabel = month.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { month: "long", year: "numeric" });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Monday-first
  const firstDow = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  const dayHeaders = lang === "sv" ? ["må","ti","on","to","fr","lö","sö"] : ["Mo","Tu","We","Th","Fr","Sa","Su"];
  return (
    <div>
      <div className="font-display text-xl mb-2 text-center">{monthLabel}</div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map((h) => (
          <div key={h} className="text-base font-extrabold text-center text-[var(--ink)]">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const disabled = d < today || d > maxDate;
          const isSel = d.toDateString() === selected.toDateString();
          const isToday = d.toDateString() === today.toDateString();
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              className="rounded-xl border-2 flex items-center justify-center font-extrabold text-base"
              style={{
                minHeight: 48,
                background: isSel ? "var(--green-pop)" : "var(--cream2)",
                borderColor: isToday ? "var(--coral)" : "var(--ink)",
                color: "var(--ink)",
                opacity: disabled ? 0.3 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}