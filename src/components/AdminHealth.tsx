import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { runLiveChecks, type Check } from "@/lib/health";

/** Admin → "🩺 Health": what broke, what works — at a glance, the moment the
 *  page opens (2026-10-06). Live probes from this browser (the API, every edge
 *  function the way the app calls it, push here) + server facts for the last
 *  24h (admin_health) + every error a player met (admin_client_errors).
 *  Rows are ✅/❌ with a plain-words reason; the headline counts the ❌. */

type ErrRow = { kind: string; message: string; where_: string; n: number; users: number; last_at: string; sample: string | null };
type Facts = Record<string, any>;

function ago(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return lang === "sv" ? `${m} min sedan` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return lang === "sv" ? `${h} h sedan` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" });
}

export function AdminHealth() {
  const { t, lang } = useI18n();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [errors, setErrors] = useState<ErrRow[] | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const [live, h, e] = await Promise.all([
        runLiveChecks(),
        (supabase as any).rpc("admin_health"),
        (supabase as any).rpc("admin_client_errors", { _hours: 24 }),
      ]);
      setChecks(live);
      if (h.error || e.error) {
        setSqlMissing(/does not exist|schema cache/i.test(String(h.error?.message ?? e.error?.message ?? "")));
        setFacts(h.error ? null : (h.data as Facts));
        setErrors(e.error ? null : ((e.data as ErrRow[]) ?? []));
      } else {
        setSqlMissing(false);
        setFacts(h.data as Facts);
        setErrors((e.data as ErrRow[]) ?? []);
      }
    } finally { setRunning(false); }
  }
  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // server-side rows derived from the facts
  const serverRows: Check[] = [];
  if (facts && !facts.error) {
    const net = facts.net ?? {};
    const netFailed = Number(net.failed ?? 0), netTotal = Number(net.total ?? 0);
    const byStatus = net.by_status ? Object.entries(net.by_status as Record<string, number>).filter(([k]) => !/^2/.test(k)).map(([k, v]) => `${k} × ${v}`).join(", ") : "";
    serverRows.push(net.unavailable
      ? { id: "webhooks", ok: true, detail: t("health.webhooks_unavailable") }
      : { id: "webhooks", ok: netFailed === 0, detail: netFailed === 0 ? t("health.webhooks_ok", { n: netTotal }) : t("health.webhooks_bad", { n: netFailed, total: netTotal, what: byStatus }) });
    const em = facts.emails_24h ?? { sent: 0, failed: 0 };
    serverRows.push({ id: "traffic", ok: Number(em.failed ?? 0) === 0, detail: t("health.traffic", { push: facts.pushes_24h ?? 0, sent: em.sent ?? 0, failed: em.failed ?? 0, subs: facts.push_users ?? 0 }) });
    const cronOk = Array.isArray(facts.cron) && facts.cron.some((c: any) => c?.name === "courtship-lifecycle-emails" && c?.active !== false);
    serverRows.push({ id: "lifecycle", ok: cronOk, detail: `${cronOk ? t("health.cron_ok") : t("health.cron_missing")} · ${facts.lifecycle_enabled ? t("admin.lc_on") : t("admin.lc_off")} · ${t("health.last_sent")} ${ago(facts.lifecycle_last_sent, lang)}` });
    const ce = Number(facts.client_errors_24h ?? 0);
    serverRows.push({ id: "player_errors", ok: ce === 0, detail: ce === 0 ? t("health.errors_none") : t("health.errors_n", { n: ce }) });
  }
  const all = [...(checks ?? []), ...serverRows];
  const bad = all.filter((c) => !c.ok).length;
  const label = (id: string) => {
    const k = `health.row_${id.replace(/-/g, "_")}`;
    const s = t(k);
    return s === k ? id : s;
  };

  return (
    <div className="ccard p-4 space-y-3" data-testid="admin-health">
      <div className="flex items-center justify-between gap-2">
        <div className="csection-label">🩺 {t("health.title")}</div>
        <button type="button" className="cchip" disabled={running} onClick={() => void run()}>{running ? "…" : `↻ ${t("health.rerun")}`}</button>
      </div>
      {checks === null ? (
        <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("health.checking")}</div>
      ) : (
        <div className="font-display text-xl" style={{ color: bad ? "var(--coral)" : "var(--ink)" }}>
          {bad === 0 ? `✅ ${t("health.all_good", { n: all.length })}` : t("health.attention", { n: bad })}
        </div>
      )}
      {sqlMissing && <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("health.sql_missing")}</div>}
      {all.length > 0 && (
        <div className="space-y-1.5">
          {all.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <span className="shrink-0" aria-label={c.ok ? "ok" : "problem"}>{c.ok ? "✅" : "❌"}</span>
              <div className="min-w-0">
                <span className="font-extrabold">{label(c.id)}</span>
                <span className="font-semibold" style={{ opacity: 0.75 }}> — {c.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(facts?.net?.samples) && facts!.net.samples.length > 0 && (
        <div className="text-xs font-semibold space-y-0.5" style={{ opacity: 0.75 }}>
          {(facts!.net.samples as any[]).slice(0, 5).map((s: any, i: number) => (
            <div key={i} className="break-all">⚠️ {s.status ?? s.error ?? "?"} · {ago(s.at, lang)} · {String(s.body ?? "").slice(0, 120)}</div>
          ))}
        </div>
      )}
      {errors && errors.length > 0 && (
        <div>
          <button type="button" className="underline text-sm font-extrabold" onClick={() => setShowErrors(!showErrors)}>
            {showErrors ? t("health.hide_errors") : t("health.show_errors", { n: errors.length })}
          </button>
          {showErrors && (
            <div className="mt-2 space-y-2">
              {errors.slice(0, 20).map((e, i) => (
                <div key={i} className="rounded-xl p-2.5 text-xs" style={{ background: "var(--cream2)", border: "1px solid rgba(43,33,24,0.2)" }}>
                  <div className="font-extrabold break-words">{e.message}</div>
                  <div className="font-semibold mt-0.5" style={{ opacity: 0.75 }}>{e.kind} · {e.where_} · ×{e.n} · {e.users} {t("health.players")} · {ago(e.last_at, lang)}</div>
                  {e.sample && <div className="mt-1 whitespace-pre-wrap break-all" style={{ opacity: 0.6 }}>{e.sample.slice(0, 300)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
