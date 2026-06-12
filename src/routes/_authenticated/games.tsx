import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/games")({
  beforeLoad: () => { throw redirect({ to: "/board", search: { seg: "planned" } }); },
  component: () => null,
});

function GamesBoard() {
  const { t } = useI18n();
  const [rows, setRows] = useState<EligibleSosRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setRows(await fetchOpenGames());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = (supabase as any)
      .channel("open-games-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("games.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("games.sub")}</p>
      </div>
      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">...</div>
      ) : rows.length === 0 ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🎾</div>
          <div className="font-display text-xl mt-1">{t("games.empty_title")}</div>
          <div className="text-sm text-[var(--ink)]">{t("games.empty_sub")}</div>
          <Link to="/sos/new" search={{ planned: 1 }} className="cbtn cbtn-green mt-4 inline-flex">
            + Post a game
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => <OpenCard key={r.id} sos={r} onClaim={load} />)}
        </div>
      )}
    </div>
  );
}

function OpenCard({ sos, onClaim }: { sos: EligibleSosRow; onClaim: () => void }) {
  const { t } = useI18n();
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  const [busy, setBusy] = useState(false);
  return (
    <div className="ccard p-4 block">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-tight">{whenLabel(sos.play_at)}</div>
          <div className="font-extrabold truncate">📍 {sos.court_city ?? "—"} · {sos.court_name ?? "Court"}</div>
          <div className="mt-2"><CourtStatusBadge status={sos.court_status} /></div>
          <div className="text-sm text-[var(--ink)] mt-2">
            {formatLabel(sos.format)} · L
            <span className="font-extrabold" style={{ color: lmMin.color }}>{sos.level_min}</span>
            –<span className="font-extrabold" style={{ color: lmMax.color }}>{sos.level_max}</span>
          </div>
          {sos.note && <div className="text-sm italic mt-1 text-[var(--ink)]">"{sos.note}"</div>}
        </div>
        <div className="text-xs text-[var(--ink)] whitespace-nowrap">{timeAgo(sos.created_at)}</div>
      </div>
      <button
        className="cbtn cbtn-green w-full mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) {
            if (r.reason === "taken") toast.error("This one's taken 💔");
            else toast.error(r.reason);
          } else {
            toast.success("You're in 🎾");
          }
          onClaim();
        }}
      >
        {t("games.im_in")}
      </button>
    </div>
  );
}