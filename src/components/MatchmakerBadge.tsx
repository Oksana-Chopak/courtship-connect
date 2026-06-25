import { matchmakerTier } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export function MatchmakerBadge({ count, size = "sm", progress = false }: { count: number; size?: "sm" | "lg"; progress?: boolean }) {
  const { t } = useI18n();
  const tier = matchmakerTier(count);
  if (!tier) {
    if (size === "lg") {
      return (
        <div className="ccard p-4">
          <div className="csection-label">{t("mm.next_up")}</div>
          <div className="font-display text-2xl mt-1">🎪 Host</div>
          <div className="text-sm text-[var(--ink)] mt-1">{t("mm.host_first")}</div>
        </div>
      );
    }
    return null;
  }
  const toNext = tier.next != null ? tier.next - count : null;
  if (size === "lg") {
    return (
      <div className="ccard p-4">
        <div className="csection-label">{t("mm.rank")}</div>
        <div className="font-display text-2xl mt-1">{tier.emoji} {tier.name}</div>
        <div className="text-base font-extrabold text-[var(--ink)] mt-1">🎪 {t("mm.hosted", { n: count })}</div>
        {progress && toNext != null && tier.nextName && (
          <div className="text-sm text-[var(--ink)] mt-1">{t("mm.to_next", { n: toNext, name: tier.nextName })}</div>
        )}
      </div>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-extrabold px-2 py-1 rounded-full"
      style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
    >
      {tier.emoji} {tier.name}
    </span>
  );
}
