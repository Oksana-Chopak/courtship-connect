import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const KEY = "courtship.getstarted.dismissed";

export function GetStarted() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <div className="ccard p-4 relative" style={{ background: "var(--cream2)" }}>
      <button onClick={dismiss} aria-label={t("gs.dismiss")} className="absolute top-2 right-3 text-lg opacity-50">
        ✕
      </button>
      <div className="font-display text-xl pr-6">{t("gs.title")}</div>
      <div className="text-sm text-[var(--ink)] mb-3">{t("gs.sub")}</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-base font-semibold">
          <span>✅</span>
          <span>{t("gs.step1")}</span>
        </div>
        <Link to="/me" className="flex items-center gap-2 text-base font-extrabold underline">
          <span>🎾</span>
          <span>{t("gs.step2")}</span>
        </Link>
        <Link to="/sos/new" search={{ planned: undefined }} className="flex items-center gap-2 text-base font-extrabold underline">
          <span>📅</span>
          <span>{t("gs.step3")}</span>
        </Link>
      </div>
    </div>
  );
}
