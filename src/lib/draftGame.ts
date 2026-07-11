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

/** Publish the stashed draft as an OPEN game for the (now signed-in) user.
 *  Clears the draft in all outcomes so it can never double-post or loop.
 *  Returns the new game id, or null when there was nothing/stale/failed. */
export async function publishDraftGame(uid: string): Promise<string | null> {
  const d = peekDraftGame();
  if (!d) return null;
  clearDraftGame();
  // Stale draft (the picked time already passed while the user confirmed email)
  if (new Date(d.play_at).getTime() < Date.now() + 5 * 60 * 1000) return null;

  const insertRow: any = {
    caller_id: uid,
    play_at: d.play_at,
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
  let res = await (supabase as any).from("sos_requests").insert(insertRow).select("id").single();
  if (res.error && /duration_min/i.test(res.error.message || "")) {
    const { duration_min: _omit, ...fallback } = insertRow;
    res = await (supabase as any).from("sos_requests").insert(fallback).select("id").single();
  }
  if (res.error || !res.data?.id) return null;
  return res.data.id as string;
}
