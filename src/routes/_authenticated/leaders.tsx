import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/lib/i18n";
import { oops } from "@/lib/oops";

export const Route = createFileRoute("/_authenticated/leaders")({
  head: () => ({ meta: [{ title: "Leaderboards — Courtship" }] }),
  component: LeadersPage,
});

type Row = { user_id: string; name: string; n: number };

async function safeRpc(fn: string): Promise<Row[]> {
  try {
    const { data, error } = await (supabase as any).rpc(fn);
    if (error) return [];
    return ((data as any[]) ?? []).map((r) => ({ user_id: r.user_id, name: r.name, n: r.n ?? r.rescues ?? 0 }));
  } catch {
    return [];
  }
}

function LeadersPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<Row[]>([]);
  const [rescuers, setRescuers] = useState<Row[]>([]);
  const [hosts, setHosts] = useState<Row[]>([]);
  const [photo, setPhoto] = useState<Record<string, string | null>>({});
  const [kudos, setKudos] = useState<Record<string, { n: number; mine: boolean }>>({});
  const [meId, setMeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u.user?.id ?? null);
      const [a, r, h] = await Promise.all([
        safeRpc("top_active_month"),
        safeRpc("top_rescuers_month"),
        safeRpc("top_hosts_month"),
      ]);
      setActive(a);
      setRescuers(r);
      setHosts(h);
      const ids = Array.from(new Set([...a, ...r, ...h].map((x) => x.user_id)));
      if (ids.length) {
        try {
          const { data: pubs } = await (supabase as any).rpc("players_directory", { _ids: ids });
          const m: Record<string, string | null> = {};
          ((pubs as any[]) ?? []).forEach((p) => { m[p.id] = p.photo_url ?? null; });
          setPhoto(m);
        } catch { /* ignore */ }
        try {
          const { data: kd } = await (supabase as any).rpc("kudos_for", { _ids: ids });
          const km: Record<string, { n: number; mine: boolean }> = {};
          ((kd as any[]) ?? []).forEach((k) => { km[k.to_id] = { n: k.n ?? 0, mine: !!k.mine }; });
          setKudos(km);
        } catch { /* kudos RPC not deployed yet */ }
      }
      setLoaded(true);
    })();
  }, []);

  async function giveKudos(id: string) {
    if (id === meId) return;
    const already = kudos[id]?.mine;
    if (already) return;
    setKudos((p) => ({ ...p, [id]: { n: (p[id]?.n ?? 0) + 1, mine: true } })); // optimistic
    try {
      const { data, error } = await (supabase as any).rpc("give_kudos", { _to: id });
      if (error) throw error;
      if (typeof data === "number") setKudos((p) => ({ ...p, [id]: { n: data, mine: true } }));
    } catch (e: any) {
      setKudos((p) => ({ ...p, [id]: { n: Math.max(0, (p[id]?.n ?? 1) - 1), mine: false } })); // revert
      oops(e);
    }
  }

  const boards = [
    { key: "active", title: t("lb.active"), emoji: "👑", unit: "🎾", rows: active, hot: true },
    { key: "rescuer", title: t("lb.rescuer"), emoji: "🚑", unit: "🚑", rows: rescuers, hot: false },
    { key: "host", title: t("lb.host"), emoji: "🎪", unit: "🎪", rows: hosts, hot: false },
  ];
  const anyRows = active.length > 0 || rescuers.length > 0 || hosts.length > 0;

  return (
    <div className="space-y-5">
      <Link to="/players" className="font-extrabold text-sm underline">← {t("players.title")}</Link>
      <div>
        <h1 className="font-display text-4xl leading-none">{t("lb.title")}</h1>
        <p className="font-semibold mt-1" style={{ color: "var(--ink)", opacity: 0.7 }}>{t("lb.sub")}</p>
      </div>

      {!loaded ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("common.loading")}</div>
      ) : !anyRows ? (
        <div className="ccard p-6 text-center space-y-2">
          <div className="text-4xl">🌱</div>
          <div className="font-display text-2xl leading-tight">{t("lb.empty")}</div>
        </div>
      ) : (
        boards.map((b) =>
          b.rows.length === 0 ? null : (
            <div key={b.key} className="ccard p-4 space-y-2" style={b.hot ? { borderColor: "var(--coral)" } : undefined}>
              <div className="csection-label">{b.emoji} {b.title}</div>
              {b.rows.slice(0, 5).map((r, i) => {
                const k = kudos[r.user_id];
                const isMe = r.user_id === meId;
                return (
                  <div key={r.user_id} className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0">
                    <span className="text-lg w-7 text-center shrink-0">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                    <Link to="/players/$id" params={{ id: r.user_id }} className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar src={photo[r.user_id] ?? null} name={r.name} seed={r.user_id} size={36} />
                      <span className="font-extrabold truncate">{r.name}{isMe ? ` · ${t("lb.you")}` : ""}</span>
                    </Link>
                    <span className="font-extrabold shrink-0 text-sm">{b.unit} {r.n}</span>
                    {isMe ? (
                      (k?.n ?? 0) > 0 ? <span className="shrink-0 text-xs font-extrabold px-1">👏 {k?.n}</span> : null
                    ) : (
                      <button
                        type="button"
                        onClick={() => giveKudos(r.user_id)}
                        disabled={!!k?.mine}
                        className="shrink-0 rounded-full font-extrabold text-xs px-2 py-1"
                        style={{ border: "2px solid var(--ink)", background: k?.mine ? "var(--green-pop)" : "var(--cream2)" }}
                        title={t("lb.kudos")}
                      >
                        👏 {k?.n ?? 0}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ),
        )
      )}
    </div>
  );
}
