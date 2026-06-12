import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomTabBar } from "@/components/BottomTabBar";

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
  return (
    <div className="terry-bg min-h-screen font-body text-[var(--ink)]">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)]">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/home" className="font-display text-2xl">
            Courtship
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6 pb-32">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}