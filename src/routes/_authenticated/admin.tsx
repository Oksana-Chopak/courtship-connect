import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { adminListCustomCourts, adminSetCourtHidden, adminUpdateCourt, shortCourtName, type AdminCourt } from "@/lib/courts";
import { fetchPendingEvents, setEventStatus, fetchEventContact, type EventRow } from "@/lib/events";
import { whenLabel } from "@/lib/courtship";

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
type PlayerRow = { id: string; name: string; home_city: string | null; signup_code: string | null; rescues_count: number; created_at: string };
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
  const { t } = useI18n();
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

  async function load() {
    const cr = await (supabase as any).rpc("admin_invite_codes");
    if (!cr.error && Array.isArray(cr.data)) {
      setCodes(cr.data as Invite[]);
    } else {
      const { data } = await (supabase as any)
        .from("invite_codes").select("code,uses_remaining,active,created_at").order("created_at", { ascending: false });
      setCodes(((data as Invite[]) ?? []).map((c) => ({ ...c, signups: 0 })));
    }
    const { data: d, error } = await (supabase as any).rpc("admin_dashboard");
    if (error) { setAllowed(false); return; }
    setDash(d as Dashboard);
    setAllowed(true);
    try { setAdminCourts(await adminListCustomCourts()); } catch {}
    try { setPendingEvents(await fetchPendingEvents()); } catch {}
    try { const { data: pl } = await (supabase as any).rpc("admin_players_list"); if (Array.isArray(pl)) setPlayers(pl as PlayerRow[]); } catch {}
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

  if (allowed === null) return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;
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
            {players.map((p) => (
              <div key={p.id} className="ccard p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold truncate">{p.name || "—"}</div>
                  <div className="text-sm text-[var(--ink)] truncate">📍 {p.home_city ?? "—"} · joined {new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                {p.signup_code ? (
                  <span className="text-sm font-extrabold shrink-0 px-2 py-0.5 rounded-full" style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>{p.signup_code}</span>
                ) : (
                  <span className="text-sm shrink-0 opacity-50">no code</span>
                )}
              </div>
            ))}
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