import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

const KEY = "courtship.getstarted.dismissed";

// Calm onboarding nudge: a single subtle row, no loud accent colour, and it only
// shows the steps that are NOT done yet (profile is already done by the time you
// see a board; invite hides once someone joins via your code). Dismissible.
export function GetStarted() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const [inviteDone, setInviteDone] = useState(true); // assume done to avoid flashing the step

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("my_invite_uses");
        if (!cancelled) setInviteDone((Number(data) || 0) > 0);
      } catch { /* RPC not deployed — keep the row minimal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="rounded-xl border border-[var(--ink)]/15 px-3 py-2 flex items-center gap-3 text-sm" style={{ background: "var(--cream2)" }}>
      <span className="opacity-60 shrink-0">{t("gs.title")}</span>
      <div className="flex-1 flex gap-4 flex-wrap">
        {!inviteDone && (
          <Link to="/me" className="font-extrabold underline">{t("gs.step2")}</Link>
        )}
        <Link to="/sos/new" search={{ planned: undefined }} className="font-extrabold underline">{t("gs.step3")}</Link>
      </div>
      <button onClick={dismiss} aria-label={t("gs.dismiss")} className="opacity-40 shrink-0">✕</button>
    </div>
  );
}
