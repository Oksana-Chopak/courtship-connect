import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logGame } from "@/lib/games";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm for datetime-local
}

type P = { id: string; name: string };

export function LogGameCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<P[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");
  const [when, setWhen] = useState(localNow());
  const [score, setScore] = useState("");
  const [winner, setWinner] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || players.length) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u.user?.id ?? null);
      const { data } = await (supabase as any).rpc("players_directory");
      setPlayers(((data as any[]) ?? []).map((p) => ({ id: p.id, name: p.name ?? "Player" })));
    })();
  }, [open, players.length]);

  const filtered = players
    .filter((p) => p.id !== meId)
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  async function submit() {
    if (!otherId) {
      toast.error(t("log.pick_player"));
      return;
    }
    setBusy(true);
    try {
      await logGame(otherId, new Date(when).toISOString(), score, winner || null);
      toast.success(t("log.done", { name: otherName }));
      setOpen(false);
      setOtherId(null);
      setOtherName("");
      setSearch("");
      setScore("");
      setWinner("");
      setWhen(localNow());
    } catch (e: any) {
      oops(e);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => setOpen(true)}>
        ➕ {t("log.cta")}
      </button>
    );
  }

  return (
    <div className="ccard p-4 space-y-3">
      <div className="csection-label">{t("log.title")}</div>

      {otherId ? (
        <div className="flex items-center justify-between gap-2">
          <div className="font-extrabold">🎾 {otherName}</div>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              setOtherId(null);
              setOtherName("");
            }}
          >
            {t("log.change")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className="cinput" placeholder={t("log.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex flex-col gap-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="text-left px-3 py-2 rounded-lg font-extrabold"
                style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
                onClick={() => {
                  setOtherId(p.id);
                  setOtherName(p.name);
                }}
              >
                {p.name}
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-[var(--ink)]/60">{t("log.no_players")}</div>}
          </div>
        </div>
      )}

      <div>
        <div className="csection-label">{t("log.when")}</div>
        <input type="datetime-local" className="cinput" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>

      <div>
        <div className="csection-label">{t("log.score")}</div>
        <input className="cinput" placeholder="6–4 6–3" value={score} onChange={(e) => setScore(e.target.value)} />
      </div>

      {otherId && (
        <div>
          <div className="csection-label">{t("won.title")}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWinner((w) => (meId && w === meId ? "" : meId ?? ""))}
              className="flex-1 rounded-full font-extrabold text-sm py-2"
              style={{ border: "2px solid var(--ink)", background: meId && winner === meId ? "var(--green-pop)" : "var(--cream2)" }}
            >
              {t("won.me")}
            </button>
            <button
              type="button"
              onClick={() => setWinner((w) => (w === otherId ? "" : otherId))}
              className="flex-1 rounded-full font-extrabold text-sm py-2"
              style={{ border: "2px solid var(--ink)", background: winner === otherId ? "var(--green-pop)" : "var(--cream2)" }}
            >
              {t("won.other", { name: otherName })}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="cbtn cbtn-coral flex-1" disabled={busy} onClick={submit}>
          {busy ? "…" : t("log.submit")}
        </button>
        <button type="button" className="cbtn cbtn-ghost" onClick={() => setOpen(false)}>
          {t("log.cancel")}
        </button>
      </div>

      <p className="text-xs text-[var(--ink)]/60">{t("log.hint")}</p>
    </div>
  );
}
