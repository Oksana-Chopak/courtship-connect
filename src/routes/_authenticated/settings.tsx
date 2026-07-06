import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n, LangToggle } from "@/lib/i18n";
import { ProfileWizard, emptyProfile, rowToProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { PushControls } from "@/components/PushControls";
import { Collapsible } from "@/components/Collapsible";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Courtship" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      const d = data as any;
      setIsAdmin(!!d.is_admin);
      setInitial(rowToProfile(d));
    })();
  }, [navigate]);

  if (!initial || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl">{t("settings.title")}</h1>
        <LangToggle className="shrink-0" />
      </div>

      <div className="ccard p-5">
        <ProfileWizard
          initial={initial ?? emptyProfile}
          userId={uid}
          submitLabel={t("me.save")}
          savedState
          savedLabel={t("me.saved")}
          busy={busy}
          onSubmit={async (v: ProfileFormValues) => {
            setBusy(true);
            const { error } = await (supabase as any).rpc("save_my_profile", { _data: v });
            if (!error) {
              try {
                const { data: u2 } = await supabase.auth.getUser();
                if (u2.user) {
                  await (supabase as any).from("profiles")
                    .update({ sports: v.sports, experience: v.experience || null, goals: v.goals })
                    .eq("id", u2.user.id);
                }
              } catch { /* pre-SQL */ }
            }
            setBusy(false);
            if (error) {
              oops(error);
              return;
            }
            setInitial(v);
            toast.success(t("me.updated"));
          }}
          onProgress={async (v: ProfileFormValues) => {
            try { await (supabase as any).rpc("save_my_profile", { _data: v }); } catch { /* best-effort auto-save */ }
          }}
        />
      </div>

      <Collapsible title={`🔔 ${t("push.title")}`}>
        <PushControls bare />
      </Collapsible>

      {isAdmin && (
        <Link to="/admin" className="ccard p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl">{t("admin.title")}</div>
            <div className="text-base text-[var(--ink)] font-semibold">{t("admin.tag")}</div>
          </div>
          <div className="text-2xl">🛠️</div>
        </Link>
      )}

      <button
        type="button"
        onClick={() => setConfirmSignout(true)}
        className="cbtn cbtn-ghost w-full"
      >
        {t("auth.signout")}
      </button>

      {confirmSignout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }} onClick={() => setConfirmSignout(false)}>
          <div className="ccard p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="font-display text-2xl">{t("auth.signout_confirm_title")}</div>
            <div className="text-base font-semibold text-[var(--ink)]">{t("auth.signout_confirm_body")}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSignout(false)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  toast.success(t("auth.signed_out"));
                  window.location.href = "/";
                }}
                className="cbtn cbtn-coral flex-1"
              >
                {t("auth.signout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
