import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEligibleSos, fetchOpenGames, fetchMyActiveGames, formatLabel, sweepExpired, claimSos, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta, courtTypeMeta, COURT_TYPES, type CourtType } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { EventFormModal } from "@/components/EventFormModal";
import { fetchApprovedEvents, type EventRow } from "@/lib/events";
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

  const load = useCallback(async () => {
    await sweepExpired();
    const [u, p, m, ev] = await Promise.all([fetchEligibleSos(), fetchOpenGames(), fetchMyActiveGames(), fetchApprovedEvents()]);
    setUrgent(u); setPlanned(p); setMine(m); setEvents(ev); setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = (supabase as any)
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const byTime = (a: EligibleSosRow, b: EligibleSosRow) => new Date(a.play_at).getTime() - new Date(b.play_at).getTime();
  const filt = (arr: EligibleSosRow[]) => (ctFilter === "any" ? arr : arr.filter((r) => r.court_type === ctFilter));
  // Buddies float to the top of each section, then everyone else — both sorted nearest-first.
  const buddyFirst = (arr: EligibleSosRow[]) => [
    ...arr.filter((r) => r.is_buddy).sort(byTime),
    ...arr.filter((r) => !r.is_buddy).sort(byTime),
  ];
  const urgentRows = buddyFirst(filt(urgent));
  const plannedRows = buddyFirst(filt(planned));
  const mineAll = [...mine].sort(byTime);
  const nothing = !loading && urgentRows.length === 0 && plannedRows.length === 0 && mineAll.length === 0 && events.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("board.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("board.sub")}</p>
      </div>

      {/* Indoor / Outdoor / Any filter */}
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

      <div className="flex justify-end gap-2">
        <button type="button" className="cbtn cbtn-ghost" onClick={() => setShowEventForm(true)}>🎉 {t("board.host_event")}</button>
        <Link to="/sos/new" search={{ planned: undefined }} className="cbtn cbtn-green">+ {t("board.new_game")}</Link>
      </div>

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
            <div key={e.id} className="ccard p-4" style={{ borderColor: "var(--coral)" }}>
              <div className="font-display text-2xl leading-tight">{e.title}</div>
              <div className="font-extrabold mt-1">{whenLabel(e.starts_at)} · 📍 {e.city ? e.city + " · " : ""}{e.location}</div>
              {e.format && <div className="text-base text-[var(--ink)] mt-1">{e.format}</div>}
              {e.description && <div className="text-base italic text-[var(--ink)] mt-1">"{e.description}"</div>}
              {e.contact && <div className="text-base text-[var(--ink)] mt-1">✉️ {e.contact}</div>}
            </div>
          ))}
        </div>
      )}

      {showEventForm && (
        <EventFormModal onClose={() => setShowEventForm(false)} onSubmitted={load} />
      )}

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("rescue.listening")}</div>
      ) : nothing ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🌅</div>
          <div className="font-display text-xl mt-1">{t("rescue.empty_title")}</div>
          <div className="text-base text-[var(--ink)] font-semibold mt-1">{t("rescue.empty_sub")}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {urgentRows.length > 0 && (
            <div className="space-y-3">
              <div className="csection-label" style={{ color: "var(--coral)" }}>🚨 {t("board.seg_urgent")}</div>
              {urgentRows.map((r) => <Card key={r.id} sos={r} onChange={load} />)}
            </div>
          )}
          {plannedRows.length > 0 && (
            <div className="space-y-3">
              <div className="csection-label">🎾 {t("board.seg_planned")}</div>
              {plannedRows.map((r) => <Card key={r.id} sos={r} onChange={load} />)}
            </div>
          )}
        </div>
      )}
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
          if (!r.ok) toast.error(r.reason === "taken" ? "This one's taken 💔" : r.reason === "already_in" ? "You're already in 🎾" : r.reason);
          else toast.success("You're in 🎾");
          onChange();
        }}>
        {t("games.im_in")}
      </button>
    </div>
  );
}
