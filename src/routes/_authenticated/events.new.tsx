import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { LEVELS, CITIES, DURATIONS, durationLabel, type City } from "@/lib/courtship";
import { createEventRequest, updateMyEvent, fetchEventSwish, fetchEventContact, type EventRow } from "@/lib/events";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { DateChipPicker } from "@/components/DateChipPicker";
import { CourtCombobox } from "@/components/CourtCombobox";
import { SlotPicker } from "@/components/SlotPicker";

export const Route = createFileRoute("/_authenticated/events/new")({
  head: () => ({ meta: [{ title: "Host an event — Courtship" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: NewEvent,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }

function NewEvent() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id: editId } = Route.useSearch();
  const editing = !!editId;

  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<number>(90);
  const [city, setCity] = useState<City>("Uppsala");
  const [courtId, setCourtId] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [anyone, setAnyone] = useState(true);
  const [levelMin, setLevelMin] = useState(1);
  const [levelMax, setLevelMax] = useState(5);
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [swish, setSwish] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const cs = await fetchCourtsForPicker();
      setCourts(cs);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setReady(true); return; }
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("home_city,phone_e164")
        .eq("id", u.user.id)
        .maybeSingle();
      const hc = (((p as any)?.home_city) ?? "Uppsala") as City;

      if (editing && editId) {
        const { data: ev } = await (supabase as any)
          .from("event_requests").select("*").eq("id", editId).maybeSingle();
        const e = ev as EventRow | null;
        if (e) {
          setTitle(e.title ?? "");
          if (e.starts_at) {
            const d = new Date(e.starts_at);
            const day = new Date(d); day.setHours(0, 0, 0, 0);
            setDate(day);
            setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
          }
          if (e.duration_min) setDuration(e.duration_min);
          setCity((e.city as City) ?? hc);
          const court = cs.find((c) => c.name === e.location);
          if (court) setCourtId(court.id);
          setFormat(e.format ?? "");
          if (e.level_min != null && e.level_max != null && !(e.level_min === 1 && e.level_max === 5)) {
            setAnyone(false); setLevelMin(e.level_min); setLevelMax(e.level_max);
          }
          setCapacity(e.capacity != null ? String(e.capacity) : "");
          setPrice(e.price_sek != null ? String(e.price_sek) : "");
          setDescription(e.description ?? "");
          try { const sw = await fetchEventSwish(editId); if (sw) setSwish(sw); } catch { /* ignore */ }
          try { const ct = await fetchEventContact(editId); if (ct) setContact(ct); } catch { /* ignore */ }
        }
      } else {
        setCity(hc);
        if ((p as any)?.phone_e164) setContact((p as any).phone_e164);
        const first = cs.find((c) => c.city === hc) ?? cs[0];
        if (first) setCourtId(first.id);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the court valid for the chosen city (create mode; editing keeps the loaded court).
  useEffect(() => {
    if (!courts.length || editing) return;
    const cur = courts.find((c) => c.id === courtId);
    if (!cur || cur.city !== city) {
      const first = courts.find((c) => c.city === city);
      if (first) setCourtId(first.id);
    }
  }, [city, courts, courtId, editing]);

  const startsAt = useMemo(() => {
    if (!time) return null;
    const base = new Date(date);
    const [h, m] = time.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [date, time]);

  const court = courts.find((c) => c.id === courtId);
  const canSubmit = !!(title.trim() && startsAt && courtId && court);

  async function submit() {
    if (!canSubmit || !startsAt || !court) { toast.error(t("ev.fill_required")); return; }
    setBusy(true);
    const payload = {
      title: title.trim(),
      starts_at: startsAt.toISOString(),
      city: court.city ?? city,
      location: court.name,
      format: format.trim() || null,
      capacity: capacity ? Math.max(1, parseInt(capacity, 10)) : null,
      price_sek: price ? Math.max(0, parseInt(price, 10)) : null,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      duration_min: duration,
      swish_number: swish.trim() || null,
      description: description.trim() || null,
      contact: contact.trim() || null,
    };
    try {
      if (editing && editId) {
        await updateMyEvent(editId, payload);
        toast.success(t("ev.updated"));
      } else {
        await createEventRequest(payload);
        toast.success(t("ev.submitted"));
      }
      navigate({ to: "/board" });
    } catch (e: any) {
      oops(e);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;

  return (
    <div className="space-y-5">
      <Link to="/board" className="text-sm font-extrabold underline">{t("sos.back")}</Link>
      <div>
        <h1 className="font-display text-4xl leading-tight">{editing ? t("ev.edit_title") : t("ev.title")}</h1>
        <p className="text-base font-semibold text-[var(--ink)] mt-1">{editing ? t("ev.edit_sub") : t("ev.sub")}</p>
      </div>

      <Section label={t("ev.f_title")}>
        <input className="cinput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ev.f_title_ph")} />
      </Section>

      <Section label={t("sos.when")}>
        <DateChipPicker value={date} onChange={setDate} />
        <div className="mt-3">
          <div className="csection-label mb-1">{t("slot.label")}</div>
          <SlotPicker city={city} date={date} value={time} onChange={setTime} ariaLabel={t("slot.label")} />
        </div>
        <div className="mt-3">
          <div className="csection-label mb-1">{t("sos.duration")}</div>
          <div className="flex gap-2 flex-wrap">
            {DURATIONS.map((d) => (
              <Chip key={d} on={duration === d} onClick={() => setDuration(d)}>{durationLabel(d)}</Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section label={t("sos.court")}>
        <div className="flex gap-2 mb-2">
          {CITIES.map((cy) => (
            <Chip key={cy} on={city === cy} onClick={() => setCity(cy)}>📍 {cy}</Chip>
          ))}
        </div>
        <CourtCombobox
          city={city}
          valueId={courtId}
          onChange={(id, c) => { setCourtId(id); if (c) setCourts((p) => p.some((x) => x.id === c.id) ? p : [...p, c]); }}
        />
      </Section>

      <Section label={t("ev.f_format")}>
        <input className="cinput" value={format} onChange={(e) => setFormat(e.target.value)} placeholder={t("ev.f_format_ph")} />
      </Section>

      <Section label={t("sos.level_range")}>
        <Chip on={anyone} onClick={() => setAnyone(!anyone)}>{t("sos.anyone")}</Chip>
        {!anyone && (
          <div className="flex items-center gap-2 mt-2">
            <select className="cinput flex-1" value={levelMin} onChange={(e) => setLevelMin(Number(e.target.value))}>
              {LEVELS.map((l) => <option key={l.n} value={l.n}>{l.n} · {l.name}</option>)}
            </select>
            <span className="font-extrabold">–</span>
            <select className="cinput flex-1" value={levelMax} onChange={(e) => setLevelMax(Number(e.target.value))}>
              {LEVELS.map((l) => <option key={l.n} value={l.n}>{l.n} · {l.name}</option>)}
            </select>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Section label={t("ev.f_capacity")}>
          <input className="cinput" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={t("ev.f_capacity_ph")} />
        </Section>
        <Section label={t("ev.f_price")}>
          <input className="cinput" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("ev.f_price_ph")} />
        </Section>
      </div>

      <Section label={t("ev.f_swish")}>
        <input className="cinput" value={swish} onChange={(e) => setSwish(e.target.value)} placeholder={t("ev.f_swish_ph")} />
      </Section>

      <Section label={t("ev.f_desc")}>
        <textarea className="cinput" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ev.f_desc_ph")} />
      </Section>

      <Section label={t("ev.f_contact")}>
        <input className="cinput" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("ev.f_contact_ph")} />
      </Section>

      {!editing && <div className="text-sm text-[var(--ink)] font-semibold">{t("ev.review_note")}</div>}

      <button disabled={busy || !canSubmit} onClick={submit} className="cbtn cbtn-coral w-full">
        {busy ? "..." : editing ? t("ev.save") : t("ev.submit")}
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label mb-1">{label}</div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`cchip ${on ? "cchip-on" : ""}`}>
      {children}
    </button>
  );
}
