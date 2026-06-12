import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const search = z.object({
  mode: z.enum(["signup", "login"]).optional().default("signup"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Sign in — Courtship" }] }),
  component: AuthPage,
});

async function checkInvite(code: string) {
  const { data, error } = await supabase
    .from("invite_codes" as any)
    .select("code, uses_remaining, active")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) return false;
  const d = data as any;
  return !!d && d.uses_remaining > 0 && d.active !== false;
}

async function userHasProfile(id: string) {
  const { data } = await supabase
    .from("profiles_public" as any)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return !!data;
}

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const has = await userHasProfile(data.session.user.id);
        navigate({ to: has ? "/home" : "/onboarding" });
      }
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const ok = await checkInvite(invite);
        if (!ok) {
          toast.error("That invite code doesn't work. Beta is invite-only.");
          setBusy(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm, then sign in.");
          navigate({ to: "/auth", search: { mode: "login" } });
          return;
        }
        navigate({ to: "/onboarding" });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const has = await userHasProfile(data.user.id);
        navigate({ to: has ? "/home" : "/onboarding" });
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
        <div>
          <div className="csection-label mb-2">Courtship · Uppsala</div>
          <h1 className="font-display text-4xl">
            {mode === "signup" ? "Join the club" : "Welcome back"}
          </h1>
          <p className="text-[var(--ink)]/70 font-semibold mt-1">
            {mode === "signup" ? "Invite-only beta. Got a code?" : "Time for a hit."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="csection-label block mb-1">Invite code</label>
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
            <label className="csection-label block mb-1">Email</label>
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
            <label className="csection-label block mb-1">Password</label>
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
            {busy ? "..." : mode === "signup" ? "Create account 🎾" : "Sign in"}
          </button>
        </form>

        <div className="text-center text-sm">
          {mode === "signup" ? (
            <>Already in? <Link to="/auth" search={{ mode: "login" }} className="underline font-extrabold">Sign in</Link></>
          ) : (
            <>New here? <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">Get an invite</Link></>
          )}
        </div>
      </div>
    </div>
  );
}