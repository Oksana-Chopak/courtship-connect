import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomTabBar } from "@/components/BottomTabBar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ensurePushSubscribed } from "@/lib/push";
import { FLAGS } from "@/lib/flags";
import { useI18n } from "@/lib/i18n";
import { joinSearch } from "@/lib/guest";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Guest peek: logged-out visitors may SEE the pulse on a few pages —
      // the live board is a better landing page than any landing page.
      const path = location.pathname.replace(/\/+$/, "") || "/";
      const GUEST_PATHS = new Set(["/board", "/players", "/leaders", "/me"]);
      if (FLAGS.guestPeek && GUEST_PATHS.has(path)) return { user: null };
      throw redirect({ to: "/auth", search: { mode: "login" } });
    }
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/check-email", search: { email: data.user.email ?? "" } });
    }
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const loc = useLocation();
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const guest = !user;
  const mainRef = useRef<HTMLElement>(null);
  // App-shell scrolls inside <main>, not the window, so the fixed-position bar
  // can't jump with the mobile toolbar/keyboard. Reset to top on each new page.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [loc.pathname]);
  // Silently (re)create the push subscription for users who already granted
  // permission — without this, a granted user can have no live subscription
  // and never receive SOS pushes.
  useEffect(() => { if (!guest) void ensurePushSubscribed(); }, [guest]);
  return (
    <div className="terry-bg app-shell font-body text-[var(--ink)] flex flex-col">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)] shrink-0">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/board" className="font-display text-2xl">
            Courtship
          </Link>
        </div>
      </header>
      {guest && (
        <div className="shrink-0 border-b-2 border-[var(--ink)]" style={{ background: "var(--green-pop)" }}>
          <div className="max-w-md mx-auto px-5 py-2 flex items-center gap-2">
            <span className="text-sm font-extrabold flex-1 leading-tight">👀 {t("guest.banner")}</span>
            <Link to="/auth" search={joinSearch(loc.pathname)} className="cbtn cbtn-coral shrink-0" style={{ padding: "7px 14px", fontSize: 13 }}>
              {t("guest.join")}
            </Link>
          </div>
        </div>
      )}
      <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-md mx-auto px-5 py-6">
          <RouteErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
      </main>
      <BottomTabBar guest={guest} />
    </div>
  );
}