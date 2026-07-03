import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logGame } from "@/lib/games";
import { CourtCombobox } from "@/components/CourtCombobox";
import { DateChipPicker } from "@/components/DateChipPicker";
import { SlotPicker } from "@/components/SlotPicker";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";

function today(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
/** "We just finished" default: the previous half-hour mark. */
function prevHalfHour(): string {
  const n = new Date();
  const m = n.getMinutes() >= 30 ? 30 : 0;
  return `${String(n.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type P = { id: string; name: string };

export function LogGameCard({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [players, setPlayers] = useState<P[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");
  const [date, setDate] = useState<Date>(() => today());
  const [time, setTime] = useState<string>(() => prevHalfHour());
  const [city, setCity] = useState("Uppsala");
  const [courtId, setCourtId] = useState("");
  const [score, setScore] = useState("");
  const [winner, setWinner] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || players.length) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u.user?.id ?? null);
      if (u.user) {
        const { data: p } = await (supabase as any).from("profiles").select("home_city").eq("id", u.user.id).maybeSingle();
        if (p?.home_city) setCity(p.home_city);
      }
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
      const [hh, mm] = (time || prevHalfHour()).split(":").map(Number);
      const playedAt = new Date(date);
      playedAt.setHours(hh, mm, 0, 0);
      const res = await logGame(otherId, playedAt.toISOString(), score, winner || null, courtId || null);
      toast.success(t("log.done", { name: otherName }));
      if (courtId && !res.courtSaved) toast.message(t("log.court_later"));
      setOpen(false);
      setOtherId(null);
      setOtherName("");
      setSearch("");
      setScore("");
      setWinner("");
      setCourtId("");
      setDate(today());
      setTime(prevHalfHour());
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
        <div className="csection-label">{t("log.court")}</div>
        <CourtCombobox city={city} valueId={courtId} onChange={(id) => setCourtId(id)} />
      </div>

      <div className="space-y-2">
        <div className="csection-label">{t("log.when")}</div>
        <DateChipPicker value={date} onChange={setDate} maxDays={0} pastDays={30} />
        <SlotPicker city={city} date={date} value={time} onChange={setTime} allowPast ariaLabel={t("log.when")} />
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
