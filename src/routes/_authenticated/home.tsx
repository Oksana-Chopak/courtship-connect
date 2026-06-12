import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweepExpired } from "@/lib/sos";
import { fetchPendingPostGameChecks, confirmGame, reportNoshow, type GameRow } from "@/lib/games";
import { toast } from "sonner";
import { whenLabel } from "@/lib/courtship";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Courtship" }] }),
  component: Home,
});

function Home() {
  const [name, setName] = useState<string>("");
  const [rescues, setRescues] = useState(0);
  const [activeRescueCount, setActiveRescueCount] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState<GameRow[]>([]);

  useEffect(() => {
    (async () => {
      await sweepExpired();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await supabase
        .from("profiles" as any)
        .select("name,rescues_count,level,buddy_optin,is_admin")
        .eq("id", u.user.id)
        .maybeSingle();
      const d = data as any;
      setName(d?.name?.split(" ")[0] ?? "");
      setRescues(d?.rescues_count ?? 0);
      setIsAdmin(!!d?.is_admin);

      setPending(await fetchPendingPostGameChecks(u.user.id));

      if (d?.buddy_optin !== "no" && d?.level) {
        const { count } = await (supabase as any)
          .from("sos_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .lte("level_min", d.level)
          .gte("level_max", d.level)
          .gt("play_at", new Date().toISOString());
        setActiveRescueCount(count ?? 0);
      }

      try {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
          // gentle ask
          setTimeout(() => Notification.requestPermission().catch(() => {}), 1500);
        }
      } catch {}
    })();
  }, []);

  async function onConfirm(g: GameRow) {
    try {
      await confirmGame(g.id);
      toast.success("Marked played 🎾");
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }
  async function onNoshow(g: GameRow) {
    try {
      await reportNoshow(g.id);
      toast.success("Logged. Sorry about that 🪦");
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="csection-label">{name ? `Hey ${name}` : "Hey"}</div>
        <h1 className="font-display text-4xl mt-1">Court's calling.</h1>
      </div>

      {pending.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--ink)" }}>
          <div>
            <div className="csection-label">Post-game check</div>
            <div className="font-display text-2xl mt-1">Did the game happen? 🎾</div>
            <div className="text-sm text-[var(--ink)]/70 font-semibold">
              {whenLabel(g.played_at)} — we just need a quick yes / no.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onConfirm(g)} className="cbtn cbtn-green">Yes, we played</button>
            <button onClick={() => onNoshow(g)} className="cbtn cbtn-ghost">No-show 🪦</button>
          </div>
        </div>
      ))}

      <Link
        to="/sos/new"
        className="block ccard p-6 text-center"
        style={{
          background: "var(--coral)",
          color: "#FFF6E8",
          borderColor: "var(--ink)",
        }}
      >
        <div className="sos-pulse rounded-full w-32 h-32 mx-auto flex items-center justify-center text-5xl mb-4">
          🚨
        </div>
        <div className="font-display text-4xl leading-tight">SAVE MY SET</div>
        <div className="text-sm font-extrabold opacity-90 mt-2">
          Partner ghosted? Get a rescue in &lt; 30s.
        </div>
      </Link>

      <Link to="/rescue" className="ccard p-4 flex items-center justify-between">
        <div>
          <div className="font-display text-2xl">Rescue board</div>
          <div className="text-sm text-[var(--ink)]/70 font-semibold">
            {activeRescueCount > 0
              ? `${activeRescueCount} player${activeRescueCount === 1 ? "" : "s"} need${activeRescueCount === 1 ? "s" : ""} you`
              : "All quiet on the courts."}
          </div>
        </div>
        <div className="relative">
          <div className="text-3xl">🚑</div>
          {activeRescueCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-[var(--coral)] text-[#FFF6E8] text-xs font-extrabold rounded-full min-w-5 h-5 px-1 flex items-center justify-center border-2 border-[var(--ink)]">
              {activeRescueCount}
            </span>
          )}
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/players" className="ccard p-4 text-center">
          <div className="text-3xl">🎾</div>
          <div className="font-display text-xl mt-1">Players</div>
        </Link>
        <Link to="/me" className="ccard p-4 text-center">
          <div className="text-3xl">🚑</div>
          <div className="font-display text-xl mt-1">Rescues: {rescues}</div>
        </Link>
      </div>

      {isAdmin && (
        <Link to="/admin" className="ccard p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl">Club admin</div>
            <div className="text-sm text-[var(--ink)]/70 font-semibold">Invite codes & stats</div>
          </div>
          <div className="text-2xl">🛠️</div>
        </Link>
      )}

      <style>{`
        .sos-pulse {
          background: rgba(255, 246, 232, 0.18);
          box-shadow: 0 0 0 0 rgba(255, 246, 232, 0.7);
          animation: sosPulse 1.6s infinite;
        }
        @keyframes sosPulse {
          0% { box-shadow: 0 0 0 0 rgba(255,246,232,0.55); }
          70% { box-shadow: 0 0 0 28px rgba(255,246,232,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,246,232,0); }
        }
      `}</style>
    </div>
  );
}