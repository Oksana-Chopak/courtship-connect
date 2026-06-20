import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  // without read access to the invite_codes table.
  const { data, error } = await (supabase as any).rpc("check_invite_code", { _code: c });
  if (!error && typeof data === "boolean") return data;
  // Fallback if the RPC isn't deployed yet
  const { data: row } = await (supabase as any)
    .from("invite_codes" as any)
    .select("uses_remaining, active")
    .eq("code", c)
    .maybeSingle();
  const d = row as any;
  return !!d && d.uses_remaining > 0 && d.active !== false;
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

  useEffect(() => {
    rememberNext(next);
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        if (!data.session.user.email_confirmed_at) {
          navigate({ to: "/check-email", search: { email: data.session.user.email ?? "" } });
          return;
        }
        const has = await userHasProfile(data.session.user.id);
        if (has) landOrBoard();
        else navigate({ to: "/onboarding" });
      }
    });
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
        if (!data.session) {
          navigate({ to: "/check-email", search: { email } });
          return;
        }
        if (!data.user?.email_confirmed_at) {
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

  return (
    <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-5">
        <div className="flex justify-end -mb-2"><LangToggle /></div>
        <div>
          <div className="csection-label mb-2">{t("brand.uppsala_beta")}</div>
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
          <button disabled={busy} className="cbtn cbtn-coral w-full">
            {busy ? "..." : mode === "signup" ? t("auth.create_account") : t("auth.sign_in")}
          </button>
        </form>

        <div className="text-center text-sm">
          {mode === "signup" ? (
            <>{t("auth.have_account")} <Link to="/auth" search={{ mode: "login" }} className="underline font-extrabold">{t("auth.go_login")}</Link></>
          ) : (
            <>{t("auth.no_account")} <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">{t("auth.go_signup")}</Link></>
          )}
        </div>
      </div>
    </div>
  );
}