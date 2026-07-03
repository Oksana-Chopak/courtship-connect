import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyGameHistory, type GameRow } from "@/lib/games";
import { whenLabel } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export function GamesHistory() {
  const { t } = useI18n();
  const [rows, setRows] = useState<GameRow[]>([]);
  const [meta, setMeta] = useState<Record<string, { court: string; otherName: string }>>({});
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setMeId(u.user.id);
      const hist = await fetchMyGameHistory(u.user.id);
      setRows(hist);
      if (hist.length) {
        const sosIds = Array.from(new Set(hist.map((g) => g.sos_id).filter(Boolean) as string[]));
        const otherIds = Array.from(new Set(hist.map((g) => (g.player_a === u.user!.id ? g.player_b : g.player_a))));
        const [{ data: sosRows }, { data: pubs }] = await Promise.all([
          sosIds.length ? (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds) : Promise.resolve({ data: [] }),
          (supabase as any).rpc("players_directory", { _ids: otherIds }),
        ]);
        const directCourtIds = hist.map((g) => g.court_id).filter(Boolean) as string[];
        const courtIds = Array.from(new Set([
          ...((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean),
          ...directCourtIds,
        ]));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name").in("id", courtIds)
          : { data: [] as any[] };
        const sosToCourt = new Map<string, string>(((sosRows as any[]) ?? []).map((s) => [s.id, s.court_id]));
        const courtName = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
        const nameById = new Map<string, string>(((pubs as any[]) ?? []).map((p) => [p.id, p.name]));
        const m: Record<string, { court: string; otherName: string }> = {};
        for (const g of hist) {
          const otherId = g.player_a === u.user!.id ? g.player_b : g.player_a;
          const cid = g.court_id ?? (g.sos_id ? sosToCourt.get(g.sos_id) : undefined);
          m[g.id] = { court: (cid && courtName.get(cid)) || "", otherName: nameById.get(otherId) ?? "Player" };
        }
        setMeta(m);
      }
    })();
  }, []);

  if (rows.length === 0) return null;
  const wins = rows.filter((g) => g.winner && g.winner === meId).length;
  const losses = rows.filter((g) => g.winner && g.winner !== meId).length;
  return (
    <div className="ccard p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="csection-label">{t("hist.title")}</div>
        {wins + losses > 0 && <div className="text-sm font-extrabold">🏆 {wins}–{losses}</div>}
      </div>
      {rows.map((g) => {
        const mm = meta[g.id];
        const confirmed = g.confirmed_a && g.confirmed_b;
        return (
          <div key={g.id} className="border-t border-[var(--ink)]/15 pt-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-extrabold truncate">{t("hist.vs", { name: mm?.otherName ?? "Player" })}</div>
              <div className="text-sm text-[var(--ink)] truncate">{whenLabel(g.played_at)}{mm?.court ? ` · 📍 ${mm.court}` : ""}{g.score ? ` · 🎾 ${g.score}` : ""}</div>
            </div>
            {g.winner ? (
              <span
                className="text-xs font-extrabold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: g.winner === meId ? "var(--green-pop)" : "var(--cream2)", border: "1.5px solid var(--ink)" }}
              >
                {g.winner === meId ? t("hist.won") : t("hist.lost")}
              </span>
            ) : confirmed ? (
              <span className="text-sm shrink-0" title={t("hist.confirmed")}>✓</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
