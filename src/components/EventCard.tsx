import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "@/lib/toast";
import { whenLabel, whatsappLink, durationLabel, sportMeta } from "@/lib/courtship";
import { shortCourtName } from "@/lib/courts";
import {
  joinEvent,
  leaveEvent,
  deleteEvent,
  fetchEventContacts,
  markAttendeePaid,
  fetchEventSwish,
  type EventRow,
  type AttendeeContact,
} from "@/lib/events";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { shareTo } from "@/lib/share";
import { googleCalendarUrl } from "@/lib/calendar";

export function EventCard({ e, meId, myStatus, onChange }: { e: EventRow; meId: string | null; myStatus?: string; onChange: () => void }) {
  const { t } = useI18n();
  const isHost = !!meId && e.host_id === meId;
  const isPaid = (e.price_sek ?? 0) > 0;
  const left = e.capacity != null ? Math.max(0, e.capacity - e.spots_taken) : null;
  const full = left === 0;
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [attendees, setAttendees] = useState<AttendeeContact[] | null>(null);

  useEffect(() => {
    if (isHost) fetchEventContacts(e.id).then(setAttendees).catch(() => {});
  }, [isHost, e.id, e.spots_taken]);

  async function join() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { window.location.href = "/auth?mode=signup&next=%2Fboard"; return; }
    setBusy(true);
    const r = await joinEvent(e.id);
    setBusy(false);
    if (!r.ok) {
      const m =
        r.reason === "full" ? t("ev.full_label")
        : r.reason === "already_in" ? t("ev.already_in")
        : r.reason === "past" ? t("ev.past")
        : r.reason;
      toast.error(m);
      return;
    }
    toast.success(isPaid ? t("ev.booked_pay") : t("ev.joined"));
    onChange();
  }

  async function leave() {
    setBusy(true);
    try { await leaveEvent(e.id); toast.success(t("ev.left")); onChange(); }
    catch (er: any) { toast.error(er?.message ?? "Error"); }
    finally { setBusy(false); }
  }

  async function markPaid(aid: string) {
    try {
      await markAttendeePaid(aid);
      setAttendees((p) => (p ? p.map((a) => (a.id === aid ? { ...a, status: "paid" } : a)) : p));
      toast.success(t("ev.marked_paid"));
    } catch (er: any) { toast.error(er?.message ?? "Error"); }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await deleteEvent(e.id);
      toast.success(t("ev.deleted"));
      onChange();
    } catch (er: any) {
      toast.error(er?.message ?? "Error");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="ccard p-4" style={{ borderColor: "var(--coral)" }}>
      <div className="font-display text-2xl leading-tight">{e.title}</div>
      {(e as any).sport && (e as any).sport !== "tennis" && (
        <span className="inline-block font-extrabold text-xs px-2 py-0.5 rounded-full mt-1" style={{ background: "var(--green-pop)", border: "1.5px solid var(--ink)" }}>
          {sportMeta((e as any).sport).emoji} {t(sportMeta((e as any).sport).key)}
        </span>
      )}
      <div className="font-extrabold mt-1">{whenLabel(e.starts_at)} · 📍 {e.city ? e.city + " · " : ""}{shortCourtName(e.location)}</div>
      <div className="text-base text-[var(--ink)] mt-1">
        🎟 {isPaid ? t("ev.price_kr", { n: e.price_sek as number }) : t("ev.free")}
        {e.capacity != null ? ` · ${full ? t("ev.full_label") : t("ev.spots_left_n", { n: left as number })}` : ""}
      </div>
      {(() => {
        const parts: string[] = [];
        if (e.level_min != null && e.level_max != null && !(e.level_min === 1 && e.level_max === 5)) parts.push(`L${e.level_min}–${e.level_max}`);
        if (e.duration_min) parts.push(durationLabel(e.duration_min));
        return parts.length ? <div className="text-base text-[var(--ink)] mt-1">{parts.join(" · ")}</div> : null;
      })()}
      {e.format && <div className="text-base text-[var(--ink)] mt-1">{e.format}</div>}
      {e.description && (
        <div className="mt-1">
          <div
            className="text-base italic text-[var(--ink)]"
            style={expanded ? undefined : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            "{e.description}"
          </div>
          {e.description.length > 90 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-extrabold underline mt-0.5" style={{ color: "var(--wood, #8a6d3b)" }}>
              {expanded ? t("common.less") : t("common.more")}
            </button>
          )}
        </div>
      )}
      <a
        href={googleCalendarUrl({ title: `\u{1F3BE} ${e.title}`, startISO: e.starts_at, durationMin: 120, location: [e.city, shortCourtName(e.location)].filter(Boolean).join(", "), details: e.description || undefined })}
        target="_blank" rel="noopener noreferrer"
        className="text-sm font-extrabold underline mt-2 inline-block"
      >{t("cal.add")}</a>

      {isHost ? (
        <div className="mt-3 space-y-2">
          <div className="font-extrabold" style={{ color: "var(--coral)" }}>{t("ev.youre_hosting")}</div>
          <div className="csection-label">{t("ev.attendees")} · {e.spots_taken}</div>
          {attendees && attendees.length > 0 ? (
            attendees.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 border-t border-[var(--ink)]/15 pt-2">
                <div className="min-w-0">
                  <div className="font-extrabold truncate">{a.name}</div>
                  {a.phone && (
                    <a href={whatsappLink(a.phone, a.name)} target="_blank" rel="noopener noreferrer" className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>
                      💬 {t("ev.message")}
                    </a>
                  )}
                </div>
                {a.status === "paid" ? (
                  <span className="text-sm font-extrabold shrink-0">✓ {t("ev.paid")}</span>
                ) : a.status === "booked" ? (
                  <button className="cbtn cbtn-green text-sm shrink-0" onClick={() => markPaid(a.id)}>{t("ev.mark_paid")}</button>
                ) : (
                  <span className="text-sm text-[var(--ink)] shrink-0">{t("ev.interested")}</span>
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-[var(--ink)]">{t("ev.no_attendees")}</div>
          )}
          <div className="border-t border-[var(--ink)]/15 pt-3">
            {confirming ? (
              <div className="space-y-2">
                <div className="text-sm font-extrabold text-[var(--ink)]">{t("ev.delete_confirm")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="cbtn cbtn-ghost text-sm" disabled={busy} onClick={() => setConfirming(false)}>{t("ev.delete_keep")}</button>
                  <button className="cbtn text-sm" style={{ background: "var(--coral)", color: "#FFF6E8", border: "2px solid var(--ink)" }} disabled={busy} onClick={doDelete}>{t("ev.delete_yes")}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Link to="/events/new" search={{ id: e.id }} className="text-sm font-extrabold underline">✏️ {t("ev.edit")}</Link>
                <button className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }} onClick={() => setConfirming(true)}>{t("ev.delete")}</button>
              </div>
            )}
          </div>
        </div>
      ) : myStatus ? (
        <div className="mt-3 space-y-2">
          {myStatus === "booked" ? <SwishBox e={e} /> : <div className="font-extrabold">✓ {t("ev.youre_in")}</div>}
          <button className="cbtn cbtn-ghost w-full" disabled={busy} onClick={leave}>{t("ev.leave")}</button>
        </div>
      ) : (
        <div className="mt-3">
          <button className="cbtn cbtn-coral w-full" disabled={busy || full} onClick={join}>
            {full ? t("ev.full_label") : isPaid ? t("ev.book_spot", { n: e.price_sek as number }) : t("ev.express_interest")}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => void shareTo("/events", t("share.event_fwd", { title: e.title }), t("invite.copied"))}
        className="mt-3 text-sm font-extrabold underline"
        style={{ color: "var(--wood, #8a6d3b)" }}
      >↗ {t("share.spread")}</button>
    </div>
  );
}

function SwishBox({ e }: { e: EventRow }) {
  const { t } = useI18n();
  const [number, setNumber] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    fetchEventSwish(e.id).then((v) => { if (!cancelled) setNumber(v ?? ""); });
    return () => { cancelled = true; };
  }, [e.id]);
  function copy(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => toast.success(t("ev.copied"))).catch(() => {});
  }
  return (
    <div className="ccard p-3 space-y-1" style={{ background: "var(--cream2)" }}>
      <div className="font-extrabold">{t("ev.pay_title")}</div>
      <div className="text-sm text-[var(--ink)]">💰 {t("ev.price_kr", { n: e.price_sek ?? 0 })}</div>
      {number ? (
        <button type="button" className="font-extrabold text-lg tracking-wide text-left" onClick={() => copy(number)}>
          📱 {number} <span className="text-sm">📋</span>
        </button>
      ) : (
        <div className="text-sm text-[var(--ink)]">{t("ev.no_swish")}</div>
      )}
      <div className="text-sm text-[var(--ink)]">✏️ {t("ev.pay_msg", { msg: e.title })}</div>
      <div className="text-xs text-[var(--ink)] opacity-80">{t("ev.pay_confirm_note")}</div>
    </div>
  );
}
