import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEligibleSos, fetchOpenGames, formatLabel, sweepExpired, claimSos, type EligibleSosRow } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta, courtTypeMeta, COURT_TYPES, type CourtType } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type Seg = "urgent" | "planned";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({ meta: [{ title: "Board — Courtship" }] }),
  validateSearch: (s: Record<string, unknown>): { seg?: Seg } => ({
    seg: s.seg === "planned" ? "planned" : s.seg === "urgent" ? "urgent" : undefined,
  }),
  component: BoardPage,
});

function BoardPage() {
  const { t, lang } = useI18n();
  const search = Route.useSearch();
  const seg: Seg = search.seg ?? "urgent";
  const navigate = Route.useNavigate();
  const [urgent, setUrgent] = useState<EligibleSosRow[]>([]);
  const [planned, setPlanned] = useState<EligibleSosRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctFilter, setCtFilter] = useState<CourtType | "any">("any");

  const load = useCallback(async () => {
    await sweepExpired();
    const [u, p] = await Promise.all([fetchEligibleSos(), fetchOpenGames()]);
    setUrgent(u); setPlanned(p); setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = (supabase as any)
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const all = seg === "urgent" ? urgent : planned;
  const rows = ctFilter === "any" ? all : all.filter((r) => r.court_type === ctFilter);
  const buddyRows = rows.filter((r) => r.is_buddy);
  const otherRows = rows.filter((r) => !r.is_buddy);

  function setSeg(next: Seg) {
    navigate({ search: { seg: next }, replace: true });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("board.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("board.sub")}</p>
      </div>

      {/* Segmented control */}
      <div
        role="tablist"
        aria-label={t("board.title")}
        className="grid grid-cols-2 gap-1 p-1 border-2 border-[var(--ink)] rounded-full"
        style={{ background: "var(--cream2)" }}
      >
        <SegBtn on={seg === "urgent"} onClick={() => setSeg("urgent")} tone="coral" badge={urgent.length}>
          🚨 {t("board.seg_urgent")}
        </SegBtn>
        <SegBtn on={seg === "planned"} onClick={() => setSeg("planned")} tone="green" badge={planned.length}>
          🎾 {t("board.seg_planned")}
        </SegBtn>
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

      <div className="flex justify-end">
        <Link to="/sos/new" search={{ planned: seg === "planned" ? 1 : undefined }} className="cbtn cbtn-green">
          + {seg === "urgent" ? t("home.save_my_set") : t("home.post_a_game")}
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("rescue.listening")}</div>
      ) : rows.length === 0 ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">{seg === "urgent" ? "🌅" : "🎾"}</div>
          <div className="font-display text-xl mt-1">
            {seg === "urgent" ? t("rescue.empty_title") : t("games.empty_title")}
          </div>
          <div className="text-base text-[var(--ink)] font-semibold mt-1">
            {seg === "urgent" ? t("rescue.empty_sub") : t("games.empty_sub")}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {buddyRows.length > 0 && (
            <div className="space-y-3">
              <div className="csection-label">{t("buddy.from_buddies")}</div>
              {buddyRows.map((r) => <Card key={r.id} sos={r} seg={seg} onChange={load} />)}
            </div>
          )}
          {otherRows.length > 0 && (
            <div className="space-y-3">
              {buddyRows.length > 0 && <div className="csection-label">{t("board.others")}</div>}
              {otherRows.map((r) => <Card key={r.id} sos={r} seg={seg} onChange={load} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SegBtn({ on, onClick, children, tone, badge }: { on: boolean; onClick: () => void; children: React.ReactNode; tone: "coral" | "green"; badge?: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className="rounded-full font-extrabold flex items-center justify-center gap-2"
      style={{
        minHeight: 48,
        fontSize: "1.0625rem",
        background: on ? (tone === "coral" ? "var(--coral)" : "var(--green-pop)") : "transparent",
        color: on && tone === "coral" ? "#FFF6E8" : "var(--ink)",
        border: on ? "2px solid var(--ink)" : "none",
      }}
    >
      {children}
      {badge && badge > 0 ? <span className="text-base">({badge})</span> : null}
    </button>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="rounded-full border-2 border-[var(--ink)] px-4 font-extrabold"
      style={{
        minHeight: 48,
        fontSize: "1rem",
        background: on ? "var(--green-pop)" : "var(--cream2)",
        color: "var(--ink)",
      }}
    >
      {children}
    </button>
  );
}

function Card({ sos, seg, onChange }: { sos: EligibleSosRow; seg: Seg; onChange: () => void }) {
  const { t, lang } = useI18n();
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  const [busy, setBusy] = useState(false);
  const ctMeta = courtTypeMeta(sos.court_type, lang);

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

  if (seg === "urgent") {
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
      <button
        className="cbtn cbtn-green w-full mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) toast.error(r.reason === "taken" ? "This one's taken 💔" : r.reason);
          else toast.success("You're in 🎾");
          onChange();
        }}
      >
        {t("games.im_in")}
      </button>
    </div>
  );
}