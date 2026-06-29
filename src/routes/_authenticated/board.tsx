import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEligibleSos, fetchOpenGames, fetchMyActiveGames, fetchMyUpcomingClaims, withdrawClaim, formatLabel, claimSos, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta, courtTypeMeta, COURT_TYPES, weeklyStreak, type CourtType } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { EventFormModal } from "@/components/EventFormModal";
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
import { toast } from "sonner";

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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [myAttendance, setMyAttendance] = useState<Record<string, string>>({});
  const [myClaims, setMyClaims] = useState<EligibleSosRow[]>([]);
  const [cityForStats, setCityForStats] = useState("Uppsala");
  const [gamesPlayed, setGamesPlayed] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
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
  const byTime = (a: EligibleSosRow, b: EligibleSosRow) => new Date(a.play_at).getTime() - new Date(b.play_at).getTime();
  const filt = (arr: EligibleSosRow[]) => (ctFilter === "any" ? arr : arr.filter((r) => r.court_type === ctFilter));
  // Buddies float to the top of each section, then everyone else — both sorted nearest-first.
  const buddyFirst = (arr: EligibleSosRow[]) => [
    ...arr.filter((r) => r.is_buddy).sort(byTime),
    ...arr.filter((r) => !r.is_buddy).sort(byTime),
  ];
  const urgentRows = buddyFirst(urgent);
  const plannedRows = buddyFirst(filt(planned));
  const mineAll = [...mine].sort(byTime);
  const nothing = !loading && urgentRows.length === 0 && plannedRows.length === 0 && mineAll.length === 0 && events.length === 0;
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const weekdayLabel = new Date().toLocaleDateString(locale, { weekday: "long" });
  const openCount = urgentRows.length + plannedRows.length + mineAll.length;
  type TLItem =
    | { id: string; t: number; kind: "sos" | "open" | "mine"; r: EligibleSosRow }
    | { id: string; t: number; kind: "event"; e: EventRow };
  const timeline: TLItem[] = [
    ...filt(urgent).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "sos", r })),
    ...filt(planned).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "open", r })),
    ...filt(mine).map((r): TLItem => ({ id: r.id, t: new Date(r.play_at).getTime(), kind: "mine", r })),
    ...events.map((e): TLItem => ({ id: e.id, t: new Date(e.starts_at).getTime(), kind: "event", e })),
  ].sort((a, b) => a.t - b.t);

  return (
    <div className="space-y-5">
      {celebration && <CelebrationOverlay c={celebration} onClose={() => setCelebration(null)} />}
      {gamesPlayed === 0 && <GetStarted />}
      {/* Tonight — header */}
      <div>
        <div className="csection-label">{weekdayLabel}</div>
        <h1 className="font-display text-3xl leading-none mt-0.5">{t("tonight.title")}</h1>
      </div>

      {/* live pulse + streak — quiet status line, only when there's something to show */}
      {(openCount > 0 || streakWeeks >= 1) && (
        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 font-bold text-sm" style={{ color: "rgba(43,33,24,0.6)" }}>
            {openCount > 0 ? t("tonight.pulse", { n: openCount }) : t("tonight.pulse_quiet")}
          </span>
          {streakWeeks >= 1 && (
            <span className="inline-flex items-center gap-1 font-extrabold text-xs px-2 py-0.5 rounded-full shrink-0"
              style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>
              🔥 {streakWeeks}
            </span>
          )}
        </div>
      )}

      {/* PRIMARY actions — New game + SOS, right under the streak */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-green w-full text-center">🎾 {t("tonight.new_game")}</Link>
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-coral w-full text-center">🚨 {t("tonight.sos")}</Link>
      </div>

      <AttentionStrip onChange={load} />

      <AnnouncementBanner />

      <InstallBanner />
      <StandaloneNotifPrompt />

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

      <div role="radiogroup" aria-label={t("ct.filter_label")} className="flex gap-2 flex-wrap">
        <FilterChip on={ctFilter === "any"} onClick={() => setCtFilter("any")}>{t("ct.any")}</FilterChip>
        {COURT_TYPES.map((ct) => {
          const meta = courtTypeMeta(ct, lang);
          return (
            <FilterChip key={ct} on={ctFilter === ct} onClick={() => setCtFilter(ct)}>
              {meta.emoji} {meta.label}
            </FilterChip>
          );
        })}
      </div>

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
                    <MineLink r={it.r} />
                  ) : (
                    <Card sos={it.r} onChange={load} />
                  )}
                </RailItem>
              );
            })}
          </div>
        </div>
      )}

      {showEventForm && (
        <EventFormModal onClose={() => setShowEventForm(false)} onSubmitted={load} />
      )}

      <div className="flex justify-end">
        <button type="button" className="cbtn cbtn-ghost" onClick={() => setShowEventForm(true)}>🎉 {t("board.host_event")}</button>
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
            <Link to="/me" className="cbtn cbtn-ghost">🎾 {t("empty.dir_new_cta")}</Link>
          </div>
        </div>
      )}

      <CommunityStatsWidget city={cityForStats} />
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

function Card({ sos, onChange }: { sos: EligibleSosRow; onChange: () => void }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  const [busy, setBusy] = useState(false);
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  const isUrgent = sos.kind === "sos";

  const inner = (
    <>
      {sos.is_buddy && (
        <div className="inline-block text-base font-extrabold uppercase px-2 py-1 rounded-full mb-2"
          style={{ background: "var(--coral)", color: "#FFF6E8" }}>
          🤝 {sos.caller_name ? t("buddy.your_buddy", { name: sos.caller_name }) : t("buddy.from_buddies")}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-tight">{whenLabel(sos.play_at)}</div>
          <div className="font-extrabold truncate">
            📍 {sos.court_city ?? "—"} · {sos.court_name ?? "Court"} · {ctMeta.emoji} {ctMeta.label}
          </div>
          <div className="mt-2"><CourtStatusBadge status={sos.court_status} /></div>
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

function MineLink({ r }: { r: EligibleSosRow }) {
  const { t, lang } = useI18n();
  return (
    <Link to="/sos/$id" params={{ id: r.id }} className="ccard p-4 flex items-center justify-between">
      <div>
        <div className="font-display text-lg">{whenLabel(r.play_at)} · {r.court_name ?? "—"}</div>
        <div className="text-base text-[var(--ink)] font-semibold">
          📍 {r.court_city ?? "—"} · {courtTypeMeta(r.court_type, lang).emoji}{" "}
          {r.status === "claimed" ? t("board.claimed") : t("board.live")}
        </div>
      </div>
      <span className="text-2xl">›</span>
    </Link>
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
