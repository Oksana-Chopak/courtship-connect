import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweepExpired, formatLabel, type SosRow, type CourtRow, fetchCourts } from "@/lib/sos";
import { whenLabel, timeAgo, levelMeta } from "@/lib/courtship";

export const Route = createFileRoute("/_authenticated/rescue")({
  head: () => ({ meta: [{ title: "Rescue board — Courtship" }] }),
  component: Rescue,
});

function Rescue() {
  const [me, setMe] = useState<{ id: string; level: number; buddy_optin: string } | null>(null);
  const [rows, setRows] = useState<SosRow[]>([]);
  const [courts, setCourts] = useState<Record<string, CourtRow>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (level: number) => {
    await sweepExpired();
    const { data } = await (supabase as any)
      .from("sos_requests")
      .select("*")
      .eq("status", "active")
      .lte("level_min", level)
      .gte("level_max", level)
      .gt("play_at", new Date().toISOString())
      .order("play_at", { ascending: true });
    setRows((data as SosRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const cs = await fetchCourts();
      setCourts(Object.fromEntries(cs.map((c) => [c.id, c])));
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("id,level,buddy_optin")
        .eq("id", u.user.id)
        .maybeSingle();
      const meRow = p as any;
      setMe(meRow);
      if (meRow?.buddy_optin === "no") {
        setLoading(false);
        return;
      }
      await load(meRow?.level ?? 3);
    })();
  }, [load]);

  useEffect(() => {
    if (!me || me.buddy_optin === "no") return;
    const ch = (supabase as any)
      .channel("rescue-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, () => {
        load(me.level);
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          // light pulse on new SOS — handled in load via row diff
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, load]);

  // Browser notification on new SOS
  const [prevIds, setPrevIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    if (prevIds.size > 0 && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const newOnes = rows.filter((r) => !prevIds.has(r.id));
      for (const r of newOnes) {
        try {
          new Notification("Someone needs a hero 🚨", {
            body: `${whenLabel(r.play_at)} · ${courts[r.court_id ?? ""]?.name ?? "court"}`,
          });
        } catch {}
      }
    }
    setPrevIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (!me) return <div className="text-center py-12 text-[var(--ink)]/60">Loading...</div>;

  if (me.buddy_optin === "no") {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-4xl">Rescue board 🚑</h1>
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🛌</div>
          <div className="font-display text-xl mt-1">You're off duty</div>
          <div className="text-sm text-[var(--ink)]/70">
            Turn on Buddy mode in your profile to see rescue calls.
          </div>
          <Link to="/me" className="cbtn cbtn-coral mt-4 inline-flex">Edit profile</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">Rescue board 🚑</h1>
        <p className="text-[var(--ink)]/70 font-semibold">
          {rows.length === 0 ? "Quiet out there. Stay warm." : `${rows.length} player${rows.length === 1 ? "" : "s"} need${rows.length === 1 ? "s" : ""} you.`}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]/60">Listening...</div>
      ) : rows.length === 0 ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🎾</div>
          <div className="font-display text-xl mt-1">No SOS right now</div>
          <div className="text-sm text-[var(--ink)]/60">We'll ping you when someone needs saving.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <SosCard key={r.id} sos={r} court={courts[r.court_id ?? ""]?.name ?? "Court"} mine={r.caller_id === me.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function SosCard({ sos, court, mine }: { sos: SosRow; court: string; mine: boolean }) {
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  return (
    <Link to="/sos/$id" params={{ id: sos.id }} className="ccard p-4 block">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-tight">{whenLabel(sos.play_at)}</div>
          <div className="font-extrabold truncate">{court}</div>
          <div className="text-sm text-[var(--ink)]/70">
            {formatLabel(sos.format)} · L
            <span className="font-extrabold" style={{ color: lmMin.color }}>{sos.level_min}</span>
            –<span className="font-extrabold" style={{ color: lmMax.color }}>{sos.level_max}</span>
          </div>
          {sos.note && <div className="text-sm italic mt-1 text-[var(--ink)]/80">"{sos.note}"</div>}
        </div>
        <div className="text-xs text-[var(--ink)]/50 whitespace-nowrap">{timeAgo(sos.created_at)}</div>
      </div>
      <div className="mt-3">
        <span className={`cbtn ${mine ? "cbtn-ghost" : "cbtn-coral"} w-full`} style={{ pointerEvents: "none" }}>
          {mine ? "Your SOS — view status" : "I'm in! 🎾"}
        </span>
      </div>
    </Link>
  );
}