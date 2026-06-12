import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sweepExpired, withdrawClaim, fetchMyUpcomingClaims, type EligibleSosRow } from "@/lib/sos";
import { CommunityStatsWidget } from "@/components/CommunityStats";
import { fetchPendingPostGameChecks, confirmGame, reportNoshow, archiveGame, type GameRow } from "@/lib/games";
import { toast } from "sonner";
import { whenLabel, URGENCY_WINDOW_HOURS } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { InstallBanner, StandaloneNotifPrompt } from "@/components/InstallBanner";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Courtship" }] }),
  component: Home,
});

function Home() {
  const { t } = useI18n();
  const [name, setName] = useState<string>("");
  const [rescues, setRescues] = useState(0);
  const [, setUid] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<string>("Uppsala");
  const [pending, setPending] = useState<GameRow[]>([]);
  const [pendingMeta, setPendingMeta] = useState<Record<string, { court: string; other: string; otherName: string }>>({});
  const [myClaims, setMyClaims] = useState<EligibleSosRow[]>([]);
  const [flarePrompts, setFlarePrompts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      await sweepExpired();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await supabase
        .from("profiles" as any)
        .select("name,rescues_count,level,buddy_optin,home_city")
        .eq("id", u.user.id)
        .maybeSingle();
      const d = data as any;
      setName(d?.name?.split(" ")[0] ?? "");
      setRescues(d?.rescues_count ?? 0);
      if (d?.home_city) setHomeCity(d.home_city);

      // Enrich pending with court name + other player name
      const pendingRows = await fetchPendingPostGameChecks(u.user.id);
      setPending(pendingRows);
      if (pendingRows.length) {
        const sosIds = Array.from(new Set(pendingRows.map((g) => g.sos_id).filter(Boolean) as string[]));
        const otherIds = Array.from(new Set(pendingRows.map((g) => (g.player_a === u.user!.id ? g.player_b : g.player_a))));
        const [{ data: sosRows }, { data: pubs }] = await Promise.all([
          sosIds.length ? (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds) : Promise.resolve({ data: [] }),
          (supabase as any).from("profiles_public").select("id,name").in("id", otherIds),
        ]);
        const courtIds = Array.from(new Set(((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean)));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name").in("id", courtIds)
          : { data: [] as any[] };
        const sosToCourt = new Map<string, string>(((sosRows as any[]) ?? []).map((s) => [s.id, s.court_id]));
        const courtName = new Map<string, string>((cs as any[] ?? []).map((c) => [c.id, c.name]));
        const nameById = new Map<string, string>((pubs as any[] ?? []).map((p) => [p.id, p.name]));
        const meta: Record<string, { court: string; other: string; otherName: string }> = {};
        for (const g of pendingRows) {
          const otherId = g.player_a === u.user!.id ? g.player_b : g.player_a;
          const cid = g.sos_id ? sosToCourt.get(g.sos_id) : undefined;
          meta[g.id] = {
            court: (cid && courtName.get(cid)) || "the court",
            other: otherId,
            otherName: nameById.get(otherId) ?? "Player",
          };
        }
        setPendingMeta(meta);
      }

      setMyClaims(await fetchMyUpcomingClaims(u.user.id));

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
      toast.success(t("home.confirmed"));
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }
  async function onNoshow(g: GameRow) {
    try {
      await reportNoshow(g.id);
      toast.success(t("home.reported_noshow"));
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }
  async function onArchive(g: GameRow) {
    try {
      await archiveGame(g.id);
      toast.success(t("home.archived"));
      setPending((p) => p.filter((x) => x.id !== g.id));
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update"); }
  }

  async function onWithdraw(sos: EligibleSosRow) {
    if (typeof window !== "undefined" && !window.confirm(t("home.cant_make_confirm"))) return;
    const r = await withdrawClaim(sos.id);
    if (!r.ok) { toast.error(r.reason); return; }
    toast.success(r.re_flared ? t("home.withdrawn_reflared") : t("home.withdrawn"));
    setMyClaims((p) => p.filter((x) => x.id !== sos.id));
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

      <InstallBanner />
      <StandaloneNotifPrompt />

      {flarePrompts.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
          <div className="font-display text-2xl">{t("home.flare_prompt_title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">{whenLabel(g.play_at)}</div>
          <button onClick={() => fireFlare(g.id)} className="cbtn cbtn-coral w-full">
            {t("home.flare_prompt_cta")}
          </button>
        </div>
      ))}

      {pending.map((g) => {
        const meta = pendingMeta[g.id];
        const otherName = meta?.otherName ?? "Player";
        const court = meta?.court ?? "the court";
        return (
          <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--ink)" }}>
            <div>
              <div className="csection-label">{whenLabel(g.played_at)}</div>
              <div className="font-display text-2xl mt-1 leading-tight">
                {t("home.pending_q", { court })}
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => onConfirm(g)} className="cbtn cbtn-green w-full">{t("home.yes_we_played")}</button>
              <button onClick={() => onArchive(g)} className="cbtn cbtn-ghost w-full">{t("home.didnt_happen")}</button>
              <button onClick={() => onNoshow(g)} className="cbtn cbtn-ghost w-full">
                {t("home.player_noshow", { name: otherName })}
              </button>
            </div>
          </div>
        );
      })}

      {myClaims.length > 0 && (
        <div className="ccard p-4 space-y-3">
          <div className="font-display text-2xl">{t("home.my_upcoming")}</div>
          {myClaims.map((s) => (
            <div key={s.id} className="border-t border-[var(--ink)]/15 pt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-extrabold truncate">{whenLabel(s.play_at)}</div>
                <div className="text-sm text-[var(--ink)] truncate">📍 {s.court_city ?? ""} · {s.court_name ?? "Court"}</div>
              </div>
              <button onClick={() => onWithdraw(s)} className="cbtn cbtn-ghost shrink-0">
                {t("home.cant_make_it")}
              </button>
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

      <CommunityStatsWidget city={homeCity} />

      <div className="ccard p-4 text-center">
        <div className="csection-label">{t("home.my_rescues")}</div>
        <div className="font-display text-3xl mt-1">🚑 {rescues}</div>
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