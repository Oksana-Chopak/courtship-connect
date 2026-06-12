import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const search = z.object({
  email: z.string().optional().default(""),
});

export const Route = createFileRoute("/check-email")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Check your email — Courtship" }] }),
  component: CheckEmail,
});

const COOLDOWN_KEY = "courtship.resend.lastAt";
const COOLDOWN_SECONDS = 30;

function CheckEmail() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If user is already confirmed, bounce them forward.
  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user?.email_confirmed_at) {
        navigate({ to: "/onboarding" });
      }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email_confirmed_at) {
        navigate({ to: "/onboarding" });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Cooldown ticker (persists across reloads via localStorage).
  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
      const left = Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - last) / 1000));
      setSecondsLeft(left);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function resend() {
    if (secondsLeft > 0 || sending) return;
    if (!email) {
      toast.error("We don't know which email to resend to. Try signing up again.");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      setSecondsLeft(COOLDOWN_SECONDS);
      toast.success("Email sent again. Check your inbox 📩");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't resend right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="terry-bg min-h-screen px-6 py-10 flex items-start justify-center font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-7">
        <div className="text-center">
          <div className="text-7xl leading-none" aria-hidden="true">📩</div>
          <h1 className="font-display text-5xl mt-4 leading-tight">
            Check your email
          </h1>
        </div>

        {email && (
          <div className="text-center">
            <div className="csection-label mb-1">We sent it to</div>
            <div className="text-2xl font-extrabold break-all">{email}</div>
          </div>
        )}

        <ol className="space-y-4 text-xl font-semibold leading-snug">
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">1</span>
            <span>Open your email app</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">2</span>
            <span>Find the email from Courtship</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">3</span>
            <span>Tap the <span className="font-extrabold">"Confirm my email"</span> button inside it</span>
          </li>
        </ol>

        <div className="space-y-2">
          <button
            onClick={resend}
            disabled={secondsLeft > 0 || sending}
            className="cbtn cbtn-coral w-full text-lg"
          >
            {sending
              ? "Sending..."
              : secondsLeft > 0
                ? `Resend email (${secondsLeft}s)`
                : "Resend email"}
          </button>
          <p className="text-base text-[var(--ink)]/70 font-semibold text-center">
            Didn't get it? Check your spam folder.
          </p>
        </div>

        <div className="border-t-2 border-[var(--ink)]/15 pt-4 text-center text-base">
          Wrong address?{" "}
          <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">
            Start over
          </Link>
        </div>
      </div>
    </div>
  );
}