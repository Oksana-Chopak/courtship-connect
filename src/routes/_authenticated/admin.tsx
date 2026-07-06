import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { AnnouncementAdmin } from "@/components/AnnouncementBanner";
import { Collapsible } from "@/components/Collapsible";
import { adminListCustomCourts, adminSetCourtHidden, adminUpdateCourt, shortCourtName, type AdminCourt } from "@/lib/courts";
import { fetchPendingEvents, setEventStatus, fetchEventContact, type EventRow } from "@/lib/events";
import { whenLabel, levelMeta, vibeEmoji, VIBES } from "@/lib/courtship";

function EventContactLine({ eventId }: { eventId: string }) {
  const [contact, setContact] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchEventContact(eventId).then((v) => { if (!cancelled) setContact(v); });
    return () => { cancelled = true; };
  }, [eventId]);
  if (!contact) return null;
  return <div className="text-sm text-[var(--ink)]">✉️ {contact}</div>;
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Courtship" }] }),
  component: AdminPage,
});

type Invite = { code: string; uses_remaining: number; active: boolean; created_at: string; signups?: number };
type PlayerRow = {
  id: string; name: string; last_name: string | null; phone_e164: string | null;
  level: number | null; formats: string[] | null; play_times: string[] | null;
  vibe: string | null; looking_for: string | null; home_courts: string | null;
  home_city: string | null; home_cities: string[] | null;
  buddy_optin: string | null; buddy_radius_km: number | null; buddy_sos_optin: boolean | null;
  bio: string | null; fav_shot: string | null; games_played: number | null;
  rescues_count: number; ghost_badge: boolean | null; is_admin: boolean | null;
  signup_code: string | null; created_at: string;
};
type CityStats = {
  sos_created_week: number;
  sos_claimed_week: number;
  open_posted_week: number;
  open_filled_pct: number;
  fill_rate_pct: number;
  median_ttc_min: number;
  all_time_games_confirmed: number;
};
type Dashboard = {
  profiles_total: number;
  profiles_new_week: number;
  rescuer_optin_pct: number;
  buddy_pairs: number;
  ghost_count: number;
  fill_rate_pct: number;
  by_city: Record<string, CityStats>;
};

function AdminPage() {
  const { t, lang } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [codes, setCodes] = useState<Invite[]>([]);
  const [adminCourts, setAdminCourts] = useState<AdminCourt[]>([]);
  const [editingCourt, setEditingCourt] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newUses, setNewUses] = useState("10");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [pendingEvents, setPendingEvents] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [supportSwish, setSupportSwish] = useState("");
  const [memLinks, setMemLinks] = useState<{ m: string; y: string; p: string }>({ m: "", y: "", p: "" });
  const [coachReqs, setCoachReqs] = useState<any[]>([]);

  async function load() {
    loadMemLinks();
    loadCoachReqs();
    // Hard gate on the caller's OWN is_admin (own-row read). Non-admins see nothing.
    const { data: me } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
    if (!me || !(me as any).is_admin) { setAllowed(false); return; }
    setAllowed(true);
    const cr = await (supabase as any).rpc("admin_invite_codes");
    if (!cr.error && Array.isArray(cr.data)) setCodes(cr.data as Invite[]);
    try { const { data: d } = await (supabase as any).rpc("admin_dashboard"); if (d) setDash(d as Dashboard); } catch { /* dashboard optional */ }
    try { setAdminCourts(await adminListCustomCourts()); } catch { /* ignore */ }
    try { setPendingEvents(await fetchPendingEvents()); } catch { /* ignore */ }
    try { const { data: pl } = await (supabase as any).rpc("admin_players_list"); if (Array.isArray(pl)) setPlayers(pl as PlayerRow[]); } catch { /* ignore */ }
    try { const { data: sw } = await (supabase as any).rpc("get_support_swish"); setSupportSwish(((sw as string | null) ?? "")); } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, []);

  async function toggle(code: string, active: boolean) {
    const { error } = await (supabase as any).rpc("admin_set_invite_active", { _code: code, _active: active });
    if (error) { toast.error(error.message); return; }
    toast.success(active ? t("admin.reactivate") : t("admin.deactivate"));
    load();
  }

  async function createCode() {
    const code = newCode.trim().toUpperCase();
    if (!code) { toast.error("Code required"); return; }
    let ownerId: string | null = null;
    if (newOwnerEmail.trim()) {
      const { data: u } = await (supabase as any).rpc("players_directory");
      const q = newOwnerEmail.trim().toLowerCase();
      ownerId = ((u as any[]) ?? []).find((p) => (p.name ?? "").toLowerCase().includes(q))?.id ?? null;
    }
    const { error } = await (supabase as any).rpc("admin_create_invite_code", {
      _code: code, _owner_id: ownerId, _uses: Number(newUses) || 1,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.created_ok"));
    setNewCode(""); setNewUses("10"); setNewOwnerEmail("");
    load();
  }

  async function removeCode(code: string) {
    if (typeof window !== "undefined" && !window.confirm(`Delete code ${code}? This can't be undone.`)) return;
    const { error } = await (supabase as any).rpc("admin_delete_invite_code", { _code: code });
    if (error) { toast.error(error.message); return; }
    toast.success("Code deleted");
    load();
  }

  async function loadCoachReqs() {
    try {
      const { data } = await (supabase as any).rpc("admin_list_coach_requests");
      setCoachReqs((data as any[]) ?? []);
    } catch { /* pre-SQL */ }
  }

  async function setCoachStatus(id: string, status: string) {
    const { error } = await (supabase as any).rpc("admin_set_coach_request", { _id: id, _status: status });
    if (error) { toast.error(error.message); return; }
    toast.success(t("mem.admin_saved"));
    void loadCoachReqs();
  }

  async function loadMemLinks() {
    try {
      const { data } = await (supabase as any).rpc("get_member_config");
      const next = { m: "", y: "", p: "" };
      for (const r of ((data as any[]) ?? [])) {
        if (r.key === "stripe_member_monthly") next.m = r.value;
        if (r.key === "stripe_member_yearly") next.y = r.value;
        if (r.key === "stripe_pro_monthly") next.p = r.value;
      }
      setMemLinks(next);
    } catch { /* pre-SQL */ }
  }

  async function saveMemLink(key: string, value: string) {
    const { error } = await (supabase as any).rpc("set_member_config", { _key: key, _value: value.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("mem.admin_saved"));
  }

  async function saveSupportSwish() {
    const { error } = await (supabase as any).rpc("set_support_swish", { _number: supportSwish.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.support_saved"));
  }

  if (allowed === null) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  if (allowed === false) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">Members only 🚪</h1>
        <p className="text-[var(--ink)] font-semibold">This page is for club admins.</p>
        <Link to="/board" className="cbtn cbtn-coral inline-flex">Back home</Link>
      </div>
    );
  }

  const cities = dash ? Object.keys(dash.by_city ?? {}) : [];

  async function approveEvent(id: string) {
    try { await setEventStatus(id, "approved"); setPendingEvents((p) => p.filter((e) => e.id !== id)); toast.success(t("admin.ev_approved")); }
    catch (e: any) { toast.error(e?.message ?? "Error"); }
  }
  async function rejectEvent(id: string) {
    try { await setEventStatus(id, "rejected"); setPendingEvents((p) => p.filter((e) => e.id !== id)); toast.success(t("admin.ev_rejected")); }
    catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  async function toggleCourtHidden(c: AdminCourt) {
    try {
      await adminSetCourtHidden(c.id, !c.hidden);
      setAdminCourts((p) => p.map((x) => x.id === c.id ? { ...x, hidden: !c.hidden } : x));
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  function startEdit(c: AdminCourt) {
    setEditingCourt(c.id); setEditName(c.name); setEditArea(c.area ?? "");
  }
  async function saveEdit(c: AdminCourt) {
    try {
      await adminUpdateCourt(c.id, editName, editArea);
      setAdminCourts((p) => p.map((x) => x.id === c.id ? { ...x, name: editName.trim(), area: editArea.trim() || null } : x));
      setEditingCourt(null);
      toast.success(t("admin.court_saved"));
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="csection-label">{t("admin.tag")}</div>
        <h1 className="font-display text-4xl mt-1">{t("admin.title")}</h1>
      </div>

      <AnnouncementAdmin />

      {pendingEvents.length > 0 && (
        <div>
          <div className="csection-label mb-2">🎉 {t("admin.pending_events")}</div>
          <div className="space-y-2">
            {pendingEvents.map((e) => (
              <div key={e.id} className="ccard p-4 space-y-2" style={{ borderColor: "var(--coral)" }}>
                <div className="font-display text-xl leading-tight">{e.title}</div>
                <div className="text-sm text-[var(--ink)] font-semibold">
                  {whenLabel(e.starts_at)} · 📍 {e.city ? e.city + " · " : ""}{shortCourtName(e.location)}
                </div>
                {(e.price_sek || e.capacity) && (
                  <div className="text-sm text-[var(--ink)]">🎟 {e.price_sek ? t("ev.price_kr", { n: e.price_sek }) : t("ev.free")}{e.capacity ? ` · ${t("ev.spots_n", { n: e.capacity })}` : ""}</div>
                )}
                {e.format && <div className="text-sm text-[var(--ink)]">{e.format}</div>}
                {e.description && <div className="text-sm italic text-[var(--ink)]">"{e.description}"</div>}
                <EventContactLine eventId={e.id} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => approveEvent(e.id)} className="cbtn cbtn-green flex-1">{t("admin.ev_approve")}</button>
                  <button onClick={() => rejectEvent(e.id)} className="cbtn cbtn-ghost flex-1">{t("admin.ev_reject")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero fill rate */}
      <div className="ccard p-5 text-center" style={{ background: "var(--coral)", color: "#FFF6E8" }}>
        <div className="csection-label" style={{ color: "#FFF6E8" }}>{t("admin.fill_rate")}</div>
        <div className="font-display text-7xl leading-none mt-1">{dash?.fill_rate_pct ?? 0}%</div>
        <div className="text-base font-semibold mt-1 opacity-90">{t("admin.fill_target")}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("admin.profiles_total")} value={dash?.profiles_total ?? 0} />
        <Stat label={t("admin.profiles_week")} value={`+${dash?.profiles_new_week ?? 0}`} />
        <Stat label={t("admin.rescuer_optin")} value={`${dash?.rescuer_optin_pct ?? 0}%`} />
        <Stat label={t("admin.buddy_pairs")} value={dash?.buddy_pairs ?? 0} />
        <Stat label={t("admin.ghost_count")} value={dash?.ghost_count ?? 0} />
      </div>

      {/* By city */}
      <div>
        <div className="csection-label mb-2">{t("admin.by_city")}</div>
        <div className="space-y-3">
          {cities.map((cy) => {
            const c = dash!.by_city[cy];
            return (
              <div key={cy} className="ccard p-4 space-y-2">
                <div className="font-display text-2xl">📍 {cy}</div>
                <div className="grid grid-cols-2 gap-2 text-base">
                  <CityStat label={t("admin.sos_created")} value={c.sos_created_week} />
                  <CityStat label={t("admin.sos_claimed")} value={c.sos_claimed_week} />
                  <CityStat label={t("admin.open_posted")} value={c.open_posted_week} />
                  <CityStat label={t("admin.open_filled")} value={`${c.open_filled_pct}%`} />
                  <CityStat label={t("admin.median_ttc")} value={t("admin.minutes", { n: c.median_ttc_min })} />
                  <CityStat label={t("admin.all_time_games")} value={c.all_time_games_confirmed} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="csection-label mb-2">{t("admin.invite_codes")}</div>
        <div className="ccard p-3 space-y-2 mb-3">
          <div className="font-extrabold">{t("admin.new_code")}</div>
          <input className="cinput" placeholder={t("admin.code_placeholder")} value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <input className="cinput" placeholder={t("admin.uses_placeholder")} type="number" value={newUses} onChange={(e) => setNewUses(e.target.value)} />
          <input className="cinput" placeholder={t("admin.owner_placeholder")} value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} />
          <button onClick={createCode} className="cbtn cbtn-green w-full">{t("admin.create")}</button>
        </div>
        <div className="space-y-2">
          {codes.length === 0 ? (
            <div className="ccard p-4 text-center text-[var(--ink)]">No codes yet.</div>
          ) : codes.map((c) => (
            <div key={c.code} className="ccard p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-base tracking-wide truncate">{c.code}</div>
                <div className="text-sm text-[var(--ink)]">{c.uses_remaining} uses left · {c.signups ?? 0} joined</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(c.code, !c.active)}
                  className="inline-flex items-center gap-1.5 text-sm font-extrabold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
                  title={c.active ? "Active — tap to deactivate" : "Off — tap to activate"}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.active ? "var(--green-pop)" : "#c9c4bb" }} />
                  {c.active ? "Active" : "Off"}
                </button>
                <button type="button" onClick={() => removeCode(c.code)} className="text-base px-2 py-1 opacity-60" title="Delete code">🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {players.length > 0 && (
        <div>
          <div className="csection-label mb-2">👥 All players · {players.length}</div>
          <div className="space-y-2">
            {players.map((p) => {
              const lvl = p.level ? levelMeta(p.level) : null;
              const city = (p.home_cities && p.home_cities.length > 0 ? p.home_cities.join(" · ") : p.home_city) || null;
              const hasPlay = (p.formats && p.formats.length > 0) || (p.play_times && p.play_times.length > 0);
              return (
                <div key={p.id} className="ccard p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold truncate">
                        {[p.name, p.last_name].filter(Boolean).join(" ") || "—"}
                        {p.is_admin ? <span className="ml-1.5 text-xs font-extrabold text-[var(--coral)]">ADMIN</span> : null}
                      </div>
                      {(lvl || p.vibe || p.looking_for) ? (
                        <div className="text-sm text-[var(--ink)]/60 truncate">
                          {lvl ? <span className="font-bold" style={{ color: lvl.color }}>{lvl.name}</span> : null}
                          {p.vibe ? <> · {vibeEmoji(p.vibe)} {VIBES.find((v) => v.value === p.vibe)?.label ?? ""}</> : null}
                          {p.looking_for ? <> · {p.looking_for}</> : null}
                        </div>
                      ) : null}
                    </div>
                    {p.signup_code ? (
                      <span className="text-xs font-extrabold shrink-0 px-2 py-0.5 rounded-full" style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>{p.signup_code}</span>
                    ) : (
                      <span className="text-xs shrink-0 text-[var(--ink)]/40">no code</span>
                    )}
                  </div>
                  {hasPlay ? (
                    <div className="text-sm text-[var(--ink)]/60">
                      {[p.formats && p.formats.length > 0 ? p.formats.join(" · ") : null, p.play_times && p.play_times.length > 0 ? p.play_times.join(" · ") : null].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                  {city ? <div className="text-sm text-[var(--ink)]/60">📍 {city}{p.home_courts ? ` · ${p.home_courts}` : ""}</div> : null}
                  {p.phone_e164 ? <div className="text-sm text-[var(--ink)]/60">📞 {p.phone_e164}</div> : null}
                  {p.bio ? <div className="text-sm italic text-[var(--ink)]/60">"{p.bio}"</div> : null}
                  {p.fav_shot ? <div className="text-sm text-[var(--ink)]/60">🎾 {p.fav_shot}</div> : null}
                  <div className="text-xs text-[var(--ink)]/40">
                    🎮 {p.games_played ?? 0} · 🚑 {p.rescues_count ?? 0}{p.buddy_optin === "yes" ? ` · buddy ${p.buddy_radius_km ?? 10}km` : ""}{p.ghost_badge ? " · 🪦" : ""} · {new Date(p.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="csection-label mb-2">{t("admin.courts_title")}</div>
        {adminCourts.length === 0 ? (
          <div className="ccard p-4 text-center text-[var(--ink)]">{t("admin.courts_empty")}</div>
        ) : (
          <div className="space-y-2">
            {adminCourts.map((c) => (
              <div key={c.id} className="ccard p-3 space-y-2" style={c.hidden ? { opacity: 0.6 } : undefined}>
                {editingCourt === c.id ? (
                  <div className="space-y-2">
                    <input className="cinput" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input className="cinput" value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder={t("court.area_placeholder")} />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingCourt(null)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
                      <button onClick={() => saveEdit(c)} className="cbtn cbtn-green flex-1">{t("admin.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-display text-xl">📍 {c.city} · {c.name}</div>
                    {c.area && <div className="text-base text-[var(--ink)]">{c.area}</div>}
                    <div className="text-base text-[var(--ink)]">
                      {t("admin.court_by", { name: c.creator_name ?? "—" })} · {t("admin.court_usage", { n: c.usage_count })}
                      {c.hidden && ` · ${t("admin.court_hidden")}`}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => startEdit(c)} className="cbtn cbtn-ghost">{t("admin.edit")}</button>
                      <button onClick={() => toggleCourtHidden(c)} className={`cbtn ${c.hidden ? "cbtn-green" : "cbtn-ghost"}`}>
                        {c.hidden ? t("admin.unhide") : t("admin.hide")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Collapsible title={`🎓 ${t("coach.admin_title")} (${coachReqs.filter((r) => r.status === "new").length})`}>
        <div className="space-y-3">
          {coachReqs.length === 0 && <div className="text-sm text-[var(--ink)]/60">{t("coach.admin_empty")}</div>}
          {coachReqs.map((r) => (
            <div key={r.id} className="rounded-2xl border-2 border-[var(--ink)] p-3 space-y-1.5" style={{ background: "var(--cream)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold truncate">{r.name}{r.last_name ? " " + r.last_name : ""} · L{r.level}</span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: r.status === "new" ? "var(--coral)" : r.status === "matched" ? "var(--green-pop)" : "var(--cream2)", color: r.status === "new" ? "#FFF6E8" : "var(--ink)", border: "1.5px solid var(--ink)" }}>
                  {r.status}
                </span>
              </div>
              <div className="text-sm font-semibold">{r.sport} · "{r.goal}"</div>
              {Array.isArray(r.availability) && r.availability.length > 0 && (
                <div className="text-xs font-bold text-[var(--ink)]/60">🕐 {r.availability.join(" · ")}</div>
              )}
              {r.note && <div className="text-xs italic text-[var(--ink)]/70">"{r.note}"</div>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {r.phone_e164 && (
                  <a className="cchip" href={`https://wa.me/${String(r.phone_e164).replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
                )}
                {r.status === "new" && <button className="cchip" onClick={() => setCoachStatus(r.id, "in_progress")}>▶ {t("coach.st_progress")}</button>}
                {(r.status === "new" || r.status === "in_progress") && <button className="cchip" onClick={() => setCoachStatus(r.id, "matched")}>✅ {t("coach.st_matched")}</button>}
                {r.status !== "closed" && <button className="cchip" onClick={() => setCoachStatus(r.id, "closed")}>🗄 {t("coach.st_closed")}</button>}
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={`💳 ${t("mem.admin_links_title")}`}>
        <div className="space-y-2">
          <div className="text-sm text-[var(--ink)]/60">{t("mem.admin_links_hint")}</div>
          <label className="csection-label">Member · monthly (69 SEK)</label>
          <input className="cinput" value={memLinks.m} onChange={(e) => setMemLinks({ ...memLinks, m: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_member_monthly", memLinks.m)}>{t("admin.support_save")}</button>
          <label className="csection-label">Member · yearly (690 SEK)</label>
          <input className="cinput" value={memLinks.y} onChange={(e) => setMemLinks({ ...memLinks, y: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_member_yearly", memLinks.y)}>{t("admin.support_save")}</button>
          <label className="csection-label">Pro · monthly (249 SEK)</label>
          <input className="cinput" value={memLinks.p} onChange={(e) => setMemLinks({ ...memLinks, p: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_pro_monthly", memLinks.p)}>{t("admin.support_save")}</button>
        </div>
      </Collapsible>

      <Collapsible title={t("admin.support_title")}>
        <div className="space-y-2">
          <div className="text-sm text-[var(--ink)]/60">{t("admin.support_hint")}</div>
          <input className="cinput" value={supportSwish} onChange={(e) => setSupportSwish(e.target.value)} placeholder={t("admin.support_ph")} inputMode="tel" />
          <button type="button" className="cbtn cbtn-coral w-full" onClick={saveSupportSwish}>{t("admin.support_save")}</button>
        </div>
      </Collapsible>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ccard p-3 text-center">
      <div className="csection-label">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}

function CityStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-2 border-[var(--ink)] rounded-xl p-2 text-center bg-[var(--cream2)]">
      <div className="csection-label">{label}</div>
      <div className="font-display text-xl mt-1">{value}</div>
    </div>
  );
}