import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomTabBar } from "@/components/BottomTabBar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ensurePushSubscribed } from "@/lib/push";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/check-email", search: { email: data.user.email ?? "" } });
    }
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // App-shell scrolls inside <main>, not the window, so the fixed-position bar
  // can't jump with the mobile toolbar/keyboard. Reset to top on each new page.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [loc.pathname]);
  // Silently (re)create the push subscription for users who already granted
  // permission — without this, a granted user can have no live subscription
  // and never receive SOS pushes.
  useEffect(() => { void ensurePushSubscribed(); }, []);
  return (
    <div className="terry-bg app-shell font-body text-[var(--ink)] flex flex-col">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)] shrink-0">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/board" className="font-display text-2xl">
            Courtship
          </Link>
        </div>
      </header>
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6">
          <RouteErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
      </main>
      <BottomTabBar />
    </div>
  );
}