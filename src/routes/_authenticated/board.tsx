import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { shareInvite } from "@/lib/share";
import { fetchEligibleSos, fetchOpenGames, fetchMyActiveGames, fetchMyUpcomingClaims, withdrawClaim, formatLabel, claimSos, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta, courtTypeMeta, COURT_TYPES, LEVELS, CITIES, weeklyStreak, type CourtType, type City } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { fetchApprovedEvents, fetchMyAttendance, type EventRow } from "@/lib/events";
import { EventCard } from "@/components/EventCard";
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
  const [cityForStats, setCityForStats] = useState("Uppsala");
  const [gamesPlayed, setGamesPlayed] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const seenClaimedRef = useRef<Set<string> | null>(null);
  const [streakWeeks, setStreakWeeks] = useState(0);

  const load = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id ?? null;
    setMeId(uid);

    // After we know the user id, everything else only depends on it — fetch in
    // parallel instead of waterfalling. Each personal fetch degrades on its own
    // so one hiccup never blanks the board.
    const profileQ = uid
      ? (supabase as any).from("profiles").select("home_city,games_played,rescues_count,referrals_count").eq("id", uid).maybeSingle().then((r: any) => r, () => null)
      : Promise.resolve(null);
    const countQ = uid
      ? (supabase as any).from("sos_requests").select("id", { count: "exact", head: true }).eq("caller_id", uid).eq("kind", "open").then((r: any) => r?.count ?? 0, () => 0)
      : Promise.resolve(0);
    const histQ = uid ? fetchMyGameHistory(uid, 150).catch(() => [] as any[]) : Promise.resolve([] as any[]);
    const claimsQ = uid ? fetchMyUpcomingClaims(uid).catch(() => [] as any[]) : Promise.resolve([] as any[]);

    const [u, p, m, ev, att, profRes, hostedCount, hist, claims] = await Promise.all([
      fetchEligibleSos(), fetchOpenGames(), fetchMyActiveGames(), fetchApprovedEvents(), fetchMyAttendance(),
      profileQ, countQ, histQ, claimsQ,
    ]);

    setUrgent(u); setPlanned(p); setMine(m); setEvents(ev); setMyAttendance(att);
    const prof = (profRes as any)?.data;
    if (prof) {
      setCityForStats(prof.home_city ?? "Uppsala");
      setGamesPlayed(prof.games_played ?? 0);
      const cel = checkCelebration(prof.games_played ?? 0, prof.rescues_count ?? 0, prof.referrals_count ?? 0, (hostedCount as number) ?? 0);
      if (cel) setCelebration(cel);
    }
    setStreakWeeks(weeklyStreak((hist as any[]).map((g) => g.played_at)).weeks);
    setMyClaims(claims as any);
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
    return () => { supabase.removeChannel(ch); };
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
  const gameMatch = (r: EligibleSosRow) =>
    (ctFilter === "any" || r.court_type === ctFilter) &&
    (fCity == null || r.court_city === fCity) &&
    (fLevel == null || (r.level_min <= fLevel && fLevel <= r.level_max));
  const eventMatch = (e: EventRow) => fCity == null || e.city === fCity;
  const showKind = (k: "urgent" | "planned" | "event") => fType === "any" || fType === k;
  const nothing = !loading && urgent.length === 0 && planned.length === 0 && mine.length === 0 && events.length === 0;
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const filterCount =
    (ctFilter !== "any" ? 1 : 0) + (fCity != null ? 1 : 0) + (fLevel != null ? 1 : 0) + (fType !== "any" ? 1 : 0);
  type TLItem =
    | { id: string; t: number; kind: "sos" | "open" | "mine"; r: EligibleSosRow }
    | { id: string; t: number; kind: "event"; e: EventRow };
  const timeline: TLItem[] = [
    ...(showKind("urgent") ? urgent.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "sos", r })),
    ...(showKind("planned") ? planned.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "open", r })),
    ...(showKind("planned") ? mine.filter(gameMatch) : []).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "mine", r })),
    ...(showKind("event") ? events.filter(eventMatch) : []).map((e): TLItem => ({ id: e.id, t: new Date(e.starts_at).getTime(), kind: "event", e })),
  ].sort((a, b) => a.t - b.t);

  return (
    <div className="space-y-5">
      {celebration && <CelebrationOverlay c={celebration} onClose={() => setCelebration(null)} />}
      {gamesPlayed === 0 && <GetStarted />}
      {/* PRIMARY actions — New game + SOS */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-green w-full text-center">🎾 {t("tonight.new_game")}</Link>
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-coral w-full text-center">🚨 {t("tonight.sos")}</Link>
      </div>
      <Link to="/matches" search={{ log: true }} className="cbtn cbtn-ghost w-full text-center block">✅ {t("board.log_cta")}</Link>

      {/* count + filters, right under the create buttons */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm" style={{ color: "rgba(43,33,24,0.65)" }}>
          {timeline.length > 0 ? t("tonight.pulse", { n: timeline.length }) : t("tonight.pulse_quiet")}
        </span>
        {streakWeeks >= 1 && (
          <Link to="/progress" className="inline-flex items-center gap-1 font-extrabold text-xs px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>🔥 {streakWeeks}</Link>
        )}
        <button type="button" onClick={() => setFiltersOpen(true)}
          className="ml-auto inline-flex items-center gap-2 font-extrabold rounded-full px-4 py-2 text-sm shrink-0"
          style={{ background: "var(--ink)", color: "#FFF6E8" }}>
          ⚙ {t("players.filters")}
          {filterCount > 0 && (
            <span className="rounded-full px-2 text-xs font-extrabold" style={{ background: "var(--coral)", color: "#FFF6E8" }}>{filterCount}</span>
          )}
        </button>
      </div>

      <AttentionStrip onChange={load} />

      <AnnouncementBanner />

      <InstallBanner />
      <StandaloneNotifPrompt />

      {!loading && urgent.length > 0 && (
        <div
          className="rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
          style={{ background: "var(--coral)", color: "#FFF6E8", boxShadow: "4px 4px 0 var(--ink)" }}
          role="status"
        >
          <div className="font-display text-lg leading-tight">
            🚨 {t(urgent.length === 1 ? "board.rescue_one" : "board.rescue_many", { n: urgent.length })}
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
              <button onClick={() => onWithdraw(s)} className="cbtn cbtn-ghost shrink-0">{t("home.cant_make_it")}</button>
            </div>
          ))}
        </div>
      )}

      {/* The evening — games, SOS and events woven together by time */}
      {!loading && timeline.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label">{t("tonight.evening")}</div>
          <div>
            {timeline.map((it, idx) => {
              const dot = it.kind === "sos" ? "var(--coral)" : it.kind === "event" ? "var(--wood)" : "var(--green-pop)";
              return (
                <RailItem
                  key={it.id}
                  time={new Date(it.t).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  dot={dot}
                  last={idx === timeline.length - 1}
                >
                  {it.kind === "event" ? (
                    <EventCard e={it.e} meId={meId} myStatus={myAttendance[it.e.id]} onChange={load} />
                  ) : it.kind === "mine" ? (
                    <Card sos={it.r} onChange={load} mine />
                  ) : (
                    <Card sos={it.r} onChange={load} />
                  )}
                </RailItem>
              );
            })}
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

      <div className="flex justify-end">
        <Link to="/events/new" className="cbtn cbtn-ghost">🎉 {t("board.host_event")}</Link>
      </div>

      {/* Coming soon — flag-gated features shown as teasers */}
      <div className="space-y-3">
        <div className="csection-label">{t("soon.title")}</div>
        <div className="grid grid-cols-2 gap-3">
          <SoonCard emoji="🎰" title={t("soon.lucky")} />
          <SoonCard emoji="🎾❔" title={t("soon.swipe")} />
        </div>
      </div>

      {nothing && (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-3xl">🌅</div>
          <div className="font-display text-xl">{t("rescue.empty_title")}</div>
          <div className="text-base text-[var(--ink)] font-semibold">{t("rescue.empty_sub")}</div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
            <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-coral">📅 {t("board.plan_game")}</Link>
            <button type="button" className="cbtn cbtn-green" onClick={() => void shareInvite(t("invite.message"), t("invite.copied"))}>🤗 {t("invite.friend_cta")}</button>
            <Link to="/me" className="cbtn cbtn-ghost">🎾 {t("empty.dir_new_cta")}</Link>
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
          {CITIES.map((cy) => <FilterChip key={cy} on={fCity === cy} onClick={() => setFCity(fCity === cy ? null : cy)}>📍 {cy}</FilterChip>)}
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

function Card({ sos, onChange, mine }: { sos: EligibleSosRow; onChange: () => void; mine?: boolean }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  const [busy, setBusy] = useState(false);
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  const isUrgent = sos.kind === "sos";
  const claimed = sos.status === "claimed";

  const inner = (
    <>
      {mine ? (
        <div className="inline-block text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full mb-2"
          style={{ background: "var(--green-pop)", border: "1px solid var(--ink)" }}>
          {claimed ? `✅ ${t("board.game_claimed")}` : t("board.your_game")}
        </div>
      ) : sos.is_buddy ? (
        <div className="inline-block text-base font-extrabold uppercase px-2 py-1 rounded-full mb-2"
          style={{ background: "var(--coral)", color: "#FFF6E8" }}>
          🤝 {sos.caller_name ? t("buddy.your_buddy", { name: sos.caller_name }) : t("buddy.from_buddies")}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl leading-tight whitespace-nowrap">{whenLabel(sos.play_at)}</div>
          <div className="font-extrabold truncate">
            📍 {sos.court_city ?? "—"} · {sos.court_name ?? "Court"} · {ctMeta.emoji} {ctMeta.label}
          </div>
          {!mine && !sos.is_buddy && sos.caller_name && (
            <div className="text-base font-semibold text-[var(--ink)] mt-0.5">🎾 {sos.caller_name}</div>
          )}
          <div className="mt-1"><CourtStatusBadge status={sos.court_status} muted /></div>
          <div className="text-base text-[var(--ink)] mt-2">
            {formatLabel(sos.format)} · L
            <span className="font-extrabold" style={{ color: lmMin.color }}>{sos.level_min}</span>
            –<span className="font-extrabold" style={{ color: lmMax.color }}>{sos.level_max}</span>
          </div>
          {sos.note && <div className="text-base italic mt-1 text-[var(--ink)]">"{sos.note}"</div>}
        </div>
        <div className="text-base text-[var(--ink)] whitespace-nowrap">{timeAgo(sos.created_at)}</div>
      </div>
    </>
  );

  if (mine) {
    return (
      <div className="ccard p-4" style={claimed ? { borderColor: "var(--green-pop)", boxShadow: "4px 4px 0 var(--ink)" } : undefined}>
        {inner}
        <div className="flex gap-2 mt-3">
          {!claimed && (
          <Link to="/sos/new" search={{ edit: sos.id }} className="cbtn cbtn-ghost flex-1 text-center">✏️ {t("board.edit")}</Link>
          )}
          <Link to="/sos/$id" params={{ id: sos.id }} className="cbtn cbtn-green flex-1 text-center">{t("board.manage")}</Link>
        </div>
      </div>
    );
  }
  if (isUrgent) {
    return (
      <Link to="/sos/$id" params={{ id: sos.id }} className="ccard p-4 block"
        style={sos.is_buddy ? { borderColor: "var(--coral)", boxShadow: "4px 4px 0 var(--coral)" } : undefined}>
        {inner}
        <div className="mt-3">
          <span className="cbtn cbtn-coral w-full" style={{ pointerEvents: "none" }}>{t("sos.im_in")}</span>
        </div>
      </Link>
    );
  }
  return (
    <div className="ccard p-4">
      {inner}
      <button className="cbtn cbtn-green w-full mt-3" disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) {
            toast.error(r.reason === "taken" ? t("sos.err_taken") : r.reason === "already_in" ? t("sos.err_already_in") : r.reason);
            return;
          }
          // Complete the flow: land on the contact screen (host + Message on WhatsApp), not a 2s toast
          navigate({ to: "/sos/$id", params: { id: sos.id } });
        }}>
        {t("games.im_in")}
      </button>
    </div>
  );
}


function SoonCard({ emoji, title }: { emoji: string; title: string }) {
  const { t } = useI18n();
  return (
    <div className="ccard p-4 text-center" style={{ opacity: 0.75, borderStyle: "dashed" }}>
      <div className="text-3xl">{emoji}</div>
      <div className="font-display text-lg mt-1 leading-tight">{title}</div>
      <div
        className="inline-block text-xs font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full mt-2"
        style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
      >
        {t("soon.badge")}
      </div>
    </div>
  );
}

// A vertical time-rail row: the time + a type-coloured dot + a connector line
// down to the next item, with the card to its right. Threads tonight's games,
// SOS flares and events into one connected timeline (not loose tiles).
function RailItem({ time, dot, last, children }: { time: string; dot: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0" style={{ width: 44 }}>
        <span className="font-display text-sm" style={{ color: "rgba(43,33,24,0.7)", lineHeight: 1.1 }}>{time}</span>
        <span className="rounded-full mt-1" style={{ width: 11, height: 11, background: dot, border: "2px solid var(--ink)", boxSizing: "border-box" }} />
        {!last && <span className="flex-1 mt-1 rounded-full" style={{ width: 2, background: "rgba(43,33,24,0.22)", minHeight: 16 }} />}
      </div>
      <div className="flex-1 min-w-0 pb-3">{children}</div>
    </div>
  );
}
