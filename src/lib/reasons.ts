import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";

/** Known RPC failure codes → dictionary keys. Anything unknown goes through
 *  oops(), which shows calm copy and parks the raw code behind ⚙️ — a person
 *  must never read `not_participant` in a toast (2026-08-12 audit P1-13). */
const KEYS: Record<string, string> = {
  taken: "sos.err_taken",
  expired: "sos.err_expired",
  own_sos: "sos.err_own",
  already_in: "sos.already_in",
  already_applied: "app.already",
  bad_proposed_time: "app.time_outside",
  no_application: "app.gone",
  not_participant: "reason.not_participant",
  not_found: "reason.gone",
  not_yours: "reason.gone",
  full: "ev.full_label",
  past: "ev.past",
};

export function reasonToast(t: (k: string) => string, reason: string | null | undefined): void {
  const key = reason ? KEYS[reason] : undefined;
  if (key) toast.error(t(key));
  else oops(new Error(String(reason ?? "unknown")));
}
