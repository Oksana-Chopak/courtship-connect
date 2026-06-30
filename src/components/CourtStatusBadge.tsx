import { courtStatusMeta, type CourtStatus } from "@/lib/courtship";
import { useI18n } from "@/lib/i18n";

export function CourtStatusBadge({ status, muted }: { status: CourtStatus; muted?: boolean }) {
  const { lang } = useI18n();
  const meta = courtStatusMeta(status, lang);
  if (muted) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "rgba(43,33,24,0.55)" }}>
        {meta.label}
      </span>
    );
  }
  const bg = meta.tone === "green" ? "var(--green-pop)" : "var(--cream2)";
  return (
    <span
      className="inline-flex items-center font-extrabold rounded-full border-2 border-[var(--ink)] px-3 py-1 text-base"
      style={{ background: bg, color: "var(--ink)", minHeight: 32 }}
    >
      {meta.label}
    </span>
  );
}