import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Courtship" }] }),
  component: AdminPage,
});

type Invite = { code: string; uses_remaining: number; active: boolean; created_at: string };
type Stats = { profiles_count: number; active_sos_count: number; fill_rate: number };

function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [codes, setCodes] = useState<Invite[]>([]);

  async function load() {
    const { data: codeRows } = await (supabase as any)
      .from("invite_codes")
      .select("code,uses_remaining,active,created_at")
      .order("created_at", { ascending: false });
    setCodes((codeRows as Invite[]) ?? []);
    const { data: s, error } = await (supabase as any).rpc("admin_stats");
    if (error) { setAllowed(false); return; }
    const row = Array.isArray(s) ? s[0] : s;
    setStats(row as Stats);
    setAllowed(true);
  }

  useEffect(() => { load(); }, []);

  async function toggle(code: string, active: boolean) {
    const { error } = await (supabase as any).rpc("admin_set_invite_active", { _code: code, _active: active });
    if (error) { toast.error(error.message); return; }
    toast.success(active ? "Code reactivated" : "Code deactivated");
    load();
  }

  if (allowed === null) return <div className="text-center py-12 text-[var(--ink)]/60">Loading...</div>;
  if (allowed === false) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">Members only 🚪</h1>
        <p className="text-[var(--ink)]/70 font-semibold">This page is for club admins.</p>
        <Link to="/home" className="cbtn cbtn-coral inline-flex">Back home</Link>
      </div>
    );
  }

  const fillPct = stats ? Math.round(stats.fill_rate * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="csection-label">Club admin</div>
        <h1 className="font-display text-4xl mt-1">The clubhouse 🛠️</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Players" value={stats?.profiles_count ?? 0} />
        <Stat label="Active SOS" value={stats?.active_sos_count ?? 0} />
        <Stat label="Fill rate" value={`${fillPct}%`} />
      </div>

      <div>
        <div className="csection-label mb-2">Invite codes</div>
        <div className="space-y-2">
          {codes.length === 0 ? (
            <div className="ccard p-4 text-center text-[var(--ink)]/60">No codes yet.</div>
          ) : codes.map((c) => (
            <div key={c.code} className="ccard p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg tracking-widest">{c.code}</div>
                <div className="text-xs text-[var(--ink)]/60">
                  {c.uses_remaining} uses left · {c.active ? "active" : "deactivated"}
                </div>
              </div>
              <button
                onClick={() => toggle(c.code, !c.active)}
                className={`cbtn ${c.active ? "cbtn-ghost" : "cbtn-green"}`}
              >
                {c.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ))}
        </div>
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