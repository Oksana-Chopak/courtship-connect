import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

const KEY = "courtship.getstarted.dismissed";

// Calm onboarding nudge: title on its own line, action links in a tidy row
// below — no cramped column wrapping. Hides steps already done. Dismissible.
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
    <div className="rounded-xl border border-[var(--ink)]/15 px-3 py-2.5 text-sm relative" style={{ background: "var(--cream2)" }}>
      <button onClick={dismiss} aria-label={t("gs.dismiss")} className="absolute top-1.5 right-2.5 opacity-40 text-base leading-none">✕</button>
      <div className="opacity-60 pr-6">{t("gs.title")}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 font-extrabold">
        {!inviteDone && <Link to="/me" className="underline">{t("gs.step2")}</Link>}
        <Link to="/sos/new" search={{ planned: undefined }} className="underline">{t("gs.step3")}</Link>
      </div>
    </div>
  );
}
