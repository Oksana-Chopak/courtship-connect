import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LangToggle, useI18n } from "@/lib/i18n";
import { FLAGS } from "@/lib/flags";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courtship — It's a match. Literally." },
      { name: "description", content: "Tennis partner matching for Uppsala & Stockholm. Free while in beta." },
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

  /* "Warm wash" home (TennisBuddies 10, variant B): real app icon as the logo,
     centered calm column, cities in wood under the subtitle, ONE pulsing coral
     CTA anchored at the bottom (thumb reach) with the language toggle just
     above it, quiet text link + legal footer. One door in — a first-time
     visitor froze in front of three loud CTAs (2026-08-06 report). */
  const ctaStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "center",
    background: "#F0705B", color: "#FFF6E8", borderRadius: 12,
    padding: "16px 20px", fontWeight: 700, fontSize: 15.5,
    boxShadow: "0 10px 22px rgba(240,112,91,0.28)",
  };

  return (
    <div className="terry-bg text-[var(--ink)] font-body" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* the CTA's soft heartbeat (.cs-pulse) now lives in styles.css —
          shared with the Board hero so the two buttons can never drift */}
      <div style={{ width: "100%", maxWidth: 430, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "64px 32px 60px", boxSizing: "border-box" }}>
        <img src="/icon-512.png" width={92} height={92} alt="Courtship" style={{ display: "block", borderRadius: "22%", marginTop: 4 }} />
        <h1 className="font-display" style={{ fontSize: 40, lineHeight: 1.3, marginTop: 24 }}>
          {t("index.match_a")}<br />
          <span style={{ color: "var(--coral)" }}>{t("index.match_b")}</span>
        </h1>
        <p style={{ fontWeight: 500, fontSize: 15, color: "rgba(43,33,24,0.6)", marginTop: 14, maxWidth: 268, lineHeight: 1.45 }}>
          {t("brand.subtitle")}
        </p>
        <div style={{ marginTop: 16 }}>
          <div className="font-display" style={{ fontSize: 16, color: "#8C5A33", whiteSpace: "nowrap" }}>📍 {t("brand.cities")}</div>
          <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(43,33,24,0.38)", marginTop: 4 }}>{t("brand.beta_tag")}</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: 20 }}><LangToggle /></div>
        {FLAGS.guestPeek ? (
          <Link to="/board" className="cs-pulse" style={ctaStyle}>
            {t("index.cta_peek")}
          </Link>
        ) : (
          <Link to="/auth" search={{ mode: "signup" }} className="cs-pulse" style={ctaStyle}>
            {t("index.cta_peek")}
          </Link>
        )}
        <Link to="/auth" search={{ mode: "login" }} style={{ marginTop: 13, fontWeight: 700, fontSize: 13, color: "#8C5A33", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t("index.cta_have_account")}
        </Link>
        <div style={{ marginTop: 16, fontWeight: 600, fontSize: 10.5, color: "rgba(43,33,24,0.32)" }}>
          <Link to="/privacy" style={{ textDecoration: "underline" }}>{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" style={{ textDecoration: "underline" }}>{t("legal.footer_terms")}</Link>
        </div>
      </div>
    </div>
  );
}
