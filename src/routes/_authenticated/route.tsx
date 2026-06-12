import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
          <nav className="flex items-center gap-3 text-sm font-extrabold">
            <Link to="/home" className="hover:text-[var(--coral)]">Home</Link>
            <Link to="/rescue" className="hover:text-[var(--coral)]">Rescue 🚨</Link>
            <Link to="/players" className="hover:text-[var(--coral)]">Players</Link>
            <Link to="/me" className="hover:text-[var(--coral)]">Me</Link>
            <button
              className="underline text-[var(--ink)]"
              onClick={async () => {
                await supabase.auth.signOut();
                toast.success("See you on court 👋");
                window.location.href = "/";
              }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}