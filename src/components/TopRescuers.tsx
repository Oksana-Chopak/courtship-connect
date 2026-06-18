import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

type Top = { user_id: string; name: string; rescues: number };

export function TopRescuers() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Top[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).rpc("top_rescuers_month");
      setRows((data as Top[]) ?? []);
    })();
  }, []);
  if (rows.length === 0) return null;
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);
  return (
    <div className="ccard p-4 space-y-2" style={{ borderColor: "var(--coral)" }}>
      <div className="csection-label">🏆 {t("lead.title")}</div>
      {rows.map((r, i) => (
        <Link
          key={r.user_id}
          to="/players/$id"
          params={{ id: r.user_id }}
          className="flex items-center justify-between gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg w-7 text-center shrink-0">{medal(i)}</span>
            <span className="font-extrabold truncate">{r.name}</span>
          </div>
          <span className="font-extrabold shrink-0">🚑 {r.rescues}</span>
        </Link>
      ))}
    </div>
  );
}
