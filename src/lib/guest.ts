import { supabase } from "@/integrations/supabase/client";
import type { EligibleSosRow } from "@/lib/sos";

/** Search params for the signup screen, preserving where the guest was. */
export function joinSearch(next?: string) {
  return { mode: "signup" as const, next };
}

/** Minimized public board rows mapped into the shape the board expects. */
export async function fetchPublicBoard(): Promise<EligibleSosRow[]> {
  try {
    const { data } = await (supabase as any).rpc("public_board");
    return (((data as any[]) ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      status: "active",
      play_at: r.play_at,
      created_at: r.created_at,
      format: r.format,
      level_min: r.level_min,
      level_max: r.level_max,
      spots_needed: r.spots_needed,
      spots_filled: r.spots_filled,
      court_id: null,
      court_name: r.court_name,
      court_city: r.court_city,
      court_type: r.court_type,
      court_status: r.court_status,
      caller_id: r.caller_id,
      caller_name: r.caller_name,
      caller_photo_url: r.caller_photo ?? null,
      sport: r.sport ?? "tennis",
      // Sell the game as it really is: guests see the time window and the
      // 🏟️ Any badge too (public_board returns both since the 07-19 batch).
      play_until: r.play_until ?? null,
      court_type_any: r.court_type_any ?? false,
      note: null,
      is_buddy: false,
      claimed_by: null,
    })) as unknown) as EligibleSosRow[];
  } catch { return []; }
}

/** Minimized public players sample mapped for the directory page. */
export async function fetchPublicPlayers(): Promise<any[]> {
  try {
    const { data } = await (supabase as any).rpc("public_players", { _limit: 30 });
    return (((data as any[]) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      last_name: null,
      photo_url: r.photo_url ?? null,
      level: r.level ?? 3,
      formats: [],
      play_times: [],
      vibe: r.vibe ?? "friendly",
      buddy_optin: "no",
      home_courts: null,
      home_city: r.home_city ?? null,
      home_cities: null,
      rescues_count: r.rescues_count ?? 0,
      games_played: r.games_played ?? 0,
      bio: null,
      member_tier: null,
    })));
  } catch { return []; }
}
