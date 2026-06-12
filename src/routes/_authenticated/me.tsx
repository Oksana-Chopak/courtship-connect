import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Edit profile — Courtship" }] }),
  component: MePage,
});

function MePage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);

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
        buddy_optin: d.buddy_optin ?? "sometimes",
        buddy_radius_km: d.buddy_radius_km ?? 10,
      });
    })();
  }, [navigate]);

  if (!initial || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">Your profile</h1>
        <p className="text-[var(--ink)] font-semibold">Tweak until it feels right.</p>
      </div>
      <div className="ccard p-5">
        <ProfileWizard
          initial={initial ?? emptyProfile}
          userId={uid}
          submitLabel="Save changes"
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
            toast.success("Updated 🎾");
          }}
        />
      </div>
    </div>
  );
}