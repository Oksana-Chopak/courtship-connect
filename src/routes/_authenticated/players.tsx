import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /players and its child /players/$id. Without this Outlet the detail
// route had nowhere to render and the list showed instead.
export const Route = createFileRoute("/_authenticated/players")({
  component: PlayersLayout,
});

function PlayersLayout() {
  return <Outlet />;
}
