import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { activeSosCount } from "@/lib/sos";
import { notifySos, notifyUsers } from "@/lib/push";
import { fetchBuddyIds } from "@/lib/buddies";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { useCityNames } from "@/lib/cities";
import { COURT_STATUSES, SOS_FORMATS, LEVELS, isUrgent, generateSlots, snapToSlot, COURT_TYPES, courtTypeMeta, whenLabel, DURATIONS, durationLabel, type City, type CourtType, SPORTS, sportMeta, type Sport } from "@/lib/courtship";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { DateChipPicker } from "@/components/DateChipPicker";
import { CourtCombobox } from "@/components/CourtCombobox";
import { SlotPicker } from "@/components/SlotPicker";

export const Route = createFileRoute("/_authenticated/sos/new")({
  head: () => ({ meta: [{ title: "New post — Courtship" }] }),
  validateSearch: (sp: Record<string, unknown>): { edit?: string; planned?: boolean } => ({
    edit: typeof sp.edit === "string" ? sp.edit : undefined,
    planned: sp.planned === true || sp.planned === "1" ? true : undefined,
  }),
  component: NewSos,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }
function toLocalTimeValue(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function NewSos() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const editing = !!editId;
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [myLevel, setMyLevel] = useState(3);
  const [uid, setUid] = useState<string | null>(null);
  const [city, setCity] = useState<City>("Uppsala");
  const [myHomeCity, setMyHomeCity] = useState<City | null>(null);

  // Default date = Today; NO time preselected (user must pick a slot — prevents accidental instant send).
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState<string>("");
  const [courtId, setCourtId] = useState<string>("");
  const [courtType, setCourtType] = useState<CourtType>("outdoor");
  const [sport, setSport] = useState<Sport>("tennis");
  const [mySports, setMySports] = useState<Sport[]>(["tennis"]);
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data } = await (supabase as any).from("profiles").select("sports,is_admin").eq("id", u.user.id).maybeSingle();
        const sp = ((data?.sports as Sport[] | null) ?? ["tennis"]).filter((x): x is Sport => x === "tennis" || x === "padel" || x === "badminton");
        if (sp.length) { setMySports(sp); if (!sp.includes("tennis")) setSport(sp[0]); }
      } catch { /* pre-SQL */ }
    })();
  }, []);
  const [format, setFormat] = useState<typeof SOS_FORMATS[number]["value"]>("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<typeof COURT_STATUSES[number]["value"]>("booked");
  const [duration, setDuration] = useState<number>(60);
  const [note, setNote] = useState("");
  const [autoFlare, setAutoFlare] = useState(true);
  const [flexible, setFlexible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ghostName, setGhostName] = useState("");
  const [ctAny, setCtAny] = useState(false);
  const [invitedMode, setInvitedMode] = useState(false);
  const [untilTime, setUntilTime] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [myName, setMyName] = useState("");
  const [buddies, setBuddies] = useState<Array<{ id: string; name: string }>>([]);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const cityNames = useCityNames();

  useEffect(() => {
    (async () => {
      const cs = await fetchCourtsForPicker();
      setCourts(cs);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("name,level,home_city,home_courts")
        .eq("id", u.user.id)
        .maybeSingle();
      const lv = (p as any)?.level ?? 3;
      const hc = ((p as any)?.home_city ?? "Uppsala") as City;
      setMyLevel(lv);
      setCity(hc);
      setMyHomeCity(hc);
      setMyName((p as any)?.name ?? "");
      try {
        const bids = await fetchBuddyIds(u.user!.id);
        if (bids.size) {
          const { data: dir } = await (supabase as any).rpc("players_directory", { _ids: [...bids] });
          void 0;
          setBuddies(((dir as any[]) ?? []).map((x) => ({ id: x.id, name: x.name })));
        }
      } catch { /* ignore */ }
      // Default the court to MY home club (from profile home_courts), not the
      // alphabetically-first court. Fall back to first-in-my-city, then first overall.
      // Fuzzy on purpose: profile home_courts is free text ("Fyrishov"), the
      // directory holds full names ("Fyrishov Tenniscenter") — exact equality
      // regressed to first-in-list. Either side may contain the other.
      const norm = (x: string) => x.toLowerCase().replace(/[^a-zà-öø-ÿ0-9]+/gi, " ").trim();
      const homeCourtName = String((p as any)?.home_courts ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0];
      const hcn = homeCourtName ? norm(homeCourtName) : "";
      const homeCourt = hcn ? cs.find((c) => { const n = norm(c.name); return n.includes(hcn) || hcn.includes(n); }) : undefined;
      const first = homeCourt ?? cs.find((c) => c.city === hc) ?? cs[0];
      if (first) { setCourtId(first.id); if (homeCourt) setCity(homeCourt.city as City); }
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

      // Edit mode: load the existing game and prefill (RLS lets the owner update it directly).
      if (editing && editId) {
        const { data: g } = await (supabase as any).from("sos_requests").select("*").eq("id", editId).maybeSingle();
        if (g?.sport) setSport(g.sport as Sport);
        if (g && g.caller_id === u.user.id) {
          const pa = new Date(g.play_at);
          const day = new Date(pa); day.setHours(0, 0, 0, 0);
          setDate(day);
          setTime(`${pad(pa.getHours())}:${pad(pa.getMinutes())}`);
          const court = cs.find((c) => c.id === g.court_id);
          if (court) { setCity(court.city as City); setCourtId(court.id); }
          if (g.court_type === "indoor" || g.court_type === "outdoor") setCourtType(g.court_type);
          if (g.format) setFormat(g.format);
          if (g.level_min === 1 && g.level_max === 5) { setAnyone(true); }
          else { setAnyone(false); setLevelMin(g.level_min); setLevelMax(g.level_max); }
          if (g.court_status) setCourtStatus(g.court_status);
          if (g.duration_min) setDuration(g.duration_min);
          if (g.play_until) {
            const pu = new Date(g.play_until);
            setFlexible(true);
            setUntilTime(`${pad(pu.getHours())}:${pad(pu.getMinutes())}`);
          }
          setNote(g.note ?? "");
        }
      }
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

  useEffect(() => {
    void (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (!au.user) return;
      const { data } = await (supabase as any).from("profiles").select("is_admin").eq("id", au.user.id).maybeSingle();
      setIsAdmin(!!data?.is_admin);
    })();
  }, []);

  const playUntil = useMemo(() => {
    if (!flexible || !untilTime) return null;
    const base = new Date(date);
    const [h, m] = untilTime.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [flexible, untilTime, date]);

  // A flexible-window game is by definition planned, never an urgent SOS.
  const urgent = flexible ? false : playAt ? isUrgent(playAt) : false;
  const effCtAny = ctAny && (courtStatus === "will_book" || courtStatus === "public");
  const canSubmit = !!(playAt && courtId && courtType && format) && (!flexible || (playUntil != null && playUntil.getTime() > (playAt?.getTime() ?? 0)));

  async function doSubmit() {
    if (!uid || !playAt) return;
    if (!courtId) { toast.error(t("sos.err_pick_court")); return; }
    if (playAt.getTime() < Date.now()) { toast.error(t("sos.err_time_gone")); return; }
    setBusy(true);
    if (editing && editId) {
      // Direct UPDATE on sos_requests was revoked in the June-19 hardening —
      // edits go through the owner-only edit_sos RPC (spots/status untouchable).
      const editArgs: any = {
        _sos_id: editId,
        _play_at: playAt.toISOString(),
        _court_id: courtId,
        _format: format,
        _level_min: anyone ? 1 : levelMin,
        _level_max: anyone ? 5 : levelMax,
        _court_status: courtStatus,
        _note: note.trim() || null,
        _court_type: courtType,
        _duration_min: duration,
        _sport: sport,
      };
      const wantsWindow = flexible && !!playUntil;
      let windowDropped = false;
      let { data: er, error } = await (supabase as any).rpc("edit_sos", { ...editArgs, _play_until: wantsWindow ? playUntil!.toISOString() : null });
      if (error && /_play_until|does not exist|schema cache/i.test(error.message ?? "")) {
        // pre-window edit_sos (11-arg) still deployed — save without the window, but SAY so
        windowDropped = wantsWindow;
        ({ data: er, error } = await (supabase as any).rpc("edit_sos", editArgs));
      }
      if (!error) {
        const row = Array.isArray(er) ? er[0] : er;
        if (!row?.ok) {
          setBusy(false);
          oops(new Error(row?.reason === "time_gone" ? t("sos.err_time_gone") : row?.reason === "bad_window" ? t("sos.err_bad_window") : String(row?.reason ?? "edit failed")));
          return;
        }
      } else if (/does not exist|schema cache/i.test(error.message ?? "")) {
        // pre-SQL fallback: the old direct update (will work once RLS allows, harmless otherwise)
        const r2 = await (supabase as any).from("sos_requests").update({
          play_at: playAt.toISOString(), court_id: courtId, format,
          level_min: anyone ? 1 : levelMin, level_max: anyone ? 5 : levelMax,
          court_status: courtStatus, note: note.trim() || null,
          court_type: courtType, duration_min: duration,
        }).eq("id", editId).eq("caller_id", uid);
        error = r2.error;
      }
      setBusy(false);
      if (error) { oops(error); return; }
      if (windowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      else toast.success(t("sos.edit_saved"));
      navigate({ to: "/sos/$id", params: { id: editId } });
      return;
    }
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
      play_until: flexible && playUntil ? playUntil.toISOString() : null,
      ...(isAdmin && ghostName.trim() ? { ghost_name: ghostName.trim(), ghost_claim_token: crypto.randomUUID() } : {}),
      court_type_any: effCtAny,
      ...(urgent && invitedMode ? { broadcast: false, invite_join_token: crypto.randomUUID() } : {}),
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
      sport,
    };
    let res = await (supabase as any).from("sos_requests").insert(insertRow).select("id").single();
    if (res.error && /sport/i.test(res.error.message || "")) {
      const { sport: _s, ...rest } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(rest).select("id").single();
    }
    let createWindowDropped = false;
    if (res.error && /court_type_any|broadcast|invite_join_token/i.test(res.error.message || "")) {
      const { court_type_any: _c1, broadcast: _c2, invite_join_token: _c3, ...noNew } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(noNew).select("id").single();
      if (!res.error && (effCtAny || invitedMode)) toast.warning(t("sos.batch_not_saved"), { duration: 9000 });
    }
    if (res.error && /ghost_/i.test(res.error.message || "")) {
      const { ghost_name: _g1, ghost_claim_token: _g2, ...noGhost } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(noGhost).select("id").single();
      if (!res.error) toast.warning(t("sos.ghost_not_saved"), { duration: 9000 });
    }
    if (res.error && /play_until/i.test(res.error.message || "")) {
      // window column not migrated yet — post as exact-time so creation never breaks, but SAY so
      createWindowDropped = flexible && !!playUntil;
      const { play_until: _pu, ...noWin } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(noWin).select("id").single();
    }
    if (res.error && /duration_min/i.test(res.error.message || "")) {
      // duration_min column not migrated yet — post without it so creation never breaks
      const { duration_min: _omit, ...fallback } = insertRow;
      res = await (supabase as any).from("sos_requests").insert(fallback).select("id").single();
    }
    const { data, error } = res;
    setBusy(false);
    if (error) {
      // A ghost post rejected by RLS means THIS account isn't admin in the DB —
      // say so plainly and loudly instead of the cryptic "row-level security"
      // toast, because the game silently not existing looks like a board bug
      // (2026-07-22 tester report: ghost game "vanished").
      if (/row-level security/i.test(error.message ?? "") && ghostName.trim()) {
        toast.error(t("sos.ghost_rls"), { duration: 12000 });
        return;
      }
      oops(error);
      return;
    }
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
      if (!(urgent && invitedMode)) void notifySos(data.id);
      if (createWindowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      else toast.success(t("post.sos_toast"));
      navigate({ to: "/sos/$id", params: { id: data.id } });
    } else {
      if (createWindowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      else toast.success(t("post.posted_toast"));
      navigate({ to: "/games" });
    }
  }

  function onSubmitClick() {
    if (!canSubmit) return;
    if (editing) { doSubmit(); return; }
    if (urgent) { setShowConfirm(true); return; }
    doSubmit();
  }

  return (
    <div className="space-y-5">
      <Link to="/board" className="text-sm font-extrabold underline">{t("sos.back")}</Link>
      <div>
        <h1 className="font-display text-4xl">{editing ? t("sos.edit_title") : t("post.new_title")}</h1>
      </div>

      <Section label={t("sos.when")}>
        <DateChipPicker value={date} onChange={setDate} />
        <div className="mt-3">
          <div className="csection-label mb-1">{flexible ? t("sos.flex_from") : t("slot.label")}</div>
          <SlotPicker city={city} date={date} value={time} onChange={setTime} ariaLabel={t("slot.label")} />
        </div>
        <div className="mt-3">
            <button type="button" onClick={() => { setFlexible(!flexible); if (flexible) setUntilTime(""); }} className={`cchip ${flexible ? "cchip-on" : ""}`}>
              🤸 {t("sos.flex_label")}
            </button>
            {flexible && (
              <div className="mt-2">
                <div className="csection-label mb-1">{t("sos.flex_until")}</div>
                <SlotPicker city={city} date={date} value={untilTime} onChange={setUntilTime} ariaLabel={t("sos.flex_until")} />
                <p className="text-sm font-semibold mt-1" style={{ opacity: 0.7 }}>{t("sos.flex_help")}</p>
              </div>
            )}
          </div>
        <div className="mt-3">
          {mySports.length > 1 && (<>
          <div className="csection-label mb-1">{t("sport.label")}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {mySports.map((sp) => (
              <button key={sp} type="button" onClick={() => setSport(sp)} className={`cchip ${sport === sp ? "cchip-on" : ""}`}>
                {sportMeta(sp).emoji} {t(sportMeta(sp).key)}
              </button>
            ))}
          </div>
          </>)}
          <div className="csection-label mb-1">{t("sos.duration")}</div>
          <div className="flex gap-2 flex-wrap">
            {DURATIONS.map((d) => (
              <Chip key={d} on={duration === d} onClick={() => setDuration(d)}>{durationLabel(d)}</Chip>
            ))}
          </div>
        </div>
        {time && !editing && (
          <div className="mt-2 flex items-start gap-2" aria-live="polite" style={{ fontWeight: 700, fontSize: 14, color: "rgba(43,33,24,0.65)" }}>
            <span className={urgent ? "sos-dot" : ""} style={{ width: 8, height: 8, borderRadius: "50%", background: urgent ? "#F0705B" : "#C9EE3F", marginTop: 5, flexShrink: 0 }} />
            <span><b style={{ color: urgent ? "#F0705B" : "var(--ink)" }}>{urgent ? "SOS" : t("post.mode_planned_word")}</b> · {urgent ? t("post.info_urgent") : t("post.info_planned")}</span>
          </div>
        )}
        {urgent && !editing && (
          <button type="button" onClick={() => setInvitedMode(!invitedMode)}
            className="mt-2 w-full rounded-xl border-2 px-3 py-2 font-extrabold text-left"
            style={{ borderColor: "var(--ink)", background: invitedMode ? "var(--green-pop)" : "var(--cream2)" }}>
            🎟 {t("sos.invited_label")}
            <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.7 }}>{t("sos.invited_hint")}</span>
          </button>
        )}
      </Section>

      <Section label={t("sos.court")}>
        <div className="flex flex-wrap gap-2 mb-2">
          {cityNames.map((cy) => (
            <Chip key={cy} on={city === cy} onClick={() => setCity(cy)}>
              📍 {cy}
            </Chip>
          ))}
        </div>
        {/* The board is city-scoped: a game at a Stockholm court is invisible to
            Uppsala players. Posting outside your home city is fine — but say it
            out loud, so the game doesn't feel like it vanished (2026-07-22). */}
        {myHomeCity && city !== myHomeCity && (
          <p className="text-sm font-semibold mb-2" style={{ opacity: 0.65 }}>
            ℹ️ {t("sos.city_visibility_hint", { city })}
          </p>
        )}
        <CourtCombobox city={city} valueId={courtId} onChange={(id, c) => { setCourtId(id); if (c) setCourts((p) => p.some((x) => x.id === c.id) ? p : [...p, c]); }} />
        <div className="mt-3">
          <div className="csection-label mb-1">{t("ct.label")}</div>
          <div
            role="radiogroup"
            aria-label={t("ct.label")}
            className="grid grid-cols-2 gap-2"
          >
            {(courtStatus === "will_book" || courtStatus === "public") && (
              <button type="button" onClick={() => setCtAny(!ctAny)}
                className="col-span-2 rounded-xl border-2 px-3 py-2 font-extrabold text-left"
                style={{ borderColor: "var(--ink)", background: ctAny ? "var(--green-pop)" : "var(--cream2)" }}>
                🏟️ {t("ct.any_label")}
                <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.7 }}>{t("ct.any_hint")}</span>
              </button>
            )}
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
        <div className="text-base font-semibold text-[var(--ink)] mt-1">L{myLevel} · {LEVELS.find((l) => l.n === myLevel)?.name}</div>
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

      {isAdmin && !editing && (
        <Section label={`👻 ${t("sos.ghost_label")}`}>
          <input className="cinput" placeholder={t("sos.ghost_ph")} value={ghostName} onChange={(e) => setGhostName(e.target.value)} maxLength={60} />
          <p className="text-sm font-semibold mt-1" style={{ opacity: 0.65 }}>{t("sos.ghost_hint")}</p>
        </Section>
      )}

      {!urgent && !editing && (
        <Section label={t("post.auto_flare_label")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-base text-[var(--ink)] font-semibold flex-1">
              {t("post.auto_flare_help")}
            </p>
            <Chip on={autoFlare} onClick={() => setAutoFlare(!autoFlare)}>
              {autoFlare ? "ON" : "OFF"}
            </Chip>
          </div>
        </Section>
      )}

      {!editing && buddies.length > 0 && (
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
          <p className="text-base text-[var(--ink)] font-semibold mt-2">{t("sos.invite_hint")}</p>
        </Section>
      )}

      <button
        disabled={busy || !canSubmit}
        onClick={onSubmitClick}
        className={`cbtn w-full ${urgent ? "cbtn-coral" : "cbtn-green"}`}
      >
        {busy ? "..." : editing ? t("sos.edit_save") : !time ? t("post.pick_a_time") : urgent ? t("post.cta_urgent") : t("post.cta_planned")}
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