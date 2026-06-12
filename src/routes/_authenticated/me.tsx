import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";
import { LangToggle, useI18n } from "@/lib/i18n";
import { fetchMyBuddies, removeBuddy, buddySourceLabel, type BuddyRow } from "@/lib/buddies";
import { Avatar } from "@/components/Avatar";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Edit profile — Courtship" }] }),
  component: MePage,
});

function MePage() {
  const { t } = useI18n();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [buddies, setBuddies] = useState<Array<BuddyRow & { other_id: string; name: string; photo_url: string | null; home_city: string | null }>>([]);

  async function loadBuddies(u: string) {
    const rows = await fetchMyBuddies(u);
    const others = rows.map((b) => (b.user_low === u ? b.user_high : b.user_low));
    if (!others.length) { setBuddies([]); return; }
    const { data } = await (supabase as any)
      .from("profiles_public")
      .select("id,name,photo_url,home_city")
      .in("id", others);
    const byId = new Map<string, any>((data as any[] | null)?.map((d) => [d.id, d]) ?? []);
    setBuddies(rows.map((b) => {
      const oid = b.user_low === u ? b.user_high : b.user_low;
      const p = byId.get(oid) ?? {};
      return { ...b, other_id: oid, name: p.name ?? "Player", photo_url: p.photo_url ?? null, home_city: p.home_city ?? null };
    }));
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await supabase
        .from("profiles" as any)
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      const d = data as any;
      setInitial({
        name: d.name ?? "",
        phone_e164: d.phone_e164 ?? "",
        photo_url: d.photo_url ?? "",
        level: d.level ?? 3,
        formats: d.formats ?? [],
        play_times: d.play_times ?? [],
        vibe: d.vibe ?? "friendly",
        looking_for: d.looking_for ?? "both",
        home_courts: d.home_courts ?? "",
        home_city: d.home_city ?? "Uppsala",
        buddy_optin: d.buddy_optin ?? "sometimes",
        buddy_radius_km: d.buddy_radius_km ?? 10,
        buddy_sos_optin: d.buddy_sos_optin ?? true,
      });
      loadBuddies(u.user.id);
    })();
  }, [navigate]);

  if (!initial || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("me.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("me.sub")}</p>
      </div>
      <div className="ccard p-4 flex items-center justify-between">
        <div className="font-extrabold">{t("me.language")}</div>
        <LangToggle />
      </div>

      <div className="ccard p-4 space-y-3">
        <div className="font-display text-2xl">{t("buddy.my_buddies")}</div>
        {buddies.length === 0 ? (
          <div className="text-sm text-[var(--ink)]">{t("buddy.no_buddies")}</div>
        ) : (
          buddies.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3">
              <Avatar src={b.photo_url} name={b.name} seed={b.other_id} size={56} />
              <div className="flex-1 min-w-0">
                <Link to="/players/$id" params={{ id: b.other_id }} className="font-extrabold underline truncate block">
                  {b.name}
                </Link>
                <div className="text-sm text-[var(--ink)]">
                  📍 {b.home_city ?? "—"} · {t(`buddy.source.${b.source}` as any)}
                </div>
              </div>
              <button
                className="cbtn cbtn-ghost"
                onClick={async () => {
                  if (typeof window !== "undefined" && !window.confirm(t("buddy.confirm_remove"))) return;
                  try {
                    await removeBuddy(b.other_id);
                    setBuddies((p) => p.filter((x) => x.id !== b.id));
                    toast.success(t("buddy.removed"));
                  } catch (e: any) { toast.error(e?.message ?? "Error"); }
                }}
              >
                {t("buddy.remove")}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="ccard p-5">
        <ProfileWizard
          initial={initial ?? emptyProfile}
          userId={uid}
          submitLabel={t("me.save")}
          busy={busy}
          onSubmit={async (v: ProfileFormValues) => {
            setBusy(true);
            const { error } = await supabase
              .from("profiles" as any)
              .update(v)
              .eq("id", uid);
            setBusy(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success(t("me.updated"));
          }}
        />
      </div>
    </div>
  );
}