import { createFileRoute, redirect } from "@tanstack/react-router";

// The People hub (buddies, requests, invite code) now lives on the Players page.
// Keep this route as a redirect so buddy-request / invitee-joined notifications
// (which deep-link to /people) still land in the right place.
export const Route = createFileRoute("/_authenticated/people")({
  beforeLoad: () => { throw redirect({ to: "/players" }); },
});
