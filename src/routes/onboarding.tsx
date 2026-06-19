import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";
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
  const { t } = useI18n();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", search: { mode: "signup" } });
      else setUid(data.session.user.id);
    });
  }, [navigate]);

  if (!uid) return <div className="terry-bg min-h-screen" />;

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
              const { home_cities, last_name, ...rest } = v;
              const payload: any = { id: uid, ...rest };
              if (signupCode) payload.signup_code = signupCode;
              const { error } = await supabase
                .from("profiles" as any)
                .upsert(payload, { onConflict: "id" })
                .select("id");
              if (!error) {
                await supabase.from("profiles" as any).update({ home_cities, last_name }).eq("id", uid).select("id");
              }
              setBusy(false);
              if (error) {
                toast.error(error.message);
                return;
              }
              try { localStorage.removeItem(SIGNUP_CODE_KEY); } catch {}
              toast.success(t("onboarding.welcome_in"));
              try {
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                  await Notification.requestPermission();
                }
              } catch {}
              navigate({ to: "/board" });
            }}
          />
        </div>
      </div>
    </div>
  );
}