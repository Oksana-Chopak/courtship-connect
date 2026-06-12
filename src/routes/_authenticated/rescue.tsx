import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/rescue")({
  beforeLoad: () => { throw redirect({ to: "/board", search: { seg: "urgent" } }); },
  component: () => null,
});

function Rescue() {
  const { t } = useI18n();
  const [me, setMe] = useState<{ id: string; level: number; buddy_optin: string; buddy_sos_optin: boolean } | null>(null);
  const [rows, setRows] = useState<EligibleSosRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await sweepExpired();
    setRows(await fetchEligibleSos());
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("id,level,buddy_optin,buddy_sos_optin")
        .eq("id", u.user.id)
        .maybeSingle();
      const meRow = p as any;
      setMe(meRow);
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (!me) return;
    const ch = (supabase as any)
      .channel("rescue-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, load]);

  // Browser notification on new SOS
  const [prevIds, setPrevIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    if (prevIds.size > 0 && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const newOnes = rows.filter((r) => !prevIds.has(r.id));
      for (const r of newOnes) {
        try {
          new Notification(r.is_buddy ? "Your buddy needs you 🤝🚨" : "Someone needs a hero 🚨", {
            body: `${whenLabel(r.play_at)} · 📍 ${r.court_city ?? ""} · ${r.court_name ?? "court"}`,
          });
        } catch {}
      }
    }
    setPrevIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (!me) return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;

  // If both rescuer-mode AND buddy-SOS are off, user gets nothing.
  if (me.buddy_optin === "no" && !me.buddy_sos_optin) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-4xl">Rescue board 🚑</h1>
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🛌</div>
          <div className="font-display text-xl mt-1">You're off duty</div>
          <div className="text-sm text-[var(--ink)]">
            Turn on Buddy mode or Buddy SOS in your profile to see rescue calls.
          </div>
          <Link to="/me" className="cbtn cbtn-coral mt-4 inline-flex">Edit profile</Link>
        </div>
      </div>
    );
  }

  const buddyRows = rows.filter((r) => r.is_buddy);
  const nearbyRows = rows.filter((r) => !r.is_buddy);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("rescue.title")} 🚑</h1>
        <p className="text-[var(--ink)] font-semibold">
          {rows.length === 0 ? t("rescue.empty_title") : `${rows.length} · ${t("nav.rescue")}`}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("rescue.listening")}</div>
      ) : rows.length === 0 ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🌅</div>
          <div className="font-display text-xl mt-1">{t("rescue.empty_title")}</div>
          <div className="text-sm text-[var(--ink)]">{t("rescue.empty_sub")}</div>
          <Link to="/sos/new" className="cbtn cbtn-coral mt-4 inline-flex">{t("home.save_my_set")}</Link>
        </div>
      ) : (
        <div className="space-y-5">
          {buddyRows.length > 0 && (
            <div className="space-y-3">
              <div className="csection-label">{t("buddy.from_buddies")}</div>
              {buddyRows.map((r) => <SosCard key={r.id} sos={r} />)}
            </div>
          )}
          {nearbyRows.length > 0 && (
            <div className="space-y-3">
              {buddyRows.length > 0 && <div className="csection-label">{t("rescue.title")}</div>}
              {nearbyRows.map((r) => <SosCard key={r.id} sos={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SosCard({ sos }: { sos: EligibleSosRow }) {
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  return (
    <Link
      to="/sos/$id"
      params={{ id: sos.id }}
      className="ccard p-4 block"
      style={sos.is_buddy ? { borderColor: "var(--coral)", boxShadow: "4px 4px 0 var(--coral)" } : undefined}
    >
      {sos.is_buddy && (
        <div
          className="inline-block text-xs font-extrabold uppercase px-2 py-1 rounded-full mb-2"
          style={{ background: "var(--coral)", color: "#FFF6E8" }}
        >
          🤝 {sos.caller_name ? `Your buddy ${sos.caller_name}` : "Your buddy"}
        </div>
      )}
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
      <div className="mt-3">
        <span className="cbtn cbtn-coral w-full" style={{ pointerEvents: "none" }}>I'm in! 🎾</span>
      </div>
    </Link>
  );
}