import { BallHeart } from "@/components/RailKit";
import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomTabBar } from "@/components/BottomTabBar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ensurePushSubscribed } from "@/lib/push";
import { FLAGS } from "@/lib/flags";
import { useI18n } from "@/lib/i18n";
import { joinSearch } from "@/lib/guest";
import { peekDraftGame, publishDraftGame } from "@/lib/draftGame";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

// Once we've seen this session's user has a profile, don't re-query on every nav.
let profileConfirmed = false;

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
      // Keep the destination: a push tap on a signed-out device (or any deep
      // link) should land back on that game after login, not on /board.
      throw redirect({ to: "/auth", search: { mode: "login", next: location.href } });
    }
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/check-email", search: { email: data.user.email ?? "" } });
    }
    // A confirmed user WITHOUT a profile (abandoned onboarding, then a deep-link
    // or push tap) would land on pages with a blank identity and could act with
    // no name. Send them to finish onboarding. Cached so it costs one query per
    // session, not one per navigation (a profile never un-exists).
    if (!profileConfirmed) {
      const { data: prof } = await supabase.from("profiles" as any).select("id").eq("id", data.user.id).maybeSingle();
      if (!prof) throw redirect({ to: "/onboarding" });
      profileConfirmed = true;
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
  // Reverse registration: a game drafted on /post (before the account existed)
  // publishes the moment its author lands in the authed shell — then we take
  // them straight to their live game so they can share it.
  const navigate = useNavigate();
  useEffect(() => {
    if (guest || !user || !peekDraftGame()) return;
    void publishDraftGame(user.id).then((id) => {
      if (!id) return;
      toast.success(t("post_pub.live_toast"));
      navigate({ to: "/sos/$id", params: { id } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, user?.id]);
  return (
    <div className="terry-bg app-shell font-body text-[var(--ink)] flex flex-col">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)] shrink-0">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/board" className="font-display text-2xl flex items-center gap-2">
            <BallHeart size={26} />
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
      <main ref={mainRef} className="flex-1 overflow-y-auto">
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