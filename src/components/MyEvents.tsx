import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { courtClock } from "@/lib/courtship";
import { fetchEventContacts, type AttendeeContact, type EventRow } from "@/lib/events";

/** The organizer's overview (2026-10-17: "three people signed up and I can't
 *  tell who goes to which session"). Weekly sessions share a title, so each
 *  row leads with the session's own date + time, then who's coming and who
 *  still owes the Swish. Tap a session → its card on the board, ringed.
 *  Renders nothing for players who host no upcoming event. */
export function MyEvents({ uid }: { uid: string }) {
  const { t, lang } = useI18n();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const [rows, setRows] = useState<Array<{ e: EventRow; people: AttendeeContact[]; cancelled: Array<{ name: string; at: string }> }> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await (supabase as any)
        .from("event_requests")
        .select("*")
        .eq("host_id", uid)
        .in("status", ["approved", "pending"])
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      const evs = ((data as EventRow[] | null) ?? []);
      const withPeople = await Promise.all(evs.map(async (e) => ({ e, people: await fetchEventContacts(e.id).catch(() => [] as AttendeeContact[]) })));
      // Who signed up and later cancelled (event_attendance_log, 2026-10-17:
      // "three emails, nobody on the list") — so a "joined" email never points
      // at an empty list without an explanation. Pre-SQL the table is missing:
      // the error is ignored and the section simply has no cancellations.
      const cancelledBy = new Map<string, Array<{ name: string; at: string }>>();
      if (evs.length) {
        const { data: log } = await (supabase as any)
          .from("event_attendance_log")
          .select("event_id,user_id,action,at")
          .in("event_id", evs.map((e) => e.id))
          .order("at", { ascending: true });
        const last = new Map<string, { event_id: string; user_id: string; action: string; at: string }>();
        for (const r of ((log as any[]) ?? [])) last.set(`${r.event_id}:${r.user_id}`, r);
        const gone = [...last.values()].filter((r) => r.action === "left");
        if (gone.length) {
          const { data: dir } = await (supabase as any).rpc("players_directory", { _ids: [...new Set(gone.map((r) => r.user_id))] });
          const nameById = new Map<string, string>(((dir as any[]) ?? []).map((d) => [d.id, d.name]));
          for (const r of gone) {
            const list = cancelledBy.get(r.event_id) ?? [];
            list.push({ name: nameById.get(r.user_id) ?? t("myev.someone"), at: r.at });
            cancelledBy.set(r.event_id, list);
          }
        }
      }
      if (alive) setRows(withPeople.map((x) => ({ ...x, cancelled: cancelledBy.get(x.e.id) ?? [] })));
    })();
    return () => { alive = false; };
  }, [uid, t]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="ccard p-4 space-y-3">
      <div className="font-display text-xl">🎪 {t("myev.title")}</div>
      {rows.map(({ e, people, cancelled }) => {
        const c = courtClock(e.starts_at, e.city, locale);
        const day = c.rel === "today" ? t("rail.today") : c.rel === "tmrw" ? t("rail.tmrw") : c.weekday;
        const paid = (e.price_sek ?? 0) > 0;
        const due = people.filter((p) => p.status === "booked").length;
        return (
          <Link key={e.id} to="/board" search={{ focus_event: e.id } as any} className="block border-t border-[var(--ink)]/15 pt-3 first:border-t-0 first:pt-0" style={{ color: "var(--ink)", textDecoration: "none" }}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-extrabold" style={{ fontSize: 16 }}>{day} {c.dateStr} · {c.time}</div>
              <div className="text-sm font-extrabold shrink-0">{t("ev.whos_coming", { n: people.length })}{e.capacity != null ? ` / ${e.capacity}` : ""}</div>
            </div>
            <div className="text-sm font-semibold truncate" style={{ opacity: 0.7 }}>
              {e.title}{e.city ? ` · ${e.city}` : ""}{e.status === "pending" ? ` · ${t("myev.pending")}` : ""}
            </div>
            {people.length === 0 ? (
              <div className="text-sm font-semibold mt-1" style={{ opacity: 0.6 }}>{t("ev.nobody_yet")}</div>
            ) : (
              <div className="mt-1 space-y-0.5">
                {people.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-extrabold truncate">{p.name}</span>
                    <span className="shrink-0 font-bold" style={{ color: p.status === "booked" ? "#8C5A33" : "var(--ink)", opacity: p.status === "booked" ? 1 : 0.7 }}>
                      {p.status === "paid" ? `✓ ${t("ev.paid")}` : p.status === "booked" ? t("ev.not_paid_yet") : t("ev.interested")}
                    </span>
                  </div>
                ))}
                {paid && due > 0 && <div className="text-xs font-bold mt-1" style={{ opacity: 0.6 }}>{t("myev.mark_hint")}</div>}
              </div>
            )}
            {cancelled.length > 0 && (
              <div className="text-xs font-semibold mt-1" style={{ opacity: 0.6 }}>
                {cancelled.map((c) => t("myev.cancelled", { name: c.name, when: new Date(c.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) })).join(" · ")}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
