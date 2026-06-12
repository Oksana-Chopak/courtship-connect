import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { adminListCustomCourts, adminSetCourtHidden, adminUpdateCourt, type AdminCourt } from "@/lib/courts";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Courtship" }] }),
  component: AdminPage,
});

type Invite = { code: string; uses_remaining: number; active: boolean; created_at: string };
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

  async function load() {
    const { data: codeRows } = await (supabase as any)
      .from("invite_codes")
      .select("code,uses_remaining,active,created_at")
      .order("created_at", { ascending: false });
    setCodes((codeRows as Invite[]) ?? []);
    const { data: d, error } = await (supabase as any).rpc("admin_dashboard");
    if (error) { setAllowed(false); return; }
    setDash(d as Dashboard);
    setAllowed(true);
    try { setAdminCourts(await adminListCustomCourts()); } catch {}
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
      const { data: u } = await (supabase as any)
        .from("profiles_public").select("id").ilike("name", `%${newOwnerEmail.trim()}%`).limit(1).maybeSingle();
      ownerId = (u as any)?.id ?? null;
    }
    const { error } = await (supabase as any).rpc("admin_create_invite_code", {
      _code: code, _owner_id: ownerId, _uses: Number(newUses) || 1,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.created_ok"));
    setNewCode(""); setNewUses("10"); setNewOwnerEmail("");
    load();
  }

  if (allowed === null) return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;
  if (allowed === false) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">Members only 🚪</h1>
        <p className="text-[var(--ink)] font-semibold">This page is for club admins.</p>
        <Link to="/home" className="cbtn cbtn-coral inline-flex">Back home</Link>
      </div>
    );
  }

  const cities = dash ? Object.keys(dash.by_city ?? {}) : [];

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
            <div key={c.code} className="ccard p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg tracking-widest">{c.code}</div>
                <div className="text-base text-[var(--ink)]">
                  {c.uses_remaining} uses left · {c.active ? "active" : "deactivated"}
                </div>
              </div>
              <button
                onClick={() => toggle(c.code, !c.active)}
                className={`cbtn ${c.active ? "cbtn-ghost" : "cbtn-green"}`}
              >
                {c.active ? t("admin.deactivate") : t("admin.reactivate")}
              </button>
            </div>
          ))}
        </div>
      </div>

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