import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { activeSosCount } from "@/lib/sos";
import { notifySos, notifyUsers } from "@/lib/push";
import { fetchBuddyIds } from "@/lib/buddies";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { useCityNames } from "@/lib/cities";
import { COURT_STATUSES, SOS_FORMATS, LEVELS, isUrgent, generateSlots, COURT_TYPES, courtTypeMeta, whenLabel, DURATIONS, durationLabel, type City, type CourtType, sportMeta, type Sport } from "@/lib/courtship";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { CourtCombobox } from "@/components/CourtCombobox";
import { Avatar } from "@/components/Avatar";
import { Rackets } from "@/components/RailKit";

export const Route = createFileRoute("/_authenticated/sos/new")({
  head: () => ({ meta: [{ title: "New post — Courtship" }] }),
  validateSearch: (sp: Record<string, unknown>): { edit?: string; planned?: boolean } => ({
    edit: typeof sp.edit === "string" ? sp.edit : undefined,
    planned: sp.planned === true || sp.planned === "1" ? true : undefined,
  }),
  component: NewSos,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }

// ── design tokens (TennisBuddies 9 wizard handoff) ──
const HAIR = "rgba(43,33,24,0.18)";
const CARD = "rgba(253,249,238,0.6)";
const WOOD = "#8C5A33";
const LIME = "#C9EE3F";
const CORAL = "#F0705B";
const LV_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

/* ═══════════════ 3-step "New game" wizard (TennisBuddies 9) ═══════════════
   Redesign of the create-game form. The DESIGN is new; the FEATURE SET is the
   old one, complete: sport picker, flexible window, private (invite-link)
   games, admin ghost posts, 🏟️ any-surface, auto-flare, buddy invites, city
   visibility hint, home-court default, edit mode with all RPC fallbacks and
   the 3-SOS cap. doSubmit is byte-for-byte the previous logic. */

function NewSos() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const editing = !!editId;
  const [step, setStep] = useState(0);
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [myLevel, setMyLevel] = useState(3);
  const [uid, setUid] = useState<string | null>(null);
  const [city, setCity] = useState<City>("Uppsala");
  const [myHomeCity, setMyHomeCity] = useState<City | null>(null);

  // Default date = Today; NO time preselected (user must pick — the From wheel
  // starts on "—", which prevents an accidental instant send).
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
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [buddies, setBuddies] = useState<Array<{ id: string; name: string }>>([]);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  // "Send as SOS": user-visible control over what used to be implicit. Auto-
  // checks when the start is within the 6h urgency window (same rule as
  // before); unticking posts a planned game instead — never MORE pings than
  // the old behavior, only an explicit way out of them.
  const [sosOn, setSosOn] = useState(true);
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
        .select("name,level,home_city,home_courts,photo_url")
        .eq("id", u.user.id)
        .maybeSingle();
      const lv = (p as any)?.level ?? 3;
      const hc = ((p as any)?.home_city ?? "Uppsala") as City;
      setMyLevel(lv);
      setCity(hc);
      setMyHomeCity(hc);
      setMyName((p as any)?.name ?? "");
      setMyPhoto((p as any)?.photo_url ?? null);
      try {
        const bids = await fetchBuddyIds(u.user!.id);
        if (bids.size) {
          const { data: dir } = await (supabase as any).rpc("players_directory", { _ids: [...bids] });
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

      // Edit mode: load the existing game and prefill (owner-only edit_sos RPC saves it).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const urgentEligible = !editing && !flexible && !!playAt && isUrgent(playAt);
  // Auto-check/uncheck as eligibility changes (the old implicit rule), while
  // still letting the host untick it on purpose.
  useEffect(() => { setSosOn(urgentEligible); }, [urgentEligible]);
  const urgent = urgentEligible && sosOn;
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
      ...(invitedMode ? { broadcast: false, invite_join_token: crypto.randomUUID() } : {}),
      court_id: courtId,
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      note: note.trim() || null,
      status: "active",
      kind: urgent ? "sos" : "open",
      // A private game must never self-broadcast: no auto-flare for invited mode.
      auto_flare: urgent || invitedMode ? false : autoFlare,
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
      if (!invitedMode) void notifySos(data.id);
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

  /* ── derived bits for the wizard UI ── */
  const slots = useMemo(() => generateSlots(city, date), [city, date]);
  const fromItems = useMemo(() => ["—", ...slots], [slots]);
  // "To" = optional window end; "—" = exact time (play_until stays null).
  const toItems = useMemo(() => ["—", ...slots.filter((s) => (time ? s > time : false))], [slots, time]);
  useEffect(() => {
    // keep the window end valid as From moves
    if (flexible && untilTime && time && untilTime <= time) { setFlexible(false); setUntilTime(""); }
  }, [time, flexible, untilTime]);

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const tomorrow0 = new Date(today0.getTime() + 24 * 3600 * 1000);
  const isToday = date.getTime() === today0.getTime();
  const isTomorrow = date.getTime() === tomorrow0.getTime();
  const [pickDateOpen, setPickDateOpen] = useState(false);
  const locale = lang === "sv" ? "sv-SE" : "en-GB";

  const courtName = courts.find((c) => c.id === courtId)?.name ?? "";
  const statusLabel = COURT_STATUSES.find((s) => s.value === courtStatus)?.label ?? "";
  const stepTitles = [t("wiz.when_title"), t("wiz.court_title"), t("wiz.who_title")];

  function next() { setStep((s) => Math.min(2, s + 1)); }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  return (
    <div className="space-y-4" style={{ maxWidth: 480 }}>
      {/* header: back · title · step + progress (sheet language from the handoff) */}
      <div>
        {step === 0 ? (
          <Link to="/board" className="text-sm font-extrabold underline">{t("sos.back")}</Link>
        ) : (
          <button type="button" onClick={back} className="text-sm font-extrabold underline">← {t("wiz.back")}</button>
        )}
        <div className="flex items-center gap-2 mt-2">
          <h1 className="font-display flex-1" style={{ fontSize: 26, lineHeight: 1.1 }}>
            {editing ? `${t("sos.edit_title")} · ${stepTitles[step]}` : stepTitles[step]}
          </h1>
          <span className="font-extrabold" style={{ fontSize: 13.5, opacity: 0.6 }}>{step + 1}/3</span>
        </div>
        <div className="flex gap-1.5 mt-2.5">
          {[0, 1, 2].map((k) => (
            <span key={k} style={{ flex: 1, height: 4, borderRadius: 999, background: k <= step ? LIME : HAIR }} />
          ))}
        </div>
      </div>

      {/* ════ STEP 1 · WHEN — duration · time window · day · SOS ════ */}
      {step === 0 && (
        <div className="space-y-4">
          {mySports.length > 1 && (
            <div>
              <WizLbl>{t("sport.label")}</WizLbl>
              <SegRow items={mySports.map((sp) => ({ key: sp, label: `${sportMeta(sp).emoji} ${t(sportMeta(sp).key)}` }))}
                sel={sport} onSel={(k) => setSport(k as Sport)} />
            </div>
          )}
          <div>
            <WizLbl>{t("sos.duration")}</WizLbl>
            <SegRow items={DURATIONS.map((d) => ({ key: String(d), label: durationLabel(d) }))}
              sel={String(duration)} onSel={(k) => setDuration(Number(k))} />
          </div>
          <div>
            <WizLbl>{t("wiz.window_label")}</WizLbl>
            <div style={{ display: "flex", gap: 16, background: "rgba(43,33,24,0.05)", borderRadius: 14, padding: "10px 14px" }}>
              <Wheel label={t("wiz.from")} items={fromItems} value={time || "—"}
                onChange={(v) => setTime(v === "—" ? "" : v)} />
              <Wheel label={t("wiz.to")} items={toItems} value={flexible && untilTime ? untilTime : "—"}
                disabled={!time}
                onChange={(v) => { if (v === "—") { setFlexible(false); setUntilTime(""); } else { setFlexible(true); setUntilTime(v); } }} />
            </div>
            <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>
              {flexible && untilTime ? t("sos.flex_help") : t("wiz.window_hint")}
            </p>
          </div>
          <div>
            <WizLbl>{t("wiz.day")}</WizLbl>
            <SegRow
              items={[
                { key: "today", label: t("wiz.today") },
                { key: "tomorrow", label: t("wiz.tomorrow") },
                { key: "pick", label: isToday || isTomorrow ? t("wiz.pick_date") : date.toLocaleDateString(locale, { day: "numeric", month: "short" }) },
              ]}
              sel={isToday ? "today" : isTomorrow ? "tomorrow" : "pick"}
              onSel={(k) => {
                if (k === "today") { setDate(new Date(today0)); setPickDateOpen(false); }
                else if (k === "tomorrow") { setDate(new Date(tomorrow0)); setPickDateOpen(false); }
                else setPickDateOpen(true);
              }}
            />
            {pickDateOpen && (
              <input type="date" className="cinput mt-2" aria-label={t("wiz.pick_date")}
                min={new Date().toISOString().slice(0, 10)}
                value={`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
                onChange={(e) => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setDate(d); }} />
            )}
          </div>
          {/* Send as SOS — the one coral accent on this screen. Same 6h rule as
              always; the checkbox only makes it visible and opt-out-able. */}
          {!editing && (
            <button type="button" disabled={!urgentEligible}
              onClick={() => urgentEligible && setSosOn(!sosOn)}
              className="w-full flex items-start gap-3 text-left"
              style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 14, opacity: urgentEligible ? 1 : 0.45, background: "transparent" }}>
              <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${CORAL}`, background: urgent ? CORAL : "transparent", color: "#FFF6E8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{urgent ? "✓" : ""}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-extrabold" style={{ fontSize: 16 }}>🚨 {t("wiz.sos_check")}</span>
                <span className="block font-semibold" style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>
                  {flexible ? t("wiz.sos_sub_flex") : urgentEligible ? t("wiz.sos_sub") : t("wiz.sos_sub_locked")}
                </span>
              </span>
            </button>
          )}
          <QuietNext label={t("wiz.next_court")} onClick={next} />
        </div>
      )}

      {/* ════ STEP 2 · COURT — city · court picker · surface ════ */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            {cityNames.map((cy) => (
              <button key={cy} type="button" onClick={() => setCity(cy)}
                className="font-display" style={{ fontSize: 19, color: WOOD, opacity: city === cy ? 1 : 0.45, background: "transparent", padding: 0 }}>
                📍 {cy}
              </button>
            ))}
          </div>
          {/* The board is city-scoped: a game at a Stockholm court is invisible to
              Uppsala players. Posting outside your home city is fine — but say it
              out loud, so the game doesn't feel like it vanished (2026-07-22). */}
          {myHomeCity && city !== myHomeCity && (
            <p className="text-sm font-semibold" style={{ opacity: 0.65 }}>
              ℹ️ {t("sos.city_visibility_hint", { city })}
            </p>
          )}
          <div>
            <WizLbl>{t("sos.court")}</WizLbl>
            {/* CourtCombobox keeps search + "add a court" (the design's add-a-court row) */}
            <CourtCombobox city={city} valueId={courtId} onChange={(id, c) => { setCourtId(id); if (c) setCourts((p) => p.some((x) => x.id === c.id) ? p : [...p, c]); }} />
          </div>
          <div>
            <WizLbl>{t("ct.label")}</WizLbl>
            <SegRow
              items={COURT_TYPES.map((ct) => { const m = courtTypeMeta(ct, lang); return { key: ct, label: `${m.emoji} ${m.label}` }; })}
              sel={courtType} onSel={(k) => setCourtType(k as CourtType)} />
            {(courtStatus === "will_book" || courtStatus === "public") && (
              <button type="button" onClick={() => setCtAny(!ctAny)}
                className="mt-2 w-full flex items-start gap-3 text-left" style={{ background: "transparent", padding: "6px 2px" }}>
                <CheckBox on={ctAny} />
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold" style={{ fontSize: 15 }}>🏟️ {t("ct.any_label")}</span>
                  <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.65 }}>{t("ct.any_hint")}</span>
                </span>
              </button>
            )}
          </div>
          <QuietNext label={t("wiz.next_players")} onClick={next} />
        </div>
      )}

      {/* ════ STEP 3 · WHO — live preview · format · level track · details · note · CTA ════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* live preview — how the game will land on the board */}
          <div>
            <div style={{ display: "flex", border: `1px solid ${HAIR}`, borderRadius: 12, overflow: "hidden", background: CARD }}>
              <div style={{ width: 62, flexShrink: 0, background: urgent ? "#FBE3DE" : "#EEF6D6", borderRight: `1px solid ${HAIR}`, borderLeft: `4px solid ${urgent ? CORAL : LIME}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 11.5, textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>
                  {isToday ? t("wiz.today") : isTomorrow ? t("wiz.tomorrow") : date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </div>
                <div className="font-display" style={{ fontSize: 19, marginTop: 1 }}>{time || "—"}</div>
                {flexible && untilTime && <div style={{ fontWeight: 700, fontSize: 10.5, color: "rgba(43,33,24,0.55)" }}>→{untilTime}</div>}
                <div style={{ fontSize: 15, marginTop: 2 }}>{effCtAny ? "🏟️" : courtType === "indoor" ? "🏠" : "☀️"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: "9px 11px" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar src={myPhoto} name={ghostName.trim() || myName || "P"} seed={uid ?? "me"} size={36} />
                  <div className="min-w-0">
                    <div className="font-display truncate" style={{ fontSize: 16.5 }}>{ghostName.trim() ? ghostName.trim() : t("wiz.hosting")}</div>
                    <div className="font-display truncate" style={{ fontSize: 14, color: WOOD }}>📍 {courtName || t("board.court")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>💳 {statusLabel}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>
                    {anyone ? t("sos.anyone") : (<>L <span style={{ color: LV_COLORS[levelMin - 1] }}>{levelMin}</span>–<span style={{ color: LV_COLORS[levelMax - 1] }}>{levelMax}</span></>)}
                  </span>
                  <Rackets n={format === "singles" ? 2 : 4} size={19} />
                  {invitedMode && <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>🎟</span>}
                </div>
              </div>
            </div>
            <div className="text-center font-bold" style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{t("wiz.preview_hint")}</div>
          </div>

          {/* priority 1 — Format, one prominent decision */}
          <div>
            <WizLbl>{t("sos.format")}</WizLbl>
            {/* No "need 1/2/3" math at creation: since BATCH12 the host picks
                as many candidates as they like (choose_applicant accepts past
                full, spots_needed self-grows), so Doubles just opens up to 3
                spots and the host assembles the court from whoever applies.
                Editing an older need1/need2 game keeps its original count. */}
            <SegRow
              items={[
                { key: "singles", label: t("wiz.singles"), icon: <Rackets n={2} size={18} /> },
                { key: "doubles", label: t("wiz.doubles"), icon: <Rackets n={4} size={18} /> },
              ]}
              sel={format === "singles" ? "singles" : "doubles"}
              onSel={(k) => setFormat(k === "singles" ? "singles" : (format === "singles" ? "doubles_need3" : format))}
            />
            {format !== "singles" && (
              <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("wiz.doubles_hint")}</p>
            )}
          </div>

          {/* priority 2 — level range as a track */}
          <div>
            <WizLbl right={
              <button type="button" onClick={() => setAnyone(!anyone)} className="font-bold underline" style={{ fontSize: 13.5, opacity: 0.7, background: "transparent" }}>
                {anyone ? `${levelMin}–${levelMax}` : t("sos.anyone")}
              </button>
            }>{t("sos.level_range")}</WizLbl>
            {anyone ? (
              <div className="font-extrabold" style={{ fontSize: 16 }}>🤝 {t("sos.anyone")} <span className="font-semibold" style={{ fontSize: 13, opacity: 0.6 }}>(1–5)</span></div>
            ) : (
              <LevelTrack lo={levelMin} hi={levelMax} onChange={(lo, hi) => { setLevelMin(lo); setLevelMax(hi); }}
                endLow={t("wiz.lvl_low")} endHigh={t("wiz.lvl_high")} />
            )}
            <div className="text-sm font-semibold mt-1.5" style={{ opacity: 0.6 }}>{t("wiz.your_level", { n: myLevel, name: LEVELS.find((l) => l.n === myLevel)?.name ?? "" })}</div>
          </div>

          {/* priority 3 — everything else, one quiet list */}
          <div>
            <WizLbl>{t("wiz.details")}</WizLbl>
            <div style={{ border: `1px solid ${HAIR}`, borderRadius: 12, background: CARD, overflow: "hidden" }}>
              <AccordionRow label={t("sos.court_status")} value={statusLabel}>
                <div className="flex flex-wrap gap-1.5 pb-3 px-3">
                  {COURT_STATUSES.map((s) => (
                    <button key={s.value} type="button" onClick={() => setCourtStatus(s.value)} className={`cchip ${courtStatus === s.value ? "cchip-on" : ""}`}>{s.label}</button>
                  ))}
                </div>
              </AccordionRow>
              {!editing && buddies.length > 0 && (
                <AccordionRow label={t("sos.invite_buddies")}
                  value={inviteIds.length ? buddies.filter((b) => inviteIds.includes(b.id)).map((b) => b.name).slice(0, 2).join(", ") + (inviteIds.length > 2 ? ` +${inviteIds.length - 2}` : "") : "—"}>
                  <div className="pb-2 px-3">
                    {buddies.map((b) => {
                      const on = inviteIds.includes(b.id);
                      return (
                        <button key={b.id} type="button" className="w-full flex items-center gap-3 text-left" style={{ padding: "7px 0", background: "transparent" }}
                          onClick={() => setInviteIds((prev) => (on ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}>
                          <span className="flex-1 font-bold truncate" style={{ fontSize: 15.5 }}>{b.name}</span>
                          <CheckBox on={on} />
                        </button>
                      );
                    })}
                    <p className="font-semibold" style={{ fontSize: 12.5, opacity: 0.6, paddingBottom: 6 }}>{t("sos.invite_hint")}</p>
                  </div>
                </AccordionRow>
              )}
              {/* Private mode for ANY kind: don't publish to the board — get a
                  join link to send a friend, even one not in the app yet. */}
              {!editing && (
                <ToggleRow label={`🎟 ${t("sos.invited_label")}`} sub={t("sos.invited_hint")} on={invitedMode} onToggle={() => setInvitedMode(!invitedMode)} />
              )}
              {!urgent && !editing && !invitedMode && (
                <ToggleRow label={t("post.auto_flare_label")} sub={t("post.auto_flare_help")} on={autoFlare} onToggle={() => setAutoFlare(!autoFlare)} />
              )}
              {isAdmin && !editing && (
                <AccordionRow label={`👻 ${t("sos.ghost_label")}`} value={ghostName.trim() || "—"} last>
                  <div className="pb-3 px-3">
                    <input className="cinput" placeholder={t("sos.ghost_ph")} value={ghostName} onChange={(e) => setGhostName(e.target.value)} maxLength={60} />
                    <p className="font-semibold mt-1" style={{ fontSize: 12.5, opacity: 0.65 }}>{t("sos.ghost_hint")}</p>
                  </div>
                </AccordionRow>
              )}
            </div>
          </div>

          <div>
            <WizLbl>{t("sos.note_label")}</WizLbl>
            <input className="cinput" placeholder={t("sos.note_placeholder")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
          </div>

          {/* the one bright moment: filled coral CTA, no border */}
          <button
            disabled={busy || !canSubmit}
            onClick={onSubmitClick}
            className="w-full font-extrabold"
            style={{ background: CORAL, color: "#FFF6E8", border: "none", borderRadius: 12, padding: 16, fontSize: 18, opacity: busy || !canSubmit ? 0.55 : 1 }}
          >
            {busy ? "…" : editing ? t("sos.edit_save") : !time ? t("post.pick_a_time") : urgent ? t("post.cta_urgent") : t("post.cta_planned")}
          </button>
        </div>
      )}

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

/* ═══ wizard atoms (page-local; board tokens from the TB9 handoff) ═══ */

function WizLbl({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline mb-2">
      <span className="flex-1 font-extrabold uppercase" style={{ fontSize: 13, letterSpacing: "0.1em", color: WOOD }}>{children}</span>
      {right}
    </div>
  );
}

function SegRow({ items, sel, onSel, small }: { items: Array<{ key: string; label: string; icon?: React.ReactNode }>; sel: string; onSel: (k: string) => void; small?: boolean }) {
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

function CheckBox({ on }: { on: boolean }) {
  return <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${on ? "var(--ink)" : "rgba(43,33,24,0.35)"}`, background: on ? LIME : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{on ? "✓" : ""}</span>;
}

function QuietNext({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-end gap-2 font-extrabold"
      style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 13, fontSize: 17, background: "transparent" }}>
      {label} <span style={{ fontSize: 20 }}>→</span>
    </button>
  );
}

function ToggleRow({ label, sub, on, onToggle, last }: { label: string; sub?: string; on: boolean; onToggle: () => void; last?: boolean }) {
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

function AccordionRow({ label, value, children, last }: { label: string; value: string; children: React.ReactNode; last?: boolean }) {
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
function LevelTrack({ lo, hi, onChange, endLow, endHigh }: { lo: number; hi: number; onChange: (lo: number, hi: number) => void; endLow: string; endHigh: string }) {
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
const WHEEL_ITEM = 38;
const WHEEL_H = 138;
function Wheel({ label, items, value, onChange, disabled }: { label: string; items: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
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
