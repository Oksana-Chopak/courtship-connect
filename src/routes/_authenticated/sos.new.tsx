import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { activeSosCount } from "@/lib/sos";
import { notifySos, notifyUsers } from "@/lib/push";
import { fetchBuddyIds } from "@/lib/buddies";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { COURT_STATUSES, SOS_FORMATS, LEVELS, CITIES, isUrgent, generateSlots, snapToSlot, cityGranularity, COURT_TYPES, courtTypeMeta, whenLabel, DURATIONS, durationLabel, type City, type CourtType } from "@/lib/courtship";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { DateChipPicker } from "@/components/DateChipPicker";
import { CourtCombobox } from "@/components/CourtCombobox";
import { SlotPicker } from "@/components/SlotPicker";

export const Route = createFileRoute("/_authenticated/sos/new")({
  head: () => ({ meta: [{ title: "New post — Courtship" }] }),
  component: NewSos,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toLocalTimeValue(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function NewSos() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [myLevel, setMyLevel] = useState(3);
  const [uid, setUid] = useState<string | null>(null);
  const [city, setCity] = useState<City>("Uppsala");

  // Default date = Today; NO time preselected (user must pick a slot — prevents accidental instant send).
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState<string>("");
  const [courtId, setCourtId] = useState<string>("");
  const [courtType, setCourtType] = useState<CourtType>("outdoor");
  const [format, setFormat] = useState<typeof SOS_FORMATS[number]["value"]>("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<typeof COURT_STATUSES[number]["value"]>("booked");
  const [duration, setDuration] = useState<number>(60);
  const [note, setNote] = useState("");
  const [autoFlare, setAutoFlare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [myName, setMyName] = useState("");
  const [buddies, setBuddies] = useState<Array<{ id: string; name: string }>>([]);
  const [inviteIds, setInviteIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const cs = await fetchCourtsForPicker();
      setCourts(cs);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("name,level,home_city")
        .eq("id", u.user.id)
        .maybeSingle();
      const lv = (p as any)?.level ?? 3;
      const hc = ((p as any)?.home_city ?? "Uppsala") as City;
      setMyLevel(lv);
      setCity(hc);
      setMyName((p as any)?.name ?? "");
      try {
        const bids = await fetchBuddyIds(u.user!.id);
        if (bids.size) {
          const { data: dir } = await (supabase as any).rpc("players_directory", { _ids: [...bids] });
          setBuddies(((dir as any[]) ?? []).map((x) => ({ id: x.id, name: x.name })));
        }
      } catch { /* ignore */ }
      const first = cs.find((c) => c.city === hc) ?? cs[0];
      if (first) setCourtId(first.id);
      setLevelMin(Math.max(1, lv - 1));
      setLevelMax(Math.min(5, lv + 1));
      // Default court_type from this user's most recent post
      const { data: last } = await (supabase as any)
        .from("sos_requests")
        .select("court_type")
        .eq("caller_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastCt = (last as any)?.court_type as CourtType | undefined;
      if (lastCt === "indoor" || lastCt === "outdoor") setCourtType(lastCt);
    })();
  }, []);

  // When city changes, pick first matching court if current isn't in city
  useEffect(() => {
    if (!courts.length) return;
    const cur = courts.find((c) => c.id === courtId);
    if (!cur || cur.city !== city) {
      const first = courts.find((c) => c.city === city);
      if (first) setCourtId(first.id);
    }
  }, [city, courts, courtId]);

  // Keep the selected time valid for the chosen city + date; clear it if it falls outside the available slots.
  useEffect(() => {
    if (!time) return;
    if (!generateSlots(city, date).includes(time)) setTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, date]);

  const playAt = useMemo(() => {
    if (!time) return null;
    const base = new Date(date);
    const [h, m] = time.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [date, time]);

  const urgent = playAt ? isUrgent(playAt) : false;
  const canSubmit = !!(playAt && courtId && courtType && format);

  async function doSubmit() {
    if (!uid || !playAt) return;
    if (!courtId) { toast.error(t("sos.err_pick_court")); return; }
    if (playAt.getTime() < Date.now()) { toast.error(t("sos.err_time_gone")); return; }
    setBusy(true);
    if (urgent) {
      const count = await activeSosCount(uid);
      if (count >= 3) {
        setBusy(false);
        toast.error(t("sos.err_max3"));
        return;
      }
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
      kind: urgent ? "sos" : "open",
      auto_flare: urgent ? false : autoFlare,
      flared_at: urgent ? new Date().toISOString() : null,
      court_type: courtType,
      duration_min: duration,
    };
    let res = await (supabase as any).from("sos_requests").insert(insertRow).select("id").single();
    if (res.error && /duration_min/i.test(res.error.message || "")) {
      // duration_min column not migrated yet — post without it so creation never breaks
      const { duration_min: _omit, ...fallback } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(fallback).select("id").single();
    }
    const { data, error } = res;
    setBusy(false);
    if (error) { oops(error); return; }
    if (inviteIds.length) {
      const court = courts.find((c) => c.id === courtId);
      void notifyUsers(inviteIds, {
        title: t("invite.push_title", { name: myName || "A buddy" }),
        body: t("invite.push_body", { when: playAt ? whenLabel(playAt.toISOString()) : "", court: court?.name || "the court" }),
        url: `/sos/${data.id}`,
        tag: `invite-${data.id}`,
      });
    }
    if (urgent) {
      void notifySos(data.id);
      toast.success(t("post.sos_toast"));
      navigate({ to: "/sos/$id", params: { id: data.id } });
    } else {
      toast.success(t("post.posted_toast"));
      navigate({ to: "/games" });
    }
  }

  function onSubmitClick() {
    if (!canSubmit) return;
    if (urgent) { setShowConfirm(true); return; }
    doSubmit();
  }

  return (
    <div className="space-y-5">
      <Link to="/board" className="text-sm font-extrabold underline">{t("sos.back")}</Link>
      <div>
        <h1 className="font-display text-4xl">{t("post.new_title")}</h1>
      </div>

      <Section label={t("sos.when")}>
        <DateChipPicker value={date} onChange={setDate} />
        <div className="mt-3">
          <div className="csection-label mb-1">{t("slot.label")}</div>
          <SlotPicker city={city} date={date} value={time} onChange={setTime} ariaLabel={t("slot.label")} />
          <div className="mt-1 text-base font-semibold text-[var(--ink)]">
            {cityGranularity(city) === 30 ? t("slot.help_stockholm") : t("slot.help_uppsala")}
          </div>
        </div>
        {time && (
          <div
            className="mt-2 rounded-2xl border-2 border-[var(--ink)] px-3 py-2 font-semibold"
            style={{
              background: urgent ? "var(--coral)" : "var(--green-pop)",
              color: urgent ? "#FFF6E8" : "var(--ink)",
              fontSize: "1rem",
            }}
            aria-live="polite"
          >
            {urgent ? t("post.info_urgent") : t("post.info_planned")}
          </div>
        )}
      </Section>

      <Section label={t("sos.court")}>
        <div className="flex gap-2 mb-2">
          {CITIES.map((cy) => (
            <Chip key={cy} on={city === cy} onClick={() => setCity(cy)}>
              📍 {cy}
            </Chip>
          ))}
        </div>
        <CourtCombobox city={city} valueId={courtId} onChange={(id, c) => { setCourtId(id); if (c) setCourts((p) => p.some((x) => x.id === c.id) ? p : [...p, c]); }} />
        <div className="mt-3">
          <div className="csection-label mb-1">{t("ct.label")}</div>
          <div
            role="radiogroup"
            aria-label={t("ct.label")}
            className="grid grid-cols-2 gap-2"
          >
            {COURT_TYPES.map((ct) => {
              const meta = courtTypeMeta(ct, lang);
              const on = courtType === ct;
              return (
                <button
                  key={ct}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCourtType(ct)}
                  className="rounded-2xl border-2 border-[var(--ink)] font-extrabold flex items-center justify-center gap-2"
                  style={{
                    minHeight: 56,
                    fontSize: "1.125rem",
                    background: on ? "var(--green-pop)" : "var(--cream2)",
                    color: "var(--ink)",
                  }}
                >
                  <span>{meta.emoji}</span><span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
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

      <Section label={t("sos.duration")}>
        <div className="flex gap-2 flex-wrap">
          {DURATIONS.map((d) => (
            <Chip key={d} on={duration === d} onClick={() => setDuration(d)}>{durationLabel(d)}</Chip>
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

      {!urgent && (
        <Section label={t("post.auto_flare_label")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--ink)] font-semibold flex-1">
              {t("post.auto_flare_help")}
            </p>
            <Chip on={autoFlare} onClick={() => setAutoFlare(!autoFlare)}>
              {autoFlare ? "ON" : "OFF"}
            </Chip>
          </div>
        </Section>
      )}

      {buddies.length > 0 && (
        <Section label={t("sos.invite_buddies")}>
          <div className="flex gap-2 flex-wrap">
            {buddies.map((b) => {
              const on = inviteIds.includes(b.id);
              return (
                <Chip key={b.id} on={on} onClick={() => setInviteIds((prev) => (on ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}>
                  {b.name}
                </Chip>
              );
            })}
          </div>
          <p className="text-sm text-[var(--ink)] font-semibold mt-2">{t("sos.invite_hint")}</p>
        </Section>
      )}

      <button
        disabled={busy || !canSubmit}
        onClick={onSubmitClick}
        className={`cbtn w-full ${urgent ? "cbtn-coral" : "cbtn-green"}`}
      >
        {busy ? "..." : !time ? t("post.pick_a_time") : urgent ? t("post.cta_urgent") : t("post.cta_planned")}
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          role="dialog"
          aria-modal="true"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full sm:max-w-md ccard p-5 space-y-3"
            style={{ background: "var(--cream)", borderColor: "var(--ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-2xl">{t("post.confirm_title")}</div>
            <button
              disabled={busy}
              onClick={() => { setShowConfirm(false); doSubmit(); }}
              className="cbtn cbtn-coral w-full"
            >
              {t("post.confirm_send")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="cbtn cbtn-ghost w-full"
            >
              {t("post.confirm_cancel")}
            </button>
          </div>
        </div>
      )}
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