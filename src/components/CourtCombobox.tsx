import { useEffect, useMemo, useState } from "react";
import { addCustomCourt, fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { oops } from "@/lib/oops";

/** Searchable, accessible court picker with "Add your own" action. */
export function CourtCombobox({
  city,
  valueId,
  onChange,
}: {
  city: string;
  valueId: string;
  onChange: (id: string, court: CourtFull) => void;
}) {
  const { t } = useI18n();
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchCourtsForPicker().then(setCourts); }, []);

  const inCity = useMemo(() => courts.filter((c) => c.city === city), [courts, city]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inCity;
    return inCity.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.area ?? "").toLowerCase().includes(q),
    );
  }, [inCity, query]);

  const exactMatch = filtered.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());
  const showAddRow = query.trim().length >= 2 && !exactMatch;

  const selected = courts.find((c) => c.id === valueId);
  const display = selected ? `${selected.name}${selected.area ? ` · ${selected.area}` : ""}` : "";

  const seeded = filtered.filter((c) => !c.is_custom);
  const custom = filtered.filter((c) => c.is_custom);

  async function doAdd() {
    const name = addName.trim();
    if (name.length < 2) { toast.error(t("court.name_too_short")); return; }
    if (busy) return;
    setBusy(true);
    try {
      const created = await addCustomCourt({ name, area: area || null, city });
      setCourts((p) => [...p, created]);
      onChange(created.id, created);
      setAddOpen(false);
      setAddName("");
      setArea("");
      setQuery("");
      setOpen(false);
      toast.success(t("court.added"));
    } catch (e: any) {
      oops(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <input
        className="cinput"
        placeholder={t("court.search_placeholder")}
        value={open ? query : display}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        aria-label={t("sos.court")}
      />
      {open && (
        <div
          className="absolute left-0 right-0 mt-2 z-20 ccard p-1 max-h-[60vh] overflow-y-auto"
          style={{ background: "var(--cream2)" }}
        >
          {seeded.length > 0 && (
            <>
              <div className="csection-label px-3 pt-2 pb-1">{t("court.group_seeded")}</div>
              {seeded.map((c) => (
                <CourtRow key={c.id} c={c} selected={c.id === valueId} onPick={() => { onChange(c.id, c); setOpen(false); setQuery(""); }} />
              ))}
            </>
          )}
          {custom.length > 0 && (
            <>
              <div className="csection-label px-3 pt-3 pb-1">{t("court.group_custom")}</div>
              {custom.map((c) => (
                <CourtRow key={c.id} c={c} selected={c.id === valueId} onPick={() => { onChange(c.id, c); setOpen(false); setQuery(""); }} />
              ))}
            </>
          )}
          {filtered.length === 0 && !showAddRow && (
            <div className="px-3 py-4 text-base text-[var(--ink)] font-semibold">{t("court.no_matches")}</div>
          )}
          {showAddRow && (
            <button
              type="button"
              onClick={() => { setAddName(query.trim()); setAddOpen(true); }}
              className="w-full text-left flex items-center px-3 rounded-xl hover:bg-[var(--green-pop)]"
              style={{ minHeight: 56, fontSize: "1.0625rem", fontWeight: 800, color: "var(--ink)" }}
            >
              ➕ {t("court.add_as_new", { name: query.trim() })}
            </button>
          )}
          {!showAddRow && (
            <button
              type="button"
              onClick={() => { setAddName(query.trim()); setAddOpen(true); }}
              className="w-full text-left flex items-center px-3 rounded-xl hover:bg-[var(--green-pop)]"
              style={{ minHeight: 56, fontSize: "1.0625rem", fontWeight: 800, color: "var(--ink)" }}
            >
              ➕ {t("court.add_other")}
            </button>
          )}
          <div className="text-center pt-2 pb-1">
            <button
              type="button"
              onClick={() => { setOpen(false); setQuery(""); }}
              className="text-base font-extrabold underline"
            >
              {t("court.close")}
            </button>
          </div>
        </div>
      )}

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.45)" }}
          onClick={() => !busy && setAddOpen(false)}
        >
          <div className="ccard p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div>
              <div className="csection-label">{t("court.add_dialog_title")}</div>
              <div className="text-base font-semibold text-[var(--ink)] mt-2">📍 {city}</div>
            </div>
            <div>
              <div className="csection-label mb-1">{t("court.name_label")}</div>
              <input className="cinput" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("court.name_placeholder")} maxLength={80} autoFocus />
            </div>
            <div>
              <div className="csection-label mb-1">{t("court.area_label")}</div>
              <input className="cinput" value={area} onChange={(e) => setArea(e.target.value)} placeholder={t("court.area_placeholder")} maxLength={60} />
            </div>
            <div className="text-base font-semibold text-[var(--ink)]">{t("court.add_help")}</div>
            <div className="flex gap-2">
              <button onClick={() => !busy && setAddOpen(false)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              <button onClick={doAdd} disabled={busy} className="cbtn cbtn-green flex-1">{busy ? "..." : t("court.add_cta")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CourtRow({ c, selected, onPick }: { c: CourtFull; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full text-left flex flex-col justify-center px-3 rounded-xl"
      style={{
        minHeight: 56,
        background: selected ? "var(--green-pop)" : "transparent",
        color: "var(--ink)",
      }}
    >
      <span className="font-extrabold text-base">{c.name}</span>
      {c.area && <span className="text-base">{c.area}</span>}
    </button>
  );
}