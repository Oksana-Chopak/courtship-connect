import { activityTier } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";
import { tierNameKey } from "@/lib/courtship";

export function ActivityBadge({ count, size = "sm", progress = false }: { count: number; size?: "sm" | "lg"; progress?: boolean }) {
  const { t } = useI18n();
  const tier = activityTier(count);
  if (!tier) {
    if (size === "lg") {
      return (
        <div className="ccard p-4">
          <div className="csection-label">{t("act.next_up")}</div>
          <div className="font-display text-2xl mt-1">🎾 {t(tierNameKey("activity", 1))}</div>
          <div className="text-sm text-[var(--ink)] mt-1">{t("act.play_first")}</div>
        </div>
      );
    }
    return null;
  }
  const toNext = tier.next != null ? tier.next - count : null;
  if (size === "lg") {
    return (
      <div className="ccard p-4">
        <div className="csection-label">{t("act.rank")}</div>
        <div className="font-display text-2xl mt-1">{tier.emoji} {t(tierNameKey("activity", tier.level))}</div>
        <div className="text-base font-extrabold text-[var(--ink)] mt-1">🎾 {t("act.games", { n: count })}</div>
        {progress && toNext != null && tier.nextName && (
          <div className="text-sm text-[var(--ink)] mt-1">{t("act.to_next", { n: toNext, name: t(tierNameKey("activity", tier.level + 1)) })}</div>
        )}
      </div>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-extrabold px-2 py-1 rounded-full"
      style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
    >
      {tier.emoji} {t(tierNameKey("activity", tier.level))}
    </span>
  );
}
