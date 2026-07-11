import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { consumeNext } from "@/lib/share";
import { peekDraftGame } from "@/lib/draftGame";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, rowToProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "@/lib/toast";
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
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // If the invite gate ever rejects the save, we stash the filled-in answers
  // here and let the user drop in a fresh code and finish — instead of a
  // dead-end toast that throws away everything they typed.
  const [pendingProfile, setPendingProfile] = useState<ProfileFormValues | null>(null);
  const [retryCode, setRetryCode] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/auth", search: { mode: "signup" } }); return; }
      setUid(data.session.user.id);
      // Resume anything saved on a previous (possibly unfinished) visit.
      try {
        const { data: prof } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
        setInitial(prof ? rowToProfile(prof) : emptyProfile);
      } catch {
        setInitial(emptyProfile);
      }
    })();
  }, [navigate]);

  async function finishSuccess() {
    try { localStorage.removeItem(SIGNUP_CODE_KEY); } catch {}
    toast.success(t("onboarding.welcome_in"));
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {}
    const _n = consumeNext();
    if (_n) { window.location.href = _n; return; }
    setDone(true);
  }

  // "ok" | "invite" (recoverable invite-gate failure) | "other"
  async function saveProfile(v: ProfileFormValues, code: string): Promise<"ok" | "invite" | "other"> {
    const { error } = await (supabase as any).rpc("save_my_profile", { _data: { ...v, signup_code: code } });
    if (!error) {
    // New profile dimensions (sports/experience/goals) are written directly to
    // the own row (RLS-guarded) instead of widening the security-critical
    // save_my_profile RPC. Best-effort: an older DB without the columns just skips.
    try {
      const { data: u2 } = await supabase.auth.getUser();
      if (u2.user) {
        await (supabase as any).from("profiles")
          .update({ sports: v.sports, experience: v.experience || null, goals: v.goals })
          .eq("id", u2.user.id);
      }
    } catch { /* pre-SQL */ }
      return "ok";
    }
    const m = String(error.message || "");
    if (m.includes("invite_required")) { toast.error(t("inv.required")); return "invite"; }
    if (m.includes("invite_invalid")) { toast.error(t("inv.invalid")); return "invite"; }
    oops(error);
    return "other";
  }

  async function handleSubmit(v: ProfileFormValues) {
    setBusy(true);
    let signupCode = "";
    try {
      const { data: u } = await supabase.auth.getUser();
      signupCode =
        ((u.user?.user_metadata as any)?.signup_code as string | undefined) ||
        (typeof window !== "undefined" ? localStorage.getItem(SIGNUP_CODE_KEY) || "" : "") ||
        "";
    } catch {}
    const res = await saveProfile(v, signupCode);
    setBusy(false);
    if (res === "ok") { await finishSuccess(); return; }
    if (res === "invite") { setPendingProfile(v); setRetryCode(""); }
  }

  // Persist progress on each step so an unfinished onboarding never loses data
  // (photos, name, etc.). Best-effort: the final submit remains the source of truth.
  async function saveProgress(v: ProfileFormValues) {
    try {
      const { data: u } = await supabase.auth.getUser();
      const code =
        ((u.user?.user_metadata as any)?.signup_code as string | undefined) ||
        (typeof window !== "undefined" ? localStorage.getItem(SIGNUP_CODE_KEY) || "" : "") ||
        "";
      await (supabase as any).rpc("save_my_profile", { _data: { ...v, signup_code: code } });
    } catch { /* ignore — final submit will surface any real error */ }
  }

  async function handleRetry() {
    const code = retryCode.trim().toUpperCase();
    if (code.length < 3) { toast.error(t("auth.invite_bad")); return; }
    setBusy(true);
    try {
      const { data: ok } = await (supabase as any).rpc("check_invite_code", { _code: code });
      if (ok !== true) { setBusy(false); toast.error(t("auth.invite_bad")); return; }
    } catch { setBusy(false); toast.error(t("auth.invite_bad")); return; }
    const res = await saveProfile(pendingProfile as ProfileFormValues, code);
    setBusy(false);
    if (res === "ok") { setPendingProfile(null); await finishSuccess(); }
  }

  if (!uid || !initial) return <div className="terry-bg min-h-screen" />;

  if (done) {
    return (
      <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
        <div className="max-w-md mx-auto">
          <div className="ccard p-6 text-center space-y-4">
            <div className="text-5xl">🎾</div>
            <h1 className="font-display text-3xl leading-tight">{t("ob.first_title")}</h1>
            <p className="font-semibold" style={{ opacity: 0.75 }}>{t("ob.first_sub")}</p>
            {!peekDraftGame() && (
              <button onClick={() => navigate({ to: "/sos/new", search: { edit: undefined } })} className="cbtn cbtn-coral w-full">🎾 {t("ob.first_post")}</button>
            )}
            <button onClick={() => navigate({ to: "/board" })} className={`cbtn w-full ${peekDraftGame() ? "cbtn-coral" : "cbtn-green"}`}>{t("ob.first_go")}</button>
            <button onClick={() => navigate({ to: "/matches", search: { log: true } })} className="cbtn cbtn-ghost w-full">✅ {t("ob.first_log")}</button>
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
          <h1 className="font-display text-4xl mt-1">{t("onboarding.title")}</h1>
          <p className="text-[var(--ink)] font-semibold">{t("onboarding.sub")}</p>
        </div>

        {pendingProfile && (
          <div className="ccard p-5 space-y-3" style={{ borderColor: "var(--coral)" }}>
            <div className="font-display text-xl">{t("inv.retry_title")}</div>
            <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("inv.retry_sub")}</div>
            <div>
              <label className="csection-label block mb-1">{t("inv.retry_label")}</label>
              <input
                className="cinput tracking-widest uppercase"
                placeholder="UPPSALA80"
                value={retryCode}
                onChange={(e) => setRetryCode(e.target.value)}
              />
            </div>
            <button onClick={handleRetry} disabled={busy} className="cbtn cbtn-coral w-full">
              {busy ? "..." : t("inv.retry_cta")}
            </button>
          </div>
        )}

        <div className="ccard p-5">
          <ProfileWizard
            initial={initial}
            userId={uid}
            submitLabel={t("wiz.save_see")}
            busy={busy}
            onSubmit={handleSubmit}
            onProgress={saveProgress}
          />
        </div>
      </div>
    </div>
  );
}
