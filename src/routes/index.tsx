import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LangToggle, useI18n } from "@/lib/i18n";
import { FLAGS } from "@/lib/flags";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courtship — It's a match. Literally." },
      { name: "description", content: "Tennis partner matching for Uppsala & Stockholm. Invite-only beta." },
      { property: "og:title", content: "Courtship" },
      { property: "og:description", content: "Find your hitting partner in Uppsala & Stockholm." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // While we figure out if there's already a session (e.g. the user just landed
  // here from an email-confirmation link, which silently signs them in), hold
  // off rendering the marketing landing so they don't see a "choose again"
  // screen and get bounced straight into the app instead.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let routed = false;
    const go = async (session: any) => {
      if (routed || !session) return;
      routed = true;
      if (!session.user.email_confirmed_at) {
        navigate({ to: "/check-email", search: { email: session.user.email ?? "" } });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();
      navigate({ to: prof ? "/board" : "/onboarding" });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        go(data.session);
      } else {
        // Could be mid-processing of a confirmation redirect (token still in the
        // URL). Give SIGNED_IN a brief moment before falling back to the landing.
        const authCallback =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token") || window.location.search.includes("code="));
        if (authCallback) setTimeout(() => { if (!routed) setReady(true); }, 1500);
        else setReady(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) return <div className="terry-bg min-h-screen" />;

  return (
    <div className="terry-bg min-h-screen flex flex-col items-center justify-center px-6 text-[var(--ink)] font-body">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-end"><LangToggle /></div>
        <div className="space-y-0.5 text-xs font-extrabold tracking-widest uppercase">
          <div>{t("brand.cities")}</div>
          <div className="text-[var(--ink)]/50 font-semibold">{t("brand.beta_tag")}</div>
        </div>
        <h1 className="font-display text-6xl leading-[0.95]">
          {t("index.match_a")}<br/>
          <span className="text-[var(--coral)]">{t("index.match_b")}</span>
        </h1>
        <p className="text-lg text-[var(--ink)] font-semibold">
          {t("brand.subtitle")}
        </p>
        <div className="flex flex-col gap-3 pt-2">
          {FLAGS.guestPeek && (
            <Link to="/board" className="cbtn cbtn-coral">
              {t("index.cta_peek")}
            </Link>
          )}
          <Link to="/post" className="cbtn cbtn-green">
            🎾 {t("index.cta_post")}
          </Link>
          <Link to="/auth" search={{ mode: "signup" }} className={FLAGS.guestPeek ? "cbtn cbtn-ghost" : "cbtn cbtn-coral"}>
            {t("index.cta_invite")}
          </Link>
          <Link to="/auth" search={{ mode: "login" }} className="text-sm font-extrabold underline pt-1" style={{ color: "var(--wood, #8a6d3b)" }}>
            {t("index.cta_have_account")}
          </Link>
        </div>
      </div>
    </div>
  );
}
