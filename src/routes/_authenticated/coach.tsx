import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PLAY_TIMES, sportMeta } from "@/lib/courtship";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({ meta: [{ title: "Find a coach — Courtship" }] }),
  component: CoachPage,
});

type Req = { id: string; status: string; sport: string; goal: string; created_at: string };

function CoachPage() {
  const { t } = useI18n();
  const [mySports, setMySports] = useState<string[]>(["tennis"]);
  const [sport, setSport] = useState<string>("tennis");
  const [goal, setGoal] = useState("");
  const [avail, setAvail] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Req | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await (supabase as any).from("profiles").select("sports").eq("id", u.user.id).maybeSingle();
        const sp = ((p?.sports as string[] | null) ?? ["tennis"]);
        if (sp.length) { setMySports(sp); if (!sp.includes("tennis")) setSport(sp[0]); }
      }
      const { data } = await (supabase as any).rpc("my_open_coach_request");
      const row = Array.isArray(data) ? data[0] : data;
      setOpen((row as Req) ?? null);
    } catch { /* pre-SQL */ }
    setLoaded(true);
  }
  useEffect(() => { void load(); }, []);

  async function submit() {
    if (goal.trim().length < 5) { toast.error(t("coach.err_goal")); return; }
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("request_coach", {
      _sport: sport, _goal: goal.trim(), _availability: avail, _note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message ?? "") ? t("coach.not_ready") : error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) {
      toast.error(row?.reason === "already_open" ? t("coach.err_open") : row?.reason ?? "error");
      if (row?.reason === "already_open") void load();
      return;
    }
    toast.success(t("coach.sent"));
    void load();
  }

  if (!loaded) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;

  if (open) {
    const st = open.status;
    return (
      <div className="space-y-4">
        <Link to="/board" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
        <div className="ccard p-5 text-center space-y-2" style={{ background: st === "matched" ? "var(--green-pop)" : "var(--cream2)" }}>
          <div className="text-4xl">🎓</div>
          <div className="font-display text-2xl leading-tight">
            {st === "matched" ? t("coach.matched_title") : t("coach.open_title")}
          </div>
          <div className="text-sm font-semibold text-[var(--ink)]/75">
            {st === "matched" ? t("coach.matched_sub") : t("coach.open_sub")}
          </div>
          <div className="text-xs font-bold" style={{ color: "var(--wood, #8a6d3b)" }}>
            {sportMeta(open.sport).emoji} {t(sportMeta(open.sport).key)} · "{open.goal.slice(0, 80)}"
          </div>
          {st !== "matched" && (
            <button
              className="cbtn cbtn-ghost w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await (supabase as any).rpc("cancel_coach_request", { _id: open.id }); } catch { /* ignore */ }
                setBusy(false);
                toast.success(t("coach.cancelled"));
                setOpen(null);
              }}
            >
              {t("coach.cancel")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/board" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <div>
        <h1 className="font-display text-3xl leading-none">🎓 {t("coach.title")}</h1>
        <p className="text-[var(--ink)] font-semibold mt-1">{t("coach.sub")}</p>
      </div>

      {mySports.length > 1 && (
        <div>
          <div className="csection-label mb-1">{t("sport.label")}</div>
          <div className="flex gap-1.5">
            {mySports.map((sp) => (
              <button key={sp} type="button" className={`cchip ${sport === sp ? "cchip-on" : ""}`} onClick={() => setSport(sp)}>
                {sportMeta(sp).emoji} {t(sportMeta(sp).key)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="csection-label mb-1">{t("coach.goal_label")}</div>
        <textarea className="cinput w-full" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)}
          placeholder={t("coach.goal_ph")} />
      </div>

      <div>
        <div className="csection-label mb-1">{t("coach.avail_label")}</div>
        <div className="flex flex-wrap gap-1.5">
          {PLAY_TIMES.map((pt) => {
            const on = avail.includes(pt);
            return (
              <button key={pt} type="button" className={`cchip ${on ? "cchip-on" : ""}`}
                onClick={() => setAvail(on ? avail.filter((x) => x !== pt) : [...avail, pt])}>
                {pt}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="csection-label mb-1">{t("coach.note_label")}</div>
        <input className="cinput w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("coach.note_ph")} />
      </div>

      <button className="cbtn cbtn-coral w-full" disabled={busy} onClick={submit}>
        🎓 {t("coach.cta")}
      </button>
      <p className="text-xs font-semibold text-center text-[var(--ink)]/55">{t("coach.how")}</p>
    </div>
  );
}
