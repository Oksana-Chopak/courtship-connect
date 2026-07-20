import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { shareInvite, shareTo } from "@/lib/share";
import { fetchEligibleSos, fetchOpenGames, fetchMyActiveGames, fetchMyUpcomingClaims, withdrawClaim, formatLabel, claimSos, applyToGame, fetchMyApplicationSosIds, fetchApplicantCounts, hydrateCallers, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, hourRange, levelMeta, courtTypeMeta, COURT_TYPES, LEVELS, weeklyStreak, type CourtType, type City, sportMeta, rescuerTier } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { Avatar } from "@/components/Avatar";
import { fetchApprovedEvents, fetchMyAttendance, type EventRow } from "@/lib/events";
import { fetchPublicBoard, joinSearch } from "@/lib/guest";
import { useCityNames } from "@/lib/cities";
import { EventCard } from "@/components/EventCard";
import { googleCalendarUrl } from "@/lib/calendar";
import { TimeRail, RailShell, RailPhoto, Rackets, ShareIcon, EditIcon, DeleteIcon, CalIcon, BallHeart, RF, clampLines, type RailTone } from "@/components/RailKit";
import { AttentionStrip } from "@/components/AttentionStrip";
import { CelebrationOverlay } from "@/components/CelebrationOverlay";
import { checkCelebration, type Celebration } from "@/lib/celebrate";
import { fetchMyGameHistory } from "@/lib/games";
import { InstallBanner, StandaloneNotifPrompt } from "@/components/InstallBanner";
import { GetStarted } from "@/components/GetStarted";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { CommunityStatsWidget } from "@/components/CommunityStats";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({ meta: [{ title: "Board — Courtship" }] }),
  // seg kept optional for backwards-compatible links; the board now shows one merged list.
  validateSearch: (s: Record<string, unknown>): { seg?: "urgent" | "planned" } => ({
    seg: s.seg === "planned" ? "planned" : s.seg === "urgent" ? "urgent" : undefined,
  }),
  component: BoardPage,
});

function BoardPage() {
  const { t, lang } = useI18n();
  const [urgent, setUrgent] = useState<EligibleSosRow[]>([]);
  const [planned, setPlanned] = useState<EligibleSosRow[]>([]);
  const [mine, setMine] = useState<EligibleSosRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctFilter, setCtFilter] = useState<CourtType | "any">("any");
  const [fCity, setFCity] = useState<City | null>(null);
  const [fLevel, setFLevel] = useState<number | null>(null);
  const [fType, setFType] = useState<"any" | "urgent" | "planned" | "event">("any");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [myAttendance, setMyAttendance] = useState<Record<string, string>>({});
  const [myClaims, setMyClaims] = useState<EligibleSosRow[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [mySports, setMySports] = useState<string[]>(["tennis"]);
  const [activeSport, setActiveSport] = useState<string>("all");
  const [candCounts, setCandCounts] = useState<Map<string, number>>(new Map());
  const [cityForStats, setCityForStats] = useState("Uppsala");
  const [gamesPlayed, setGamesPlayed] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const seenClaimedRef = useRef<Set<string> | null>(null);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [playedThisWeek, setPlayedThisWeek] = useState(true);
  const [rescuesCount, setRescuesCount] = useState(0);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");
  // Nudge queue (declutter rule): while the GetStarted card is the active
  // onboarding nudge, hold back the install/notification banners — one thing
  // at a time. Reads the same dismiss key GetStarted uses (board is ssr:false).
  const [gsDismissed] = useState(() => {
    try { return localStorage.getItem("courtship.getstarted.dismissed") === "1"; } catch { return true; }
  });
  // Guests never get GetStarted (no profile → gamesPlayed stays null), so the
  // queue must not eat their install banner; members: suppress until the
  // profile has loaded (null) to avoid a banner flash before GetStarted mounts.
  const newbieNudge = meId ? (gamesPlayed === null ? true : gamesPlayed === 0 && !gsDismissed) : false;

  const load = useCallback(async () => {
    // getSession() reads the locally persisted session — no network race on PWA
    // cold start, so a signed-in player is never briefly served the guest feed
    // (which includes their OWN games and once inflated the 🚨 banner).
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id ?? null;
    setMeId(uid);

    if (!uid) {
      // Guest peek: minimized public rows + approved events, nothing personal.
      const [rows, ev] = await Promise.all([
        fetchPublicBoard(),
        fetchApprovedEvents().catch(() => [] as EventRow[]),
      ]);
      setUrgent(rows.filter((r) => r.kind === "sos"));
      setPlanned(rows.filter((r) => r.kind !== "sos"));
      setMine([]); setEvents(ev); setMyAttendance({});
      setLoading(false);
      return;
    }

    // After we know the user id, everything else only depends on it — fetch in
    // parallel instead of waterfalling. Each personal fetch degrades on its own
    // so one hiccup never blanks the board.
    const profileQ = uid
      ? (supabase as any).from("profiles").select("home_city,games_played,rescues_count,referrals_count,photo_url,name").eq("id", uid).maybeSingle().then((r: any) => r, () => null)
      : Promise.resolve(null);
    const countQ = uid
      ? (supabase as any).from("sos_requests").select("id", { count: "exact", head: true }).eq("caller_id", uid).eq("kind", "open").then((r: any) => r?.count ?? 0, () => 0)
      : Promise.resolve(0);
    const histQ = uid ? fetchMyGameHistory(uid, 150).catch(() => [] as any[]) : Promise.resolve([] as any[]);
    const claimsQ = uid ? fetchMyUpcomingClaims(uid).catch(() => [] as any[]) : Promise.resolve([] as any[]);
    const myAppsQ = uid ? fetchMyApplicationSosIds(uid) : Promise.resolve(new Set<string>());

    const [u, p, m, ev, att, profRes, hostedCount, hist, claims, myApps] = await Promise.all([
      fetchEligibleSos().catch(() => []), fetchOpenGames().catch(() => []), fetchMyActiveGames().catch(() => []),
      fetchApprovedEvents().catch(() => []), fetchMyAttendance().catch(() => ({} as Record<string, string>)),
      profileQ, countQ, histQ, claimsQ, myAppsQ,
    ]);

    // Enrich caller name+photo in one batch so cards can show host identity
    const hydrated = await hydrateCallers([...(u as EligibleSosRow[]), ...(p as EligibleSosRow[]), ...(m as EligibleSosRow[])]);
    const byId = new Map(hydrated.map((r) => [r.id, r]));
    const hU = (u as EligibleSosRow[]).map((r) => byId.get(r.id) ?? r);
    const hP = (p as EligibleSosRow[]).map((r) => byId.get(r.id) ?? r);
    const hM = (m as EligibleSosRow[]).map((r) => byId.get(r.id) ?? r);
    setUrgent(hU); setPlanned(hP); setMine(hM); setEvents(ev); setMyAttendance(att);
    const prof = (profRes as any)?.data;
    if (prof) {
      setCityForStats(prof.home_city ?? "Uppsala");
      setGamesPlayed(prof.games_played ?? 0);
      setRescuesCount(prof.rescues_count ?? 0);
      setMyPhoto(prof.photo_url ?? null);
      setMyName(prof.name ?? "");
      const cel = checkCelebration(prof.games_played ?? 0, prof.rescues_count ?? 0, prof.referrals_count ?? 0, (hostedCount as number) ?? 0);
      if (cel) setCelebration(cel);
    }
    {
      const st = weeklyStreak((hist as any[]).map((g) => g.played_at));
      setStreakWeeks(st.weeks);
      setPlayedThisWeek(st.playedThisWeek);
    }
    setMyClaims(claims as any);
    setAppliedIds(myApps as Set<string>);
    {
      const sp = ((profRes as any)?.data?.sports as string[] | null) ?? ["tennis"];
      setMySports(sp.length ? sp : ["tennis"]);
    }
    const myOpenIds = (m as EligibleSosRow[]).filter((g) => g.kind === "open" && g.status === "active").map((g) => g.id);
    setCandCounts(await fetchApplicantCounts(myOpenIds));
    // Confetti when one of MY games is freshly claimed (session-scoped; seed on
    // first load so pre-existing claims never retro-fire).
    const claimedIds = (m as EligibleSosRow[]).filter((g) => g.status === "claimed").map((g) => g.id);
    if (seenClaimedRef.current === null) {
      seenClaimedRef.current = new Set(claimedIds);
    } else {
      const fresh = claimedIds.filter((id) => !seenClaimedRef.current!.has(id));
      if (fresh.length) {
        fresh.forEach((id) => seenClaimedRef.current!.add(id));
        setCelebration({ kind: "joined", count: 0, leveledUp: false, tierName: "", tierEmoji: "", toNext: null, nextName: null });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = (supabase as any)
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, load)
      .subscribe();
    // Realtime can drop while the app is backgrounded, so also refetch whenever
    // the tab regains focus — a game claimed elsewhere (host picked you) then
    // clears instead of lingering as a stale open card.
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function onWithdraw(sos: EligibleSosRow) {
    if (typeof window !== "undefined" && !window.confirm(t("home.cant_make_confirm"))) return;
    const r = await withdrawClaim(sos.id);
    if (!r.ok) { toast.error(r.reason); return; }
    toast.success(r.re_flared ? t("home.withdrawn_reflared") : t("home.withdrawn"));
    load();
  }
  // One match predicate per kind. Court / city / level apply to games; events
  // carry only a city. The Type filter decides which kinds appear at all.
  const sportOk = (sp?: string | null) => activeSport === "all" || (sp ?? "tennis") === activeSport;
  const gameMatch = (r: EligibleSosRow) =>
    sportOk(r.sport) &&
    (ctFilter === "any" || r.court_type === ctFilter) &&
    (fCity == null || r.court_city === fCity) &&
    (fLevel == null || (r.level_min <= fLevel && fLevel <= r.level_max));
  const eventMatch = (e: EventRow) => fCity == null || e.city === fCity;
  // Belt & braces: whatever feed produced them, my own games are never
  // "a player nearby needs a partner" — not in the banner, not as 🚨 cards.
  const urgentOthers = urgent.filter((r) => !meId || r.caller_id !== meId);
  const showKind = (k: "urgent" | "planned" | "event") => fType === "any" || fType === k;
  const nothing = !loading && urgentOthers.length === 0 && planned.length === 0 && mine.length === 0 && events.length === 0;
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const filterCount =
    (ctFilter !== "any" ? 1 : 0) + (fCity != null ? 1 : 0) + (fLevel != null ? 1 : 0) + (fType !== "any" ? 1 : 0);
  type TLItem =
    | { id: string; t: number; kind: "sos" | "open" | "mine"; r: EligibleSosRow }
    | { id: string; t: number; kind: "event"; e: EventRow };
  const timeline: TLItem[] = [
    ...(showKind("urgent") ? urgentOthers.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "sos", r })),
    ...(showKind("planned") ? planned.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "open", r })),
    ...(showKind("planned") ? mine.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "mine", r })),
    ...(showKind("event") ? events.filter((e) => eventMatch(e) && sportOk((e as any).sport)) : []).map((e): TLItem => ({ id: e.id, t: new Date(e.starts_at).getTime(), kind: "event", e })),
  ].sort((a, b) => a.t - b.t);

  return (
    <div className="space-y-5">
      {celebration && <CelebrationOverlay c={celebration} onClose={() => setCelebration(null)} />}
      {gamesPlayed === 0 && <GetStarted />}
      {/* Hero — Save my set (SOS), with Plan-a-game / Host under-links */}
      <div>
        <p className="text-center font-display leading-tight px-2" style={{ fontSize: 18, marginBottom: 12 }}>{t("tonight.encourage")}</p>
        <Link to="/sos/new" search={{ planned: undefined }} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F0705B", color: "#FFF6E8", border: "2px solid var(--ink)", borderRadius: 12, padding: "13px 16px", textDecoration: "none" }}>
          <BallHeart size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1 }}>{t("tonight.sos")}</div>
            <div style={{ fontWeight: 800, fontSize: 13.5, opacity: 0.95, marginTop: 2 }}>{t("tonight.sos_sub")}</div>
          </div>
          <span style={{ fontSize: 20 }}>→</span>
        </Link>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "10px 20px", marginTop: 11 }}>
          <Link to="/sos/new" search={{ planned: undefined }} className="font-extrabold text-sm underline" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>📅 {t("tonight.plan_game")}</Link>
          <Link to="/events/new" className="font-extrabold text-sm underline" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>🎪 {t("board.host_event")}</Link>
        </div>
      </div>

      {/* Mini progress + streak (tap → season) */}
      {(() => {
        const rt = rescuerTier(rescuesCount);
        const dow = new Date().getDay(); // 5=Fri 6=Sat 0=Sun
        const atRisk = streakWeeks > 0 && !playedThisWeek && (dow === 5 || dow === 6 || dow === 0);
        const rescueLine = atRisk
          ? t("mini.streak_risk")
          : rt && rt.next != null && rt.nextName ? `${rt.emoji} ${rt.name} · ${t("mini.to_next", { n: rt.next - rescuesCount, name: rt.nextName })}` : rt ? `${rt.emoji} ${rt.name}` : t("mini.games", { n: gamesPlayed ?? 0 });
        return (
          <Link to="/progress" style={{ display: "flex", alignItems: "center", gap: 10, border: atRisk ? "1.5px solid #F0705B" : "1px solid rgba(43,33,24,0.18)", borderRadius: 12, background: atRisk ? "#FCE9E4" : "rgba(253,249,238,0.6)", padding: "9px 13px", textDecoration: "none", color: "var(--ink)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, fontSize: 14 }}><span style={{ fontSize: 17 }}>🔥</span>{t("mini.streak", { n: streakWeeks })}</span>
            <span style={{ width: 1, height: 20, background: "rgba(43,33,24,0.18)" }} />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13.5, color: atRisk ? "#F0705B" : undefined, ...clampLines(1) }}>{rescueLine}</span>
            <span style={{ fontSize: 16, color: "rgba(43,33,24,0.3)" }}>›</span>
          </Link>
        );
      })()}

      {mySports.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" className={`cchip ${activeSport === "all" ? "cchip-on" : ""}`} onClick={() => setActiveSport("all")}>
            {t("board.sport_all")}
          </button>
          {mySports.map((sp) => (
            <button key={sp} type="button" className={`cchip ${activeSport === sp ? "cchip-on" : ""}`} onClick={() => setActiveSport(sp)}>
              {sportMeta(sp).emoji} {t(sportMeta(sp).key)}
            </button>
          ))}
        </div>
      )}

      <AttentionStrip onChange={load} />

      <AnnouncementBanner />

      {!newbieNudge && <InstallBanner />}
      {!newbieNudge && <StandaloneNotifPrompt />}

      {!loading && urgentOthers.length > 0 && (
        <div
          className="rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
          style={{ background: "var(--coral)", color: "#FFF6E8", boxShadow: "4px 4px 0 var(--ink)" }}
          role="status"
        >
          <div className="font-display text-lg leading-tight">
            🚨 {t(urgentOthers.length === 1 ? "board.rescue_one" : "board.rescue_many", { n: urgentOthers.length })}
          </div>
          <div className="text-sm font-semibold" style={{ opacity: 0.9 }}>{t("board.rescue_sub")}</div>
        </div>
      )}

      {loading && <div className="text-center py-8 text-[var(--ink)]">{t("rescue.listening")}</div>}

      {myClaims.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label">✅ {t("home.my_upcoming")}</div>
          {myClaims.map((s) => (
            <div key={s.id} className="ccard p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg truncate">{whenLabel(s.play_at)} · {s.court_name ?? "—"}</div>
                <div className="text-base text-[var(--ink)] font-semibold truncate">📍 {s.court_city ?? "—"}{s.caller_name ? ` · ${s.caller_name}` : ""}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={googleCalendarUrl({ title: `\u{1F3BE} ${s.court_name ?? "Tennis"}`, startISO: s.play_at, durationMin: (s as any).duration_min ?? 60, location: [s.court_city, s.court_name].filter(Boolean).join(", ") })} target="_blank" rel="noopener noreferrer" title={t("cal.add")} aria-label={t("cal.add")}><CalIcon /></a>
                <button type="button" onClick={() => onWithdraw(s)} title={t("home.cant_make_it")} aria-label={t("home.cant_make_it")}><DeleteIcon /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The evening — games, SOS and events woven together by time */}
      {!loading && timeline.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="csection-label">{t("tonight.evening")}</div>
            <button type="button" onClick={() => setFiltersOpen(true)}
              style={{ border: "1.5px solid rgba(43,33,24,0.18)", borderRadius: 8, padding: "4px 9px", background: "var(--cream2)", fontWeight: 700, fontSize: 11, color: "rgba(43,33,24,0.5)" }}>
              {t("players.filters")}{filterCount > 0 ? ` · ${filterCount}` : ` · ${t("board.f_any")}`} ▾
            </button>
          </div>
          <div className="space-y-3">
            {timeline.map((it) => (
              <div key={it.id}>
                {it.kind === "event" ? (
                  <EventCard e={it.e} meId={meId} myStatus={myAttendance[it.e.id]} onChange={load} guest={!meId} />
                ) : it.kind === "mine" ? (
                  <Card sos={it.r} onChange={load} mine candidates={candCounts.get(it.r.id) ?? 0} mePhoto={myPhoto} meName={myName} />
                ) : (
                  <Card sos={it.r} onChange={load} applied={appliedIds.has(it.r.id)} guest={!meId} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {filtersOpen && (
        <BoardFilterSheet
          ctFilter={ctFilter} setCtFilter={setCtFilter}
          fCity={fCity} setFCity={setFCity}
          fLevel={fLevel} setFLevel={setFLevel}
          fType={fType} setFType={setFType}
          count={timeline.length}
          onClear={() => { setCtFilter("any"); setFCity(null); setFLevel(null); setFType("any"); }}
          onClose={() => setFiltersOpen(false)}
        />
      )}



      {/* Features live in flows (Players page, no-takers nudge, empty state) — never as ad cards on the board. */}

      {/* Filters ate everything — give a way OUT (Lovable's stuck-state report) */}
      {!loading && !nothing && timeline.length === 0 && (
        <div className="ccard p-5 text-center space-y-3">
          <div className="text-3xl">🔍</div>
          <div className="font-display text-xl">{t("board.f_empty_title")}</div>
          <div className="flex gap-2 justify-center pt-1">
            <button type="button" className="cbtn cbtn-coral" onClick={() => { setCtFilter("any"); setFCity(null); setFLevel(null); setFType("any"); }}>✕ {t("board.f_clear")}</button>
            <button type="button" className="cbtn cbtn-ghost" onClick={() => setFiltersOpen(true)}>{t("players.filters")} ▾</button>
          </div>
        </div>
      )}

      {nothing && (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-3xl">🌅</div>
          <div className="font-display text-xl">{t("rescue.empty_title")}</div>
          <div className="text-base text-[var(--ink)] font-semibold">{t("rescue.empty_sub")}</div>
          <div className="pt-1">
            <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-coral inline-block" style={{ minWidth: 220 }}>🎾 {t("board.post_game")}</Link>
            <div className="mt-3">
              <button type="button" className="font-extrabold underline text-sm" onClick={() => void shareInvite(t("invite.message"), t("invite.copied"))}>🤗 {t("invite.friend_cta")}</button>
            </div>
          </div>
        </div>
      )}

      <CommunityStatsWidget city={cityForStats} />
    </div>
  );
}

function BoardGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function BoardFilterSheet({ ctFilter, setCtFilter, fCity, setFCity, fLevel, setFLevel, fType, setFType, count, onClear, onClose }: {
  ctFilter: CourtType | "any"; setCtFilter: (v: CourtType | "any") => void;
  fCity: City | null; setFCity: (v: City | null) => void;
  fLevel: number | null; setFLevel: (v: number | null) => void;
  fType: "any" | "urgent" | "planned" | "event"; setFType: (v: "any" | "urgent" | "planned" | "event") => void;
  count: number; onClear: () => void; onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const cityNames = useCityNames();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(22,18,13,0.45)" }} role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full sm:max-w-md p-5 pb-7 space-y-3"
        style={{ background: "var(--cream2)", border: "2.5px solid var(--ink)", borderRadius: "22px 22px 0 0", maxHeight: "82%", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: "var(--ink)", opacity: 0.3 }} />
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl">{t("players.filters")}</span>
          <button onClick={onClear} className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>{t("players.filters_clear")}</button>
        </div>
        <BoardGroup label={t("board.f_type")}>
          <FilterChip on={fType === "any"} onClick={() => setFType("any")}>{t("common.all")}</FilterChip>
          <FilterChip on={fType === "urgent"} onClick={() => setFType(fType === "urgent" ? "any" : "urgent")}>🚨 {t("board.f_urgent")}</FilterChip>
          <FilterChip on={fType === "planned"} onClick={() => setFType(fType === "planned" ? "any" : "planned")}>🎾 {t("board.f_planned")}</FilterChip>
          <FilterChip on={fType === "event"} onClick={() => setFType(fType === "event" ? "any" : "event")}>🎉 {t("board.f_event")}</FilterChip>
        </BoardGroup>
        <BoardGroup label={t("ct.filter_label")}>
          <FilterChip on={ctFilter === "any"} onClick={() => setCtFilter("any")}>{t("ct.any")}</FilterChip>
          {COURT_TYPES.map((ct) => {
            const meta = courtTypeMeta(ct, lang);
            return <FilterChip key={ct} on={ctFilter === ct} onClick={() => setCtFilter(ctFilter === ct ? "any" : ct)}>{meta.emoji} {meta.label}</FilterChip>;
          })}
        </BoardGroup>
        <BoardGroup label={t("city.label")}>
          <FilterChip on={fCity == null} onClick={() => setFCity(null)}>{t("city.any")}</FilterChip>
          {cityNames.map((cy) => <FilterChip key={cy} on={fCity === cy} onClick={() => setFCity(fCity === cy ? null : cy)}>📍 {cy}</FilterChip>)}
        </BoardGroup>
        <BoardGroup label={t("players.filter_level")}>
          <FilterChip on={fLevel == null} onClick={() => setFLevel(null)}>{t("common.all")}</FilterChip>
          {LEVELS.map((l) => (
            <FilterChip key={l.n} on={fLevel === l.n} onClick={() => setFLevel(fLevel === l.n ? null : l.n)}>
              <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: l.color }} />{l.name}
            </FilterChip>
          ))}
        </BoardGroup>
        <button onClick={onClose} className="cbtn cbtn-green w-full">{t("board.filters_show", { n: count })}</button>
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className="rounded-full border-2 border-[var(--ink)] px-4 font-extrabold"
      style={{ minHeight: 48, fontSize: "1rem", background: on ? "var(--green-pop)" : "var(--cream2)", color: "var(--ink)" }}>
      {children}
    </button>
  );
}

function ShareRow({ sos }: { sos: EligibleSosRow }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void shareTo("/sos/" + sos.id, t("share.game_fwd"), t("invite.copied")); }}
      className="absolute top-3 right-3 z-10 rounded-full px-3 py-1 text-xs font-extrabold border-2 border-[var(--ink)]"
      style={{ background: "var(--cream2)" }}
      aria-label={t("share.spread")}
    >↗ {t("share.spread")}</button>
  );
}

function Card({ sos, onChange, mine, applied, candidates, guest, mePhoto, meName }: { sos: EligibleSosRow; onChange: () => void; mine?: boolean; applied?: boolean; candidates?: number; guest?: boolean; mePhoto?: string | null; meName?: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [propTime, setPropTime] = useState("");
  const [prefCt, setPrefCt] = useState<"any" | "indoor" | "outdoor">("any");
  const isUrgent = sos.kind === "sos";
  const claimed = sos.status === "claimed";
  const tone: RailTone = mine ? "mine" : isUrgent ? "sos" : "plan";
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const d = new Date(sos.play_at);
  const now = new Date();
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  const day = d.toDateString() === now.toDateString() ? t("rail.today")
    : d.toDateString() === tmr.toDateString() ? t("rail.tmrw")
    : d.toLocaleDateString(locale, { weekday: "short" });
  const timeStart = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const winEnd = (sos as any).play_until ? new Date((sos as any).play_until as string) : null;
  // Windowed game → compact hour range in the rail ("11–18"), exact otherwise
  const time = winEnd
    ? hourRange(d, winEnd)
    : timeStart;
  const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  const nRackets = String(sos.format).startsWith("doubles") ? 4 : 2;
  const softCoral = "#F0705B";
  const shareGame = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); void shareTo("/sos/" + sos.id, t("share.game_fwd"), t("invite.copied")); };

  return (
    <RailShell>
      <TimeRail day={day} time={time} ct={(sos as any).court_type_any ? "🏟️" : ctMeta.emoji} tone={tone} dateStr={dateStr} ctSub={(sos as any).court_type_any ? t("ct.sub_any") : sos.court_type === "indoor" ? t("ct.sub_in") : t("ct.sub_out")} />
      <div style={{ flex: 1, minWidth: 0, padding: "12px 13px" }}>
        {/* tags row — only when there's a tag, so the name never floats below empty space */}
        {((sos.is_buddy && !mine) || isUrgent || mine || (!!sos.sport && sos.sport !== "tennis")) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
            {sos.is_buddy && !mine && (
              <span style={{ fontWeight: 800, fontSize: RF.tag, color: "#FFF6E8", background: softCoral, borderRadius: 6, padding: "1px 7px" }}>🤝 {t("buddy.tag")}</span>
            )}
            {isUrgent && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: RF.tag, letterSpacing: "0.06em", textTransform: "uppercase", color: softCoral }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: softCoral }} />SOS</span>
            )}
            {mine && (
              <span style={{ fontWeight: 800, fontSize: RF.tag, letterSpacing: "0.04em", textTransform: "uppercase", color: claimed ? "#3A4A12" : "#8C5A33" }}>{claimed ? `✅ ${t("board.game_claimed")}` : t("board.you_host")}</span>
            )}
            {!!sos.sport && sos.sport !== "tennis" && (
              <span style={{ fontWeight: 800, fontSize: RF.tag, padding: "1px 8px", borderRadius: 999, background: "var(--green-pop)", border: "1.5px solid var(--ink)" }}>{sportMeta(sos.sport).emoji} {t(sportMeta(sos.sport).key)}</span>
            )}
          </div>
        )}

        {/* photo + name + club (games) OR court headline (mine) */}
        {mine ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <RailPhoto src={mePhoto ?? null} name={meName || "You"} seed={sos.caller_id} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: RF.name, lineHeight: 1.05, ...clampLines(1) }}>{t("board.youre_hosting")}</div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: RF.club, color: "#8C5A33", marginTop: 2, ...clampLines(1) }}>📍 {sos.court_city ?? "—"} · {sos.court_name ?? t("board.court")}</div>
            </div>
          </div>
        ) : sos.caller_name ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <RailPhoto src={sos.caller_photo_url ?? null} name={sos.caller_name} seed={sos.caller_id} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: RF.name, lineHeight: 1.05, ...clampLines(1) }}>{sos.caller_name}{sos.caller_last_name ? " " + sos.caller_last_name : ""}</div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: RF.club, color: "#8C5A33", marginTop: 2, ...clampLines(1) }}>📍 {sos.court_city ?? "—"} · {sos.court_name ?? t("board.court")}</div>
            </div>
          </div>
        ) : (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: RF.name, lineHeight: 1.1, ...clampLines(2) }}>📍 {sos.court_city ?? "—"} · {sos.court_name ?? t("board.court")}</div>
          </div>
        )}

        {/* status + levels — kept on ONE line so every card is the same height */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "nowrap", overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ flexShrink: 0 }}><CourtStatusBadge status={sos.court_status} muted /></span>
          <span style={{ flexShrink: 0, fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)" }}>{t("rail.levels")} <span style={{ color: lmMin.color, fontWeight: 800 }}>{sos.level_min}</span>–<span style={{ color: lmMax.color, fontWeight: 800 }}>{sos.level_max}</span></span>
        </div>

        {sos.note && <div style={{ fontStyle: "italic", fontWeight: 600, fontSize: RF.note, color: "rgba(43,33,24,0.6)", marginTop: 6, ...clampLines(2) }}>"{sos.note}"</div>}

        {mine && !claimed && (candidates ?? 0) > 0 && (
          <Link to="/sos/$id" params={{ id: sos.id }} className="block font-extrabold text-sm mt-2" style={{ color: "var(--coral)" }}>🙋 {t("app.candidates_line", { n: candidates ?? 0 })}</Link>
        )}

        {/* action row */}
        {mine ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11 }}>
            <Rackets n={nRackets} size={22} />
            <Link to="/sos/$id" params={{ id: sos.id }} style={{ flex: 1, textAlign: "center", background: "var(--green-pop)", color: "var(--ink)", border: "2px solid var(--ink)", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 14 }}>{t("board.manage")}</Link>
            {!claimed && <Link to="/sos/new" search={{ edit: sos.id }} aria-label={t("board.edit")} style={{ padding: 3 }}><EditIcon /></Link>}
            {!guest && <button type="button" onClick={shareGame} aria-label={t("share.spread")} style={{ padding: 3 }}><ShareIcon /></button>}
          </div>
        ) : isUrgent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
            <Rackets n={nRackets} size={22} />
            <Link to="/sos/$id" params={{ id: sos.id }} style={{ flex: 1, textAlign: "center", background: softCoral, color: "#FFF6E8", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 14 }}>🚨 {t("sos.save_this")}</Link>
            {!guest && <button type="button" onClick={shareGame} aria-label={t("share.spread")} style={{ padding: 3 }}><ShareIcon /></button>}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
            <Rackets n={nRackets} size={22} />
            {applied ? (
              <Link to="/sos/$id" params={{ id: sos.id }} style={{ flex: 1, textAlign: "center", background: "var(--cream2)", color: "var(--ink)", border: "2px solid var(--ink)", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 14 }}>🙋 {t("app.applied_chip")}</Link>
            ) : (
              <button type="button" disabled={busy} style={{ flex: 1, textAlign: "center", background: "var(--green-pop)", color: "var(--ink)", border: "2px solid var(--ink)", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 14, opacity: busy ? 0.6 : 1 }}
                onClick={async () => {
                  // Guest taps "I'm interested" on a SPECIFIC game — carry that
                  // game (with the apply intent) through signup, not just /board.
                  if (guest) { navigate({ to: "/auth", search: joinSearch(`/sos/${sos.id}?apply=1`) }); return; }
                  const ctAnyGame = !!(sos as any).court_type_any;
                  if ((winEnd || ctAnyGame) && !proposing) { setProposing(true); return; }
                  setBusy(true);
                  const r = await applyToGame(sos.id);
                  setBusy(false);
                  if (!r.ok) {
                    if (r.reason === "not_applicable") { toast.info(t("app.turned_urgent")); onChange(); return; }
                    toast.error(r.reason === "taken" ? t("sos.err_taken") : r.reason === "already_in" ? t("sos.err_already_in") : r.reason === "already_applied" ? t("app.already") : r.reason); return;
                  }
                  if (r.fallbackClaimed) { navigate({ to: "/sos/$id", params: { id: sos.id } }); return; }
                  toast.success(t("app.sent"));
                  onChange();
                }}>🙋 {t("app.im_interested")}</button>
            )}
            {!guest && <button type="button" onClick={shareGame} aria-label={t("share.spread")} style={{ padding: 3 }}><ShareIcon /></button>}
          </div>
        )}

        {/* Windowed and/or Any-court game: propose time and/or court preference */}
        {proposing && (winEnd || (sos as any).court_type_any) && !applied && (
          <div style={{ marginTop: 8 }}>
            {winEnd && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)", flexShrink: 0 }}>{t("app.i_can_at")}</span>
                <input type="time" className="cinput" style={{ flex: 1, padding: "7px 10px" }} value={propTime} onChange={(e) => setPropTime(e.target.value)} />
              </div>
            )}
            {(sos as any).court_type_any && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: winEnd ? 8 : 0, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)" }}>{t("app.pref_label")}</span>
                {(["indoor", "outdoor", "any"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setPrefCt(v)} className={`cchip ${prefCt === v ? "cchip-on" : ""}`} style={{ fontSize: 13, padding: "4px 11px" }}>
                    {v === "indoor" ? `🏠 ${t("ct.indoor")}` : v === "outdoor" ? `☀️ ${t("ct.outdoor")}` : t("app.pref_any")}
                  </button>
                ))}
              </div>
            )}
            <button type="button" disabled={busy || (!!winEnd && !propTime)} className="cbtn cbtn-green w-full text-sm mt-2" style={{ opacity: busy || (!!winEnd && !propTime) ? 0.6 : 1 }}
              onClick={async () => {
                let iso: string | undefined;
                if (winEnd) {
                  const dd = new Date(sos.play_at);
                  const [h, m] = propTime.split(":").map(Number);
                  dd.setHours(h ?? 0, m ?? 0, 0, 0);
                  if (dd.getTime() < new Date(sos.play_at).getTime() || dd.getTime() > winEnd.getTime()) { toast.error(t("app.time_outside")); return; }
                  iso = dd.toISOString();
                }
                setBusy(true);
                const r = await applyToGame(sos.id, iso, (sos as any).court_type_any && prefCt !== "any" ? prefCt : null);
                setBusy(false);
                if (!r.ok) { toast.error(r.reason === "bad_proposed_time" ? t("app.time_outside") : r.reason === "already_applied" ? t("app.already") : r.reason === "not_applicable" ? t("app.turned_urgent") : r.reason); if (r.reason === "not_applicable") onChange(); return; }
                toast.success(t("app.sent"));
                setProposing(false);
                onChange();
              }}>{t("app.send")}</button>
          </div>
        )}
      </div>
    </RailShell>
  );
}


