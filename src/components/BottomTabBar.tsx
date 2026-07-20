import { Link, useLocation, useNavigate } from "@tanstack/react-router";
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

export function BottomTabBar({ guest = false }: { guest?: boolean } = {}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const loc = useLocation();
  const path = loc.pathname;
  const [boardBadge, setBoardBadge] = useState(0);
  const [profileBadge, setProfileBadge] = useState(0);
  const [plusOpen, setPlusOpen] = useState(false);

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

  const left: Tab[] = [
    { to: "/board", icon: "📋", label: t("tabs.board"), match: (p) => p.startsWith("/board") || p.startsWith("/rescue") || p.startsWith("/games") || p.startsWith("/sos"), badge: boardBadge },
    { to: "/players", icon: "👥", label: t("tabs.players"), match: (p) => p.startsWith("/players") },
  ];
  const right: Tab[] = [
    { to: "/leaders", icon: "🏆", label: t("tabs.leaders"), match: (p) => p.startsWith("/leaders") },
    { to: "/me", icon: "🙂", label: t("tabs.profile"), match: (p) => p === "/me" || p.startsWith("/admin") || p.startsWith("/progress") || p.startsWith("/matches") || p.startsWith("/people") || p.startsWith("/settings") || p.startsWith("/help"), badge: profileBadge },
  ];

  const TabItem = ({ tab }: { tab: Tab }) => {
    const active = tab.match(path);
    return (
      <li key={tab.to}>
        <Link
          to={tab.to}
          className="relative flex flex-col items-center justify-center gap-1 px-1 py-2"
          style={{ minHeight: 64, color: "var(--ink)" }}
        >
          <span aria-hidden="true" className="text-2xl" style={{ filter: active ? "none" : "grayscale(0.4)", opacity: active ? 1 : 0.85 }}>
            {tab.icon}
          </span>
          <span className="text-sm font-extrabold leading-none">{tab.label}</span>
          {tab.badge ? (
            <span
              className="absolute top-1 right-2 rounded-full px-1.5 flex items-center justify-center border-2"
              style={{ background: "var(--coral)", color: "var(--ink)", borderColor: "var(--ink)", minWidth: 22, height: 22, fontSize: "0.875rem", fontWeight: 800 }}
            >
              {tab.badge > 99 ? "99+" : tab.badge}
            </span>
          ) : null}
          {active && (
            <span aria-hidden="true" className="absolute left-3 right-3 bottom-0 rounded-t-full" style={{ height: 4, background: "var(--coral)" }} />
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      {plusOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(43,33,24,0.5)" }}
          onClick={() => setPlusOpen(false)}
        >
          <div className="w-full max-w-md p-4 pb-24" onClick={(e) => e.stopPropagation()}>
            <div className="ccard p-4 space-y-2" style={{ background: "var(--cream2)" }}>
              <div className="csection-label">{t("plus.title")}</div>
              <Link to="/sos/new" search={{ planned: undefined }} onClick={() => setPlusOpen(false)}
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
                style={{ background: "var(--coral)", color: "var(--ink)" }}>
                <span className="text-2xl" aria-hidden="true">🚨</span>
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-tight">{t("plus.post")}</span>
                  <span className="block text-sm font-semibold" style={{ opacity: 0.7 }}>{t("plus.post_sub")}</span>
                </span>
              </Link>
              <Link to="/matches" search={{ log: true }} onClick={() => setPlusOpen(false)}
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
                style={{ background: "var(--green-pop)" }}>
                <span className="text-2xl" aria-hidden="true">✅</span>
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-tight">{t("plus.log")}</span>
                  <span className="block text-sm font-semibold" style={{ opacity: 0.7 }}>{t("plus.log_sub")}</span>
                </span>
              </Link>
              <Link to="/coach" onClick={() => setPlusOpen(false)}
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
                style={{ background: "var(--cream)" }}>
                <span className="text-2xl" aria-hidden="true">🎓</span>
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-tight">{t("plus.coach")}</span>
                  <span className="block text-sm font-semibold" style={{ opacity: 0.7 }}>{t("plus.coach_sub")}</span>
                </span>
              </Link>
              <Link to="/events/new" onClick={() => setPlusOpen(false)}
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--ink)] px-4 py-3"
                style={{ background: "var(--cream)" }}>
                <span className="text-2xl" aria-hidden="true">🎪</span>
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-tight">{t("plus.host")}</span>
                  <span className="block text-sm font-semibold" style={{ opacity: 0.7 }}>{t("plus.host_sub")}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
      <nav
        aria-label="Primary"
        className="shrink-0 border-t-2 border-[var(--ink)]"
        style={{ background: "var(--cream2)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5 max-w-md mx-auto items-end">
          {left.map((tab) => <TabItem key={tab.to} tab={tab} />)}
          <li className="flex items-center justify-center" style={{ minHeight: 64 }}>
            <button
              type="button"
              aria-label={t("plus.title")}
              aria-expanded={plusOpen}
              onClick={() => { if (guest) { navigate({ to: "/auth", search: { mode: "signup", next: undefined } }); return; } setPlusOpen((v) => !v); }}
              className="flex items-center justify-center rounded-full font-extrabold"
              style={{
                width: 58, height: 58, transform: "translateY(-14px)",
                background: "var(--coral)", color: "var(--ink)",
                border: "3px solid var(--ink)", boxShadow: "4px 4px 0 var(--ink)",
                fontSize: 32, lineHeight: 1,
              }}
            >
              {plusOpen ? "×" : "＋"}
            </button>
          </li>
          {right.map((tab) => <TabItem key={tab.to} tab={tab} />)}
        </ul>
      </nav>
    </>
  );
}
