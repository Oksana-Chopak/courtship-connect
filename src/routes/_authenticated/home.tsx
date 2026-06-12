import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweepExpired } from "@/lib/sos";
import { CommunityStatsWidget } from "@/components/CommunityStats";
import { fetchPendingPostGameChecks, confirmGame, reportNoshow, type GameRow } from "@/lib/games";
import { fetchPendingRequestsTo, respondBuddyRequest, type BuddyRequest } from "@/lib/buddies";
import { toast } from "sonner";
import { whenLabel, URGENCY_WINDOW_HOURS } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Courtship" }] }),
  component: Home,
});

function Home() {
  const { t } = useI18n();
  const [name, setName] = useState<string>("");
  const [rescues, setRescues] = useState(0);
  const [activeRescueCount, setActiveRescueCount] = useState(0);
  const [, setUid] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<string>("Uppsala");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState<GameRow[]>([]);
  const [buddyReqs, setBuddyReqs] = useState<BuddyRequest[]>([]);
  const [requesterNames, setRequesterNames] = useState<Record<string, string>>({});
  const [flarePrompts, setFlarePrompts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      await sweepExpired();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await supabase
        .from("profiles" as any)
        .select("name,rescues_count,level,buddy_optin,is_admin,home_city")
        .eq("id", u.user.id)
        .maybeSingle();
      const d = data as any;
      setName(d?.name?.split(" ")[0] ?? "");
      setRescues(d?.rescues_count ?? 0);
      setIsAdmin(!!d?.is_admin);
      if (d?.home_city) setHomeCity(d.home_city);

      setPending(await fetchPendingPostGameChecks(u.user.id));

      // My own open games unfilled within URGENCY_WINDOW where auto_flare is off → prompt to flare
      const cutoff = new Date(Date.now() + URGENCY_WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data: prompts } = await (supabase as any)
        .from("sos_requests")
        .select("id,play_at,court_id,kind,auto_flare,status")
        .eq("caller_id", u.user.id)
        .eq("status", "active")
        .eq("kind", "open")
        .eq("auto_flare", false)
        .gt("play_at", new Date().toISOString())
        .lte("play_at", cutoff);
      setFlarePrompts((prompts as any[]) ?? []);

      const reqs = await fetchPendingRequestsTo(u.user.id);
      setBuddyReqs(reqs);
      if (reqs.length) {
        const ids = reqs.map((r) => r.from_id);
        const { data: names } = await (supabase as any)
          .from("profiles_public").select("id,name").in("id", ids);
        const m: Record<string, string> = {};
        (names as any[] | null)?.forEach((n) => { m[n.id] = n.name; });
        setRequesterNames(m);
      }

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
      toast.success(t("home.yes_played"));
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }
  async function onNoshow(g: GameRow) {
    try {
      await reportNoshow(g.id);
      toast.success(t("home.no_show"));
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }

  async function respond(req: BuddyRequest, accept: boolean) {
    try {
      await respondBuddyRequest(req.id, accept);
      setBuddyReqs((p) => p.filter((x) => x.id !== req.id));
      toast.success(accept ? t("buddy.accepted") : t("buddy.declined"));
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  async function fireFlare(sosId: string) {
    const { error } = await (supabase as any)
      .from("sos_requests")
      .update({ kind: "sos", flared_at: new Date().toISOString() })
      .eq("id", sosId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("post.flare_fired"));
    setFlarePrompts((p) => p.filter((x) => x.id !== sosId));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="csection-label">{name ? `${t("nav.home")} · ${name}` : t("nav.home")}</div>
        <h1 className="font-display text-4xl mt-1">{t("home.lets_play")}</h1>
      </div>

      {flarePrompts.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
          <div className="font-display text-2xl">{t("home.flare_prompt_title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">{whenLabel(g.play_at)}</div>
          <button onClick={() => fireFlare(g.id)} className="cbtn cbtn-coral w-full">
            {t("home.flare_prompt_cta")}
          </button>
        </div>
      ))}

      {pending.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--ink)" }}>
          <div>
            <div className="csection-label">{t("home.pending_check")}</div>
            <div className="font-display text-2xl mt-1">{t("home.pending_check")}</div>
            <div className="text-sm text-[var(--ink)] font-semibold">
              {whenLabel(g.played_at)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onConfirm(g)} className="cbtn cbtn-green">{t("home.yes_played")}</button>
            <button onClick={() => onNoshow(g)} className="cbtn cbtn-ghost">{t("home.no_show")}</button>
          </div>
        </div>
      ))}

      {buddyReqs.length > 0 && (
        <div className="ccard p-4 space-y-3">
          <div className="font-display text-2xl">{t("buddy.requests_title")}</div>
          {buddyReqs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--ink)]/15 pt-2">
              <div className="font-extrabold truncate">{requesterNames[r.from_id] ?? "Player"}</div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => respond(r, true)} className="cbtn cbtn-green">{t("buddy.accept")}</button>
                <button onClick={() => respond(r, false)} className="cbtn cbtn-ghost">{t("buddy.decline")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <div className="font-display text-4xl leading-tight">{t("home.save_my_set")}</div>
      </Link>

      <Link
        to="/sos/new"
        search={{ planned: 1 }}
        className="block ccard p-4 text-center"
        style={{ background: "var(--green-pop)", borderColor: "var(--ink)" }}
      >
        <div className="font-display text-2xl">{t("home.post_a_game")}</div>
      </Link>

      <Link to="/games" className="ccard p-4 flex items-center justify-between">
        <div>
          <div className="font-display text-2xl">{t("home.open_games")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">{t("games.sub")}</div>
        </div>
        <div className="text-3xl">🎾</div>
      </Link>

      <Link to="/rescue" className="ccard p-4 flex items-center justify-between">
        <div>
          <div className="font-display text-2xl">{t("rescue.title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">
            {activeRescueCount > 0
              ? `${activeRescueCount} · ${t("nav.rescue")}`
              : t("rescue.empty_title")}
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

      <CommunityStatsWidget city={homeCity} />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/players" className="ccard p-4 text-center">
          <div className="text-3xl">🎾</div>
          <div className="font-display text-xl mt-1">{t("home.browse_players")}</div>
        </Link>
        <Link to="/me" className="ccard p-4 text-center">
          <div className="text-3xl">🚑</div>
          <div className="font-display text-xl mt-1">🚑 {rescues}</div>
        </Link>
      </div>

      {isAdmin && (
        <Link to="/admin" className="ccard p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl">Club admin</div>
            <div className="text-sm text-[var(--ink)] font-semibold">Invite codes & stats</div>
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