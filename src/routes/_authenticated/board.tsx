import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEligibleSos, fetchOpenGames, fetchMyActiveGames, fetchMyUpcomingClaims, withdrawClaim, formatLabel, claimSos, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta, courtTypeMeta, COURT_TYPES, type CourtType } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { EventFormModal } from "@/components/EventFormModal";
import { fetchApprovedEvents, fetchMyAttendance, type EventRow } from "@/lib/events";
import { EventCard } from "@/components/EventCard";
import { AttentionStrip } from "@/components/AttentionStrip";
import { InstallBanner, StandaloneNotifPrompt } from "@/components/InstallBanner";
import { GetStarted } from "@/components/GetStarted";
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

  const load = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    setMeId(au.user?.id ?? null);
    if (au.user) {
      const { data: prof, error: pe } = await (supabase as any).from("profiles").select("home_city,games_played").eq("id", au.user.id).maybeSingle();
      if (!pe && prof) {
        setCityForStats((prof as any).home_city ?? "Uppsala");
        setGamesPlayed((prof as any).games_played ?? 0);
      }
    }
    const [u, p, m, ev, att] = await Promise.all([fetchEligibleSos(), fetchOpenGames(), fetchMyActiveGames(), fetchApprovedEvents(), fetchMyAttendance()]);
    setMyClaims(au.user ? await fetchMyUpcomingClaims(au.user.id) : []);
    setUrgent(u); setPlanned(p); setMine(m); setEvents(ev); setMyAttendance(att); setLoading(false);
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

  return (
    <div className="space-y-5">
      {gamesPlayed === 0 && <GetStarted />}
      <div>
        <h1 className="font-display text-4xl">{t("board.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("board.sub")}</p>
      </div>

      <InstallBanner />
      <StandaloneNotifPrompt />

      <AttentionStrip onChange={load} />

      {/* HERO — Save My Set: the killer feature, always front & center */}
      <Link
        to="/sos/new"
        search={{ planned: undefined }}
        className="block ccard p-5 text-center"
        style={{ background: "var(--coral)", borderColor: "var(--ink)", color: "#FFF6E8" }}
      >
        <div className="font-display text-3xl leading-tight">{t("hero.rescue_title")}</div>
        <div className="text-base font-semibold mt-1" style={{ opacity: 0.95 }}>{t("hero.rescue_sub")}</div>
        <div className="mt-3 inline-block px-5 py-2 rounded-full font-display text-2xl" style={{ background: "#FFF6E8", color: "var(--coral)" }}>
          🚨 {t("hero.rescue_cta")}
        </div>
      </Link>

      {loading && <div className="text-center py-8 text-[var(--ink)]">{t("rescue.listening")}</div>}
      {!loading && urgentRows.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label" style={{ color: "var(--coral)" }}>🚨 {t("board.seg_urgent")}</div>
          {urgentRows.map((r) => <Card key={r.id} sos={r} onChange={load} />)}
        </div>
      )}

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

      {mineAll.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label">📣 {t("board.your_games")}</div>
          {mineAll.map((r) => (
            <Link key={r.id} to="/sos/$id" params={{ id: r.id }} className="ccard p-4 flex items-center justify-between">
              <div>
                <div className="font-display text-lg">{whenLabel(r.play_at)} · {r.court_name ?? "—"}</div>
                <div className="text-base text-[var(--ink)] font-semibold">
                  📍 {r.court_city ?? "—"} · {courtTypeMeta(r.court_type, lang).emoji}{" "}
                  {r.status === "claimed" ? t("board.claimed") : t("board.live")}
                </div>
              </div>
              <span className="text-2xl">›</span>
            </Link>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label">🎉 {t("board.events")}</div>
          {events.map((e) => (
            <EventCard key={e.id} e={e} meId={meId} myStatus={myAttendance[e.id]} onChange={load} />
          ))}
        </div>
      )}

      {showEventForm && (
        <EventFormModal onClose={() => setShowEventForm(false)} onSubmitted={load} />
      )}

      {/* Plan ahead + browse open games */}
      <div className="flex justify-end gap-2">
        <button type="button" className="cbtn cbtn-ghost" onClick={() => setShowEventForm(true)}>🎉 {t("board.host_event")}</button>
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-ghost">📅 {t("board.plan_game")}</Link>
      </div>
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
      {!loading && plannedRows.length > 0 && (
        <div className="space-y-3">
          <div className="csection-label">🎾 {t("board.seg_planned")}</div>
          {plannedRows.map((r) => <Card key={r.id} sos={r} onChange={load} />)}
        </div>
      )}
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
            toast.error(r.reason === "taken" ? "This one's taken 💔" : r.reason === "already_in" ? "You're already in 🎾" : r.reason);
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
