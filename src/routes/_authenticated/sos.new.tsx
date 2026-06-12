import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourts, activeSosCount, type CourtRow } from "@/lib/sos";
import { COURT_STATUSES, SOS_FORMATS, LEVELS } from "@/lib/courtship";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/sos/new")({
  head: () => ({ meta: [{ title: "Save my set — Courtship" }] }),
  component: NewSos,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toLocalTimeValue(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function NewSos() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [myLevel, setMyLevel] = useState(3);
  const [uid, setUid] = useState<string | null>(null);

  const defaultDate = useMemo(() => new Date(Date.now() + 2 * 3600 * 1000), []);
  const [day, setDay] = useState<"today" | "tomorrow">(
    defaultDate.toDateString() === new Date().toDateString() ? "today" : "tomorrow",
  );
  const [time, setTime] = useState<string>(toLocalTimeValue(defaultDate));
  const [courtId, setCourtId] = useState<string>("");
  const [format, setFormat] = useState<typeof SOS_FORMATS[number]["value"]>("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<typeof COURT_STATUSES[number]["value"]>("booked");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const cs = await fetchCourts();
      setCourts(cs);
      if (cs[0]) setCourtId(cs[0].id);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("level")
        .eq("id", u.user.id)
        .maybeSingle();
      const lv = (p as any)?.level ?? 3;
      setMyLevel(lv);
      setLevelMin(Math.max(1, lv - 1));
      setLevelMax(Math.min(5, lv + 1));
    })();
  }, []);

  const playAt = useMemo(() => {
    const base = day === "today" ? new Date() : new Date(Date.now() + 86400000);
    const [h, m] = time.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [day, time]);

  async function submit() {
    if (!uid) return;
    if (!courtId) { toast.error("Pick a court"); return; }
    if (playAt.getTime() < Date.now()) { toast.error("That time's already gone ⏰"); return; }
    setBusy(true);
    const count = await activeSosCount(uid);
    if (count >= 3) {
      setBusy(false);
      toast.error("Easy, hero — max 3 SOS at once. Cancel one first.");
      return;
    }
    const insertRow: any = {
      caller_id: uid,
      play_at: playAt.toISOString(),
      court_id: courtId,
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      note: note.trim() || null,
      status: "active",
    };
    const { data, error } = await (supabase as any)
      .from("sos_requests")
      .insert(insertRow)
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("SOS sent 🚨");
    navigate({ to: "/sos/$id", params: { id: data.id } });
  }

  return (
    <div className="space-y-5">
      <Link to="/home" className="text-sm font-extrabold underline">{t("sos.back")}</Link>
      <div>
        <h1 className="font-display text-4xl">{t("sos.new_title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("sos.new_sub")}</p>
      </div>

      <Section label={t("sos.when")}>
        <div className="flex gap-2">
          <Chip on={day === "today"} onClick={() => setDay("today")}>{t("sos.today")}</Chip>
          <Chip on={day === "tomorrow"} onClick={() => setDay("tomorrow")}>{t("sos.tomorrow")}</Chip>
          <input
            type="time"
            className="cinput flex-1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </Section>

      <Section label={t("sos.court")}>
        <select className="cinput" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.area ? ` · ${c.area}` : ""}</option>
          ))}
        </select>
      </Section>

      <Section label={t("sos.format")}>
        <div className="flex flex-wrap gap-2">
          {SOS_FORMATS.map((f) => (
            <Chip key={f.value} on={format === f.value} onClick={() => setFormat(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label={t("sos.level_range")}>
        <div className="flex items-center justify-between">
          <Chip on={anyone} onClick={() => setAnyone(!anyone)}>
            {t("sos.anyone")}
          </Chip>
        </div>
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
        <div className="text-xs text-[var(--ink)] mt-1">L{myLevel}</div>
      </Section>

      <Section label={t("sos.court_status")}>
        <div className="flex flex-wrap gap-2">
          {COURT_STATUSES.map((s) => (
            <Chip key={s.value} on={courtStatus === s.value} onClick={() => setCourtStatus(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label={t("sos.note_label")}>
        <input
          className="cinput"
          placeholder={t("sos.note_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={140}
        />
      </Section>

      <button disabled={busy} onClick={submit} className="cbtn cbtn-coral w-full">
        {busy ? "..." : t("sos.send")}
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