import { createFileRoute, redirect } from "@tanstack/react-router";

// /home used to be a second, near-duplicate hub that NO in-app navigation linked
// to — yet the PWA manifest pointed start_url at it, so installed users opened a
// divergent, dead-ended screen (green "New match" CTA instead of the red SOS hero)
// from which they could never get back. Iteration 0.1: Board is the single hub.
// /home now redirects there so old bookmarks / installed shortcuts land correctly.
export const Route = createFileRoute("/_authenticated/home")({
  beforeLoad: () => {
    throw redirect({ to: "/board" });
  },
});
