import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fetchMemberLinks, fetchMyTier, type MemberLinks, type MemberTier } from "@/lib/membership";

/** "Become a Founding Member" — patronage, not a paywall. Hidden until the
 *  admin has configured the Stripe links; shows a thank-you state for members. */
export function MembershipCard() {
  const { t, lang } = useI18n();
  const [links, setLinks] = useState<MemberLinks>({});
  const [tier, setTier] = useState<MemberTier>(null);
  const [since, setSince] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const [l, mt] = await Promise.all([
        fetchMemberLinks(),
        uid ? fetchMyTier(uid) : Promise.resolve({ tier: null as MemberTier, since: null }),
      ]);
      setLinks(l);
      setTier(mt.tier);
      setSince(mt.since);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return null;

  if (tier) {
    const sinceLabel = since
      ? new Date(since).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
      : null;
    return (
      <div className="ccard p-4 text-center space-y-1" style={{ background: "var(--green-pop)" }}>
        <div className="text-3xl">🏆</div>
        <div className="font-display text-xl leading-tight">
          {tier === "pro" ? t("mem.thanks_pro") : t("mem.thanks_title")}
        </div>
        <div className="text-sm font-semibold">
          {sinceLabel ? t("mem.thanks_since", { date: sinceLabel }) : t("mem.thanks_sub")}
        </div>
      </div>
    );
  }

  if (!links.monthly && !links.yearly) return null;

  return (
    <div className="ccard p-4 space-y-2" style={{ borderColor: "var(--coral)" }}>
      <div className="font-display text-xl leading-tight">🏆 {t("mem.title")}</div>
      <div className="text-sm font-semibold text-[var(--ink)]/80">{t("mem.pitch")}</div>
      <div className="text-xs font-extrabold" style={{ color: "var(--coral)" }}>{t("mem.founding_note")}</div>
      <div className="flex gap-2 pt-1">
        {links.monthly && (
          <a href={links.monthly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-coral flex-1 text-center">
            {t("mem.monthly")}
          </a>
        )}
        {links.yearly && (
          <a href={links.yearly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost flex-1 text-center">
            {t("mem.yearly")}
          </a>
        )}
      </div>
      <div className="text-[11px] font-semibold text-center text-[var(--ink)]/50">{t("mem.pay_note")}</div>
    </div>
  );
}
