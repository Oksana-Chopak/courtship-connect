import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/rescue")({
  beforeLoad: () => { throw redirect({ to: "/board", search: { seg: "urgent" } }); },
  component: () => null,
});
