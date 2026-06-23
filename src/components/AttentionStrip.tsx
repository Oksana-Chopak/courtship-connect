import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPendingPostGameChecks, confirmGame, reportNoshow, archiveGame, type GameRow } from "@/lib/games";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { whenLabel, URGENCY_WINDOW_HOURS } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { notifySos } from "@/lib/push";

export function AttentionStrip({ onChange }: { onChange?: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<GameRow[]>([]);
  const [pendingMeta, setPendingMeta] = useState<Record<string, { court: string; other: string; otherName: string }>>({});
  const [flarePrompts, setFlarePrompts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const pendingRows = await fetchPendingPostGameChecks(u.user.id);
      setPending(pendingRows);
      if (pendingRows.length) {
        const sosIds = Array.from(new Set(pendingRows.map((g) => g.sos_id).filter(Boolean) as string[]));
        const otherIds = Array.from(new Set(pendingRows.map((g) => (g.player_a === u.user!.id ? g.player_b : g.player_a))));
        const [{ data: sosRows }, { data: pubs }] = await Promise.all([
          sosIds.length ? (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds) : Promise.resolve({ data: [] }),
          (supabase as any).rpc("players_directory", { _ids: otherIds }),
        ]);
        const courtIds = Array.from(new Set(((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean)));
        const { data: cs } = courtIds.length
          ? await (supabase as any).from("courts").select("id,name").in("id", courtIds)
          : { data: [] as any[] };
        const sosToCourt = new Map<string, string>(((sosRows as any[]) ?? []).map((s) => [s.id, s.court_id]));
        const courtName = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
        const nameById = new Map<string, string>(((pubs as any[]) ?? []).map((p) => [p.id, p.name]));
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
    })();
  }, []);

  async function onConfirm(g: GameRow) {
    try { await confirmGame(g.id); toast.success(t("home.confirmed")); setPending((p) => p.filter((x) => x.id !== g.id)); }
    catch (e: any) { oops(e); }
  }
  async function onNoshow(g: GameRow) {
    try { await reportNoshow(g.id); toast.success(t("home.reported_noshow")); setPending((p) => p.filter((x) => x.id !== g.id)); }
    catch (e: any) { oops(e); }
  }
  async function onArchive(g: GameRow) {
    try { await archiveGame(g.id); toast.success(t("home.archived")); setPending((p) => p.filter((x) => x.id !== g.id)); }
    catch (e: any) { oops(e); }
  }
  async function fireFlare(sosId: string) {
    const { error } = await (supabase as any)
      .from("sos_requests")
      .update({ kind: "sos", flared_at: new Date().toISOString() })
      .eq("id", sosId);
    if (error) { oops(error); return; }
    void notifySos(sosId);
    toast.success(t("post.flare_fired"));
    setFlarePrompts((p) => p.filter((x) => x.id !== sosId));
    onChange?.();
  }

  if (pending.length === 0 && flarePrompts.length === 0) return null;

  return (
    <div className="space-y-4">
      {flarePrompts.map((g) => (
        <div key={g.id} className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
          <div className="font-display text-2xl">{t("home.flare_prompt_title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold">{whenLabel(g.play_at)}</div>
          <button onClick={() => fireFlare(g.id)} className="cbtn cbtn-coral w-full">{t("home.flare_prompt_cta")}</button>
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
              <div className="font-display text-2xl mt-1 leading-tight">{t("home.pending_q", { court })}</div>
            </div>
            <div className="space-y-2">
              <button onClick={() => onConfirm(g)} className="cbtn cbtn-green w-full">{t("home.yes_we_played")}</button>
              <button onClick={() => onArchive(g)} className="cbtn cbtn-ghost w-full">{t("home.didnt_happen")}</button>
              <button onClick={() => onNoshow(g)} className="cbtn cbtn-ghost w-full">{t("home.player_noshow", { name: otherName })}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
