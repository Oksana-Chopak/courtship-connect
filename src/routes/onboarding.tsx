import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { consumeNext } from "@/lib/share";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";

const SIGNUP_CODE_KEY = "courtship.signup_code";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — Courtship" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", search: { mode: "signup" } });
      else setUid(data.session.user.id);
    });
  }, [navigate]);

  if (!uid) return <div className="terry-bg min-h-screen" />;

  if (done) {
    return (
      <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
        <div className="max-w-md mx-auto">
          <div className="ccard p-6 text-center space-y-4">
            <div className="text-5xl">🎾</div>
            <h1 className="font-display text-3xl leading-tight">{t("ob.first_title")}</h1>
            <p className="font-semibold" style={{ opacity: 0.75 }}>{t("ob.first_sub")}</p>
            <button onClick={() => navigate({ to: "/board" })} className="cbtn cbtn-coral w-full">{t("ob.first_go")}</button>
            <button onClick={() => navigate({ to: "/players" })} className="cbtn cbtn-ghost w-full">{t("ob.first_browse")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <div className="csection-label">Step 1 of 1</div>
          <h1 className="font-display text-4xl mt-1">{t("onboarding.title")}</h1>
          <p className="text-[var(--ink)] font-semibold">
            {t("onboarding.sub")}
          </p>
        </div>
        <div className="ccard p-5">
          <ProfileWizard
            initial={emptyProfile}
            userId={uid}
            submitLabel={t("wiz.save_see")}
            busy={busy}
            onSubmit={async (v: ProfileFormValues) => {
              setBusy(true);
              let signupCode: string | null = null;
              try {
                const { data: u } = await supabase.auth.getUser();
                signupCode =
                  ((u.user?.user_metadata as any)?.signup_code as string | undefined) ??
                  (typeof window !== "undefined" ? localStorage.getItem(SIGNUP_CODE_KEY) : null) ??
                  null;
              } catch {}
              const { error } = await (supabase as any).rpc("save_my_profile", {
                _data: { ...v, signup_code: signupCode ?? "" },
              });
              setBusy(false);
              if (error) {
                const m = String(error.message || "");
                if (m.includes("invite_required")) toast.error(t("inv.required"));
                else if (m.includes("invite_invalid")) toast.error(t("inv.invalid"));
                else oops(error);
                return;
              }
              try { localStorage.removeItem(SIGNUP_CODE_KEY); } catch {}
              toast.success(t("onboarding.welcome_in"));
              try {
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                  await Notification.requestPermission();
                }
              } catch {}
              const _n = consumeNext();
              if (_n) {
                window.location.href = _n;
                return;
              }
              setDone(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}