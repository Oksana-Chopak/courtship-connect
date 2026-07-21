import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "@/lib/toast";
import { LangToggle, useI18n } from "@/lib/i18n";
import { rememberNext, consumeNext } from "@/lib/share";

const search = z.object({
  mode: z.enum(["signup", "login"]).optional().default("signup"),
  code: z.string().optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Sign in — Courtship" }] }),
  component: AuthPage,
});

async function checkInvite(code: string) {
  const c = code.trim().toUpperCase();
  // Validate via SECURITY DEFINER RPC so anon (signing-up) users can check a code
  // without read access to the (admin-only) invite_codes table. The old direct-table
  // fallback is now blocked by RLS for normal users, so it only masked errors — gone.
  const { data, error } = await (supabase as any).rpc("check_invite_code", { _code: c });
  if (error) { console.error("check_invite_code failed", error); return false; }
  return data === true;
}

async function userHasProfile(id: string) {
  const { data } = await supabase
    .from("profiles" as any)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return !!data;
}

function AuthPage() {
  const { mode, code, next } = Route.useSearch();
  const navigate = useNavigate();
  const landOrBoard = () => {
    const n = consumeNext();
    if (n) {
      window.location.href = n;
      return;
    }
    navigate({ to: "/board" });
  };
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState((code ?? "").toUpperCase());
  const [busy, setBusy] = useState(false);
  // Legal pack: sign-up requires an 18+ attestation and Terms/Privacy consent
  // (recorded server-side via accept_terms at the end of onboarding).
  const [legalAge, setLegalAge] = useState(false);
  const [legalTerms, setLegalTerms] = useState(false);
  const legalOk = mode !== "signup" || (legalAge && legalTerms);
  // Password recovery: the email link lands back here with a #type=recovery
  // hash — show a set-new-password form instead of bouncing to /board.
  const [recovery, setRecovery] = useState(false);
  const [newPw, setNewPw] = useState("");

  useEffect(() => {
    rememberNext(next);
    const isRecovery = typeof window !== "undefined" && window.location.hash.includes("type=recovery");
    if (isRecovery) setRecovery(true);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && !isRecovery) {
        if (!data.session.user.email_confirmed_at) {
          navigate({ to: "/check-email", search: { email: data.session.user.email ?? "" } });
          return;
        }
        const has = await userHasProfile(data.session.user.id);
        if (has) landOrBoard();
        else navigate({ to: "/onboarding" });
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const code = invite.trim().toUpperCase();
        const ok = await checkInvite(code);
        if (!ok) {
          toast.error(t("auth.invite_bad"));
          setBusy(false);
          return;
        }
        try { localStorage.setItem("courtship.signup_code", code); } catch {}
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { lang, signup_code: code } },
        });
        if (error) throw error;
        // Invite-only app: the invite code is the real gate, so we skip the email
        // round-trip. New users are auto-confirmed at the DB level (trigger), but
        // signUp may still withhold a session — so grab one by signing in and go
        // straight to onboarding. Falls back to the email screen if anything is off.
        let session = data.session;
        if (!session) {
          const { data: si } = await supabase.auth.signInWithPassword({ email, password });
          session = si.session ?? null;
        }
        if (!session) {
          navigate({ to: "/check-email", search: { email } });
          return;
        }
        navigate({ to: "/onboarding" });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          navigate({ to: "/check-email", search: { email } });
          return;
        }
        const has = await userHasProfile(data.user.id);
        if (has) landOrBoard();
        else navigate({ to: "/onboarding" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
        <div className="ccard w-full max-w-md p-7 space-y-5">
          <h1 className="font-display text-4xl">{t("auth.new_pw_title")}</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { error } = await supabase.auth.updateUser({ password: newPw });
                if (error) throw error;
                toast.success(t("auth.pw_updated"));
                setRecovery(false);
                navigate({ to: "/board" });
              } catch (err: any) {
                toast.error(err?.message ?? "Something went wrong");
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-3"
          >
            <div>
              <label className="csection-label block mb-1">{t("auth.password_label")}</label>
              <input type="password" className="cinput" placeholder="••••••••" minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
            </div>
            <button disabled={busy} className="cbtn cbtn-coral w-full">{busy ? "..." : t("auth.new_pw_cta")}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-5">
        <div className="flex justify-end -mb-2"><LangToggle /></div>
        <div>
          <div className="mb-2 text-xs font-extrabold tracking-widest uppercase">
            <div>{t("brand.cities")}</div>
            <div className="text-[var(--ink)]/50 font-semibold">{t("brand.beta_tag")}</div>
          </div>
          <h1 className="font-display text-4xl">
            {mode === "signup" ? t("auth.signup_title") : t("auth.login_title")}
          </h1>
          <p className="text-[var(--ink)] font-semibold mt-1">
            {mode === "signup" ? t("auth.signup_sub") : t("auth.login_sub")}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="csection-label block mb-1">{t("auth.invite_label")}</label>
              <input
                className="cinput tracking-widest uppercase"
                placeholder="UPPSALA80"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="csection-label block mb-1">{t("auth.email_label")}</label>
            <input
              type="email"
              className="cinput"
              placeholder="you@uppsala.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="csection-label block mb-1">{t("auth.password_label")}</label>
            <input
              type="password"
              className="cinput"
              placeholder="••••••••"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {mode === "signup" && (
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 font-bold text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={legalAge} onChange={(e) => setLegalAge(e.target.checked)} />
                <span>{t("auth.legal_age")}</span>
              </label>
              <label className="flex items-start gap-2 font-bold text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={legalTerms} onChange={(e) => setLegalTerms(e.target.checked)} />
                <span>
                  {t("auth.legal_terms_pre")}{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_terms_link")}</a>{" "}
                  {t("auth.legal_and")}{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_privacy_link")}</a>
                </span>
              </label>
            </div>
          )}
          <button disabled={busy || !legalOk} className="cbtn cbtn-coral w-full" style={{ opacity: legalOk ? 1 : 0.5 }}>
            {busy ? "..." : mode === "signup" ? t("auth.create_account") : t("auth.sign_in")}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            className="w-full text-center text-sm font-extrabold underline"
            style={{ opacity: 0.75 }}
            onClick={async () => {
              if (!email.trim()) { toast.error(t("auth.reset_need_email")); return; }
              setBusy(true);
              try {
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: `${window.location.origin}/auth?mode=login`,
                });
                if (error) throw error;
                toast.success(t("auth.reset_sent"));
              } catch (err: any) {
                toast.error(err?.message ?? "Something went wrong");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("auth.forgot")}
          </button>
        )}

        <div className="text-center text-sm">
          {mode === "signup" ? (
            <>{t("auth.have_account")} <Link to="/auth" search={{ mode: "login" }} className="underline font-extrabold">{t("auth.go_login")}</Link></>
          ) : (
            <>{t("auth.no_account")} <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">{t("auth.go_signup")}</Link></>
          )}
        </div>

        <div className="text-center text-xs font-bold" style={{ opacity: 0.6 }}>
          <Link to="/privacy" className="underline">{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("legal.footer_terms")}</Link>
        </div>
      </div>
    </div>
  );
}