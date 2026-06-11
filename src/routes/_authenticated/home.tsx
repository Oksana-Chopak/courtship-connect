import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweepExpired } from "@/lib/sos";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Courtship" }] }),
  component: Home,
});

function Home() {
  const [name, setName] = useState<string>("");
  const [rescues, setRescues] = useState(0);
  const [activeRescueCount, setActiveRescueCount] = useState(0);

  useEffect(() => {
    (async () => {
      await sweepExpired();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles" as any)
        .select("name,rescues_count,level,buddy_optin")
        .eq("id", u.user.id)
        .maybeSingle();
      const d = data as any;
      setName(d?.name?.split(" ")[0] ?? "");
      setRescues(d?.rescues_count ?? 0);

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

  return (
    <div className="space-y-6">
      <div>
        <div className="csection-label">{name ? `Hey ${name}` : "Hey"}</div>
        <h1 className="font-display text-4xl mt-1">Court's calling.</h1>
      </div>

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
              : "No SOS right now — quiet courts."}
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