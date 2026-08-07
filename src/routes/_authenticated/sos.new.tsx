import { createFileRoute } from "@tanstack/react-router";
import { GameWizard } from "@/components/GameWizard";

export const Route = createFileRoute("/_authenticated/sos/new")({
  head: () => ({ meta: [{ title: "New post — Courtship" }] }),
  validateSearch: (sp: Record<string, unknown>): { edit?: string; planned?: boolean } => ({
    edit: typeof sp.edit === "string" ? sp.edit : undefined,
    planned: sp.planned === true || sp.planned === "1" ? true : undefined,
  }),
  component: NewSos,
});

// The wizard itself lives in ONE shared component (also used by the guest
// funnel at /post) — change it there, every entry point follows.
function NewSos() {
  const { edit } = Route.useSearch();
  return <GameWizard editId={edit} />;
}
