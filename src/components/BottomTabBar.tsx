import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Tab = {
  to: string;
  icon: string;
  label: string;
  match: (path: string) => boolean;
  badge?: number;
};

export function BottomTabBar() {
  const { t } = useI18n();
  const loc = useLocation();
  const path = loc.pathname;
  const [boardBadge, setBoardBadge] = useState(0);
  const [profileBadge, setProfileBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const [{ data: sos }, { data: reqs }] = await Promise.all([
        (supabase as any).rpc("eligible_sos_for_me"),
        (supabase as any).from("buddy_requests").select("id", { count: "exact", head: false }).eq("to_id", u.user.id).eq("status", "pending"),
      ]);
      if (cancelled) return;
      setBoardBadge(Array.isArray(sos) ? sos.length : 0);
      setProfileBadge(Array.isArray(reqs) ? reqs.length : 0);
    }
    refresh();
    const i = setInterval(refresh, 30000);
    const ch = (supabase as any)
      .channel("tabbar")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "buddy_requests" }, refresh)
      .subscribe();
    return () => { cancelled = true; clearInterval(i); supabase.removeChannel(ch); };
  }, []);

  const tabs: Tab[] = [
    { to: "/home", icon: "🏠", label: t("tabs.home"), match: (p) => p === "/home" },
    { to: "/board", icon: "📋", label: t("tabs.board"), match: (p) => p.startsWith("/board") || p.startsWith("/rescue") || p.startsWith("/games") || p.startsWith("/sos"), badge: boardBadge },
    { to: "/players", icon: "👥", label: t("tabs.players"), match: (p) => p.startsWith("/players") },
    { to: "/me", icon: "🙂", label: t("tabs.profile"), match: (p) => p === "/me" || p.startsWith("/admin"), badge: profileBadge },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-[var(--ink)]"
      style={{ background: "var(--cream2)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4 max-w-md mx-auto">
        {tabs.map((tab) => {
          const active = tab.match(path);
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                className="relative flex flex-col items-center justify-center gap-1 px-1 py-2"
                style={{ minHeight: 64, color: "var(--ink)" }}
              >
                <span
                  aria-hidden="true"
                  className="text-2xl"
                  style={{ filter: active ? "none" : "grayscale(0.4)", opacity: active ? 1 : 0.85 }}
                >
                  {tab.icon}
                </span>
                <span className="text-base font-extrabold leading-none">{tab.label}</span>
                {tab.badge ? (
                  <span
                    className="absolute top-1 right-3 rounded-full px-1.5 flex items-center justify-center border-2"
                    style={{
                      background: "var(--coral)", color: "#FFF6E8",
                      borderColor: "var(--ink)", minWidth: 22, height: 22,
                      fontSize: "0.875rem", fontWeight: 800,
                    }}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                ) : null}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-3 right-3 bottom-0 rounded-t-full"
                    style={{ height: 4, background: "var(--coral)" }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}