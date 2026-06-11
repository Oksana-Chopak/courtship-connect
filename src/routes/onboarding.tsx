import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — Courtship" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          <h1 className="font-display text-4xl mt-1">Make your profile</h1>
          <p className="text-[var(--ink)]/70 font-semibold">
            Tell us how you like to play. We'll match the vibe.
          </p>
        </div>
        <div className="ccard p-5">
          <ProfileWizard
            initial={emptyProfile}
            userId={uid}
            submitLabel="Save & see players"
            busy={busy}
            onSubmit={async (v: ProfileFormValues) => {
              setBusy(true);
              const { error } = await supabase
                .from("profiles" as any)
                .insert({ id: uid, ...v });
              setBusy(false);
              if (error) return toast.error(error.message);
              toast.success("You're in. Game on.");
              navigate({ to: "/players" });
            }}
          />
        </div>
      </div>
    </div>
  );
}