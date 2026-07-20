import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { acceptTerms, fetchTermsAccepted } from "@/lib/legal";
import { toast } from "@/lib/toast";

/** One-time modal for signed-in members who haven't accepted the current
 *  Terms/Privacy version (covers everyone who joined before the legal pack,
 *  and everyone again if TERMS_VERSION is ever bumped). Non-dismissable by
 *  design: acceptance is the lawful-basis paper trail (GDPR art. 7). */
export function ConsentGate() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const accepted = await fetchTermsAccepted();
      if (accepted === false) setShow(true);
    })();
  }, []);

  if (!show) return null;

  async function accept() {
    setBusy(true);
    const ok = await acceptTerms();
    setBusy(false);
    if (ok) setShow(false);
    else toast.error(t("consent.err"));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(43,33,24,0.6)" }}>
      <div className="ccard p-6 w-full max-w-md space-y-4" style={{ background: "var(--cream2)" }}>
        <div className="font-display text-2xl">{t("consent.title")}</div>
        <p className="text-base font-semibold">{t("consent.body")}</p>
        <label className="flex items-start gap-2 font-bold text-[15px] cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={age} onChange={(e) => setAge(e.target.checked)} />
          <span>{t("consent.chk_age")}</span>
        </label>
        <label className="flex items-start gap-2 font-bold text-[15px] cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            {t("consent.chk_terms_pre")}{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_terms_link")}</a>{" "}
            {t("auth.legal_and")}{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_privacy_link")}</a>
          </span>
        </label>
        <button
          disabled={!age || !terms || busy}
          onClick={accept}
          className="cbtn cbtn-coral w-full"
          style={{ opacity: age && terms ? 1 : 0.5 }}
        >
          {busy ? "..." : t("consent.accept")}
        </button>
      </div>
    </div>
  );
}
