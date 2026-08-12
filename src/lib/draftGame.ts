import { supabase } from "@/integrations/supabase/client";

/** "Reverse registration": a visitor fills the game form FIRST (on /post),
 *  we stash it here, send them through signup/onboarding, and publish the
 *  game the moment they land in the authed shell. Same localStorage pattern
 *  as rememberNext/consumeNext in share.ts (survives the email round-trip). */

const KEY = "courtship.draftGame";

export type DraftGame = {
  court_id: string;
  city: string;
  play_at: string; // ISO
  play_until?: string | null; // ISO — flexible-start window end (optional)
  court_type_any?: boolean; // 🏟️ any surface works
  format: string;
  level_min: number;
  level_max: number;
  court_status: string;
  court_type: string;
  duration_min: number;
  note: string | null;
};

export function rememberDraftGame(d: DraftGame) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}

export function peekDraftGame(): DraftGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftGame;
    if (!d || typeof d.court_id !== "string" || typeof d.play_at !== "string") return null;
    return d;
  } catch { return null; }
}

export function clearDraftGame() {
  try { localStorage.removeItem(KEY); } catch {}
}

export type PublishDraftResult = { id: string | null; reason: "stale" | "failed" | null };

/** Publish the stashed draft as an OPEN game for the (now signed-in) user.
 *  Success clears the draft. Stale/failed KEEP it and return the reason, so
 *  the caller can route the person to the wizard with everything prefilled —
 *  a guest's game must never silently vanish (2026-08-12 audit P0-1). The
 *  wizard consumes+clears the kept draft, so this can't double-post or loop. */
export async function publishDraftGame(uid: string): Promise<PublishDraftResult> {
  const d = peekDraftGame();
  if (!d) return { id: null, reason: null };
  // Stale draft (the picked time already passed while the user confirmed email)
  if (new Date(d.play_at).getTime() < Date.now() + 5 * 60 * 1000) return { id: null, reason: "stale" };

  const insertRow: any = {
    caller_id: uid,
    play_at: d.play_at,
    play_until: d.play_until ?? null,
    court_type_any: d.court_type_any ?? false,
    court_id: d.court_id,
    format: d.format,
    level_min: d.level_min,
    level_max: d.level_max,
    court_status: d.court_status,
    note: d.note,
    status: "active",
    kind: "open",
    auto_flare: true,
    flared_at: null,
    court_type: d.court_type,
    duration_min: d.duration_min,
  };
  // Accumulative drops (audit P1-10): never rebuild from the original row —
  // with two missing columns the old chain could never converge.
  let row: any = { ...insertRow };
  let res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
  if (res.error && /court_type_any/i.test(res.error.message || "")) {
    const { court_type_any: _ca, ...noAny } = row; row = noAny;
    res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
  }
  if (res.error && /play_until/i.test(res.error.message || "")) {
    const { play_until: _pu, ...noWin } = row; row = noWin;
    res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
  }
  if (res.error && /duration_min/i.test(res.error.message || "")) {
    const { duration_min: _omit, ...fallback } = row; row = fallback;
    res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
  }
  if (res.error || !res.data?.id) return { id: null, reason: "failed" };
  clearDraftGame();
  return { id: res.data.id as string, reason: null };
}
