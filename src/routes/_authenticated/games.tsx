import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/games")({
  beforeLoad: () => { throw redirect({ to: "/board", search: { seg: "planned" } }); },
  component: () => null,
});
