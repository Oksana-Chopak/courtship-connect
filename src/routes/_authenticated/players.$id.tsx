import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji, whatsappLink } from "@/lib/courtship";
import { RescuerBadge } from "@/components/RescuerBadge";
import { ActivityBadge } from "@/components/ActivityBadge";
import { Avatar } from "@/components/Avatar";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import {
  isBuddyWith,
  hasOutgoingRequest,
  requestBuddy,
  removeBuddy,
} from "@/lib/buddies";

export const Route = createFileRoute("/_authenticated/players/$id")({
  head: () => ({ meta: [{ title: "Player — Courtship" }] }),
  component: PlayerDetail,
});

function PlayerDetail() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [buddyState, setBuddyState] = useState<"none" | "pending" | "buddy">("none");
  const getPhone = useServerFn(getProfilePhone);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        setMeId(u.user.id);
        if (u.user.id !== id) {
          if (await isBuddyWith(u.user.id, id)) setBuddyState("buddy");
          else if (await hasOutgoingRequest(u.user.id, id)) setBuddyState("pending");
        }
      }
      const { data } = await (supabase as any).rpc("players_directory", { _ids: [id] });
      setP((data as any[])?.[0] ?? null);
    })();
  }, [id]);

  if (!p) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;

  const lm = levelMeta(p.level);

  async function openWhatsapp() {
    // Sync-open the tab in the gesture, redirect after the async fetch (avoids
    // popup-block and iframe ERR_BLOCKED_BY_RESPONSE).
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    try {
      const { phone, name } = await getPhone({ data: { targetId: id } });
      const url = whatsappLink(phone, name);
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) {
      if (w) w.close();
      oops(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/players" className="text-sm font-extrabold underline">
        {t("players.back")}
      </Link>

      <div className="ccard p-5 space-y-4">
        <div className="flex justify-center">
          <Avatar src={p.photo_url} name={p.name} seed={p.id} size={160} />
        </div>

        <div className="text-center">
          <h1 className="font-display text-3xl">{p.name}{p.last_name ? " " + p.last_name : ""}</h1>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1"><RescuerBadge count={p.rescues_count ?? 0} /><ActivityBadge count={p.games_played ?? 0} /></div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="w-3 h-3 rounded-full" style={{ background: lm.color }} />
            <span className="font-extrabold">{lm.name}</span>
            <span>· {vibeEmoji(p.vibe)}</span>
          </div>
          {p.ghost_badge && (
            <div className="mt-2 inline-block text-xs font-extrabold uppercase tracking-wider px-2 py-1 rounded-full border-2 border-[var(--ink)] bg-[var(--cream2)]">
              {t("player.ghosted")}
            </div>
          )}
        </div>

        {(p.bio || p.fav_shot) && (
          <div className="space-y-2">
            {p.bio && <p className="text-base text-[var(--ink)] text-center">{p.bio}</p>}
            {p.fav_shot && (
              <div className="text-center">
                <span className="inline-block text-sm font-extrabold px-2.5 py-1 rounded-full" style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>🎾 {p.fav_shot}</span>
              </div>
            )}
          </div>
        )}

        <button
          disabled={busy}
          onClick={openWhatsapp}
          className="cbtn cbtn-green w-full"
        >
          {t("players.message_wa")}
        </button>

        {meId && meId !== id && (
          <>
            {buddyState === "buddy" ? (
              <button
                disabled={busy}
                onClick={async () => {
                  if (typeof window !== "undefined" && !window.confirm(t("buddy.confirm_remove"))) return;
                  setBusy(true);
                  try {
                    await removeBuddy(id);
                    setBuddyState("none");
                    toast.success(t("buddy.removed"));
                  } catch (e: any) { oops(e); }
                  setBusy(false);
                }}
                className="cbtn cbtn-ghost w-full"
              >
                {t("buddy.is_buddy")} · {t("buddy.remove")}
              </button>
            ) : buddyState === "pending" ? (
              <button disabled className="cbtn cbtn-ghost w-full opacity-70">{t("buddy.requested")}</button>
            ) : (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await requestBuddy(id);
                    setBuddyState("pending");
                    toast.success(t("buddy.request_sent"));
                  } catch (e: any) { oops(e); }
                  setBusy(false);
                }}
                className="cbtn cbtn-coral w-full"
              >
                {t("buddy.add")}
              </button>
            )}
          </>
        )}

        <Row label={t("city.label")}>📍 {p.home_city ?? "—"}</Row>
        <Row label={t("player.formats")}>{p.formats?.join(" · ") || "—"}</Row>
        <Row label={t("player.when")}>{p.play_times?.join(" · ") || "—"}</Row>
        <Row label={t("player.looking_for")}>{p.looking_for}</Row>
        <Row label={t("player.home_courts")}>{p.home_courts || "—"}</Row>
        <Row label={t("player.buddy")}>{p.buddy_optin === "yes" ? t("player.buddy_yes_radius", { km: p.buddy_radius_km ?? 10 }) : p.buddy_optin}</Row>
        <Row label={t("player.rescues")}>🚑 {p.rescues_count ?? 0}</Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--ink)]/15 pt-2">
      <span className="csection-label">{label}</span>
      <span className="font-semibold text-right">{children}</span>
    </div>
  );
}