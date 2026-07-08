import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fetchMemberLinks, fetchMyTier, fetchSwishNumber, type MemberLinks, type MemberTier } from "@/lib/membership";
import { SwishPayBlock } from "@/components/SwishPayBlock";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Plans — Courtship" }] }),
  component: PlansPage,
});

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0" style={{ color: "var(--coral)" }}>✓</span>
      <span className="text-sm font-semibold text-[var(--ink)]/85">{children}</span>
    </div>
  );
}

function PlansPage() {
  const { t, lang } = useI18n();
  const [links, setLinks] = useState<MemberLinks>({});
  const [tier, setTier] = useState<MemberTier>(null);
  const [swish, setSwish] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const [l, mt, sw] = await Promise.all([
        fetchMemberLinks(),
        uid ? fetchMyTier(uid) : Promise.resolve({ tier: null as MemberTier, since: null }),
        fetchSwishNumber(),
      ]);
      setLinks(l);
      setTier(mt.tier);
      setSwish(sw);
      if (uid) {
        try {
          const { data } = await (supabase as any).from("profiles").select("is_admin,name").eq("id", uid).maybeSingle();
          setIsAdmin(!!data?.is_admin);
          setMyName((data?.name as string | null) ?? "");
        } catch { /* pre-SQL */ }
      }
      setLoaded(true);
    })();
  }, []);

  const foundingAmount = plan === "yearly" ? 690 : 69;
  const foundingTag = `Courtship FOUNDING${plan === "yearly" ? " YEAR" : ""} ${myName || ""}`.trim();

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <div>
        <h1 className="font-display text-3xl leading-none">{t("plans.title")}</h1>
        <p className="text-[var(--ink)] font-semibold mt-1">{t("plans.sub")}</p>
      </div>

      {tier && (
        <div className="ccard p-3 text-center font-extrabold" style={{ background: "var(--green-pop)" }}>
          {tier === "pro" ? t("plans.have_pro") : t("plans.have_founding")}
        </div>
      )}

      {/* ── Founding Member — for players ── */}
      <div className="ccard p-4 space-y-3" style={{ borderColor: "var(--coral)" }}>
        <div>
          <div className="font-display text-2xl leading-tight">🏆 {t("plans.f_title")}</div>
          <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--wood, #8a6d3b)" }}>{t("plans.f_for")}</div>
        </div>
        <div className="text-sm font-semibold text-[var(--ink)]/80">{t("mem.pitch")}</div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPlan("yearly")} className={`cchip w-full justify-center ${plan === "yearly" ? "cchip-on" : ""}`}>{t("mem.plan_yearly")}</button>
          <button type="button" onClick={() => setPlan("monthly")} className={`cchip w-full justify-center ${plan === "monthly" ? "cchip-on" : ""}`}>{t("mem.plan_monthly")}</button>
        </div>
        <div className="text-center font-extrabold">{plan === "yearly" ? t("mem.price_yearly") : t("mem.price_monthly")}</div>
        <div className="text-xs font-extrabold" style={{ color: "var(--coral)" }}>{t("mem.founding_note")}</div>

        <div className="space-y-1.5 pt-1">
          <Perk>{t("plans.f_perk_badge")}</Perk>
          <Perk>{t("plans.f_perk_wall")}</Perk>
          <Perk>{t("plans.f_perk_early")}</Perk>
          <Perk>{t("plans.f_perk_lock")}</Perk>
        </div>

        <div className="rounded-xl px-3 py-2 text-sm font-extrabold" style={{ background: "var(--green-pop)", border: "2px solid var(--ink)" }}>
          🎁 {t("plans.f_referral")}
        </div>

        {tier ? null : links.monthly || links.yearly ? (
          <div className="flex gap-2">
            {links.yearly && <a href={links.yearly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-coral flex-1 text-center">{t("mem.yearly")}</a>}
            {links.monthly && <a href={links.monthly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost flex-1 text-center">{t("mem.monthly")}</a>}
          </div>
        ) : swish ? (
          <>
            <SwishPayBlock number={swish} amountSek={foundingAmount} message={foundingTag} />
            <div className="text-[11px] font-semibold text-center text-[var(--ink)]/55">{t("mem.swish_note")}</div>
          </>
        ) : isAdmin ? (
          <div className="text-sm font-semibold text-[var(--ink)]/70" style={{ borderTop: "1px dashed var(--ink)", paddingTop: 8 }}>{t("mem.admin_setup")}</div>
        ) : null}
      </div>

      {/* ── Courtship Pro — for clubs, coaches, organizers ── */}
      <div className="ccard p-4 space-y-3">
        <div>
          <div className="font-display text-2xl leading-tight">💼 {t("plans.p_title")}</div>
          <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--wood, #8a6d3b)" }}>{t("plans.p_for")}</div>
        </div>
        <div className="text-sm font-semibold text-[var(--ink)]/80">{t("plans.p_pitch")}</div>
        <div className="text-center font-extrabold">{t("plans.p_price")}</div>
        <div className="text-xs font-extrabold" style={{ color: "var(--coral)" }}>{t("plans.p_founding")}</div>

        <div className="space-y-1.5 pt-1">
          <Perk>{t("plans.p_perk_badge")}</Perk>
          <Perk>{t("plans.p_perk_events")}</Perk>
          <Perk>{t("plans.p_perk_promo")}</Perk>
          <Perk>{t("plans.p_perk_all")}</Perk>
        </div>

        {tier === "pro" ? null : links.pro ? (
          <a href={links.pro} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-coral w-full text-center block">{t("plans.p_cta")}</a>
        ) : swish ? (
          <>
            <SwishPayBlock number={swish} amountSek={249} message={`Courtship PRO ${myName || ""}`.trim()} />
            <div className="text-[11px] font-semibold text-center text-[var(--ink)]/55">{t("plans.p_swish_note")}</div>
          </>
        ) : isAdmin ? (
          <div className="text-sm font-semibold text-[var(--ink)]/70" style={{ borderTop: "1px dashed var(--ink)", paddingTop: 8 }}>{t("mem.admin_setup")}</div>
        ) : null}
      </div>

      <div className="text-xs font-semibold text-center text-[var(--ink)]/55 pb-2">{t("plans.footer")}</div>
    </div>
  );
}
