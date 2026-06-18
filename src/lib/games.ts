import { supabase } from "@/integrations/supabase/client";

export type GameRow = {
  id: string;
  player_a: string;
  player_b: string;
  confirmed_a: boolean;
  confirmed_b: boolean;
  reported_noshow: string | null;
  played_at: string;
  sos_id: string | null;
  archived_by?: string[] | null;
  created_at?: string | null;
};

/** Games this user played that are ≥ 2h after play time, not archived by them,
 *  not yet confirmed by them, and not older than 7 days (silent expiry). */
export async function fetchPendingPostGameChecks(uid: string): Promise<GameRow[]> {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await (supabase as any)
    .from("games")
    .select("*")
    .or(`player_a.eq.${uid},player_b.eq.${uid}`)
    .lte("played_at", cutoff)
    .gte("played_at", sevenDaysAgo)
    .is("reported_noshow", null)
    .order("played_at", { ascending: false });
  const rows = (data as GameRow[]) ?? [];
  return rows.filter((g) => {
    const mine = g.player_a === uid ? g.confirmed_a : g.confirmed_b;
    if (mine) return false;
    if (Array.isArray(g.archived_by) && g.archived_by.includes(uid)) return false;
    return true;
  });
}

export async function confirmGame(gameId: string) {
  const { error } = await (supabase as any).rpc("confirm_game", { _game_id: gameId });
  if (error) throw new Error(error.message);
}

export async function reportNoshow(gameId: string) {
  const { error } = await (supabase as any).rpc("report_noshow", { _game_id: gameId });
  if (error) throw new Error(error.message);
}

export async function archiveGame(gameId: string) {
  const { error } = await (supabase as any).rpc("archive_game", { _game_id: gameId });
  if (error) throw new Error(error.message);
}

/** Past games involving this user (played, not no-show, not archived by them), newest first. */
export async function fetchMyGameHistory(uid: string, limit = 20): Promise<GameRow[]> {
  const { data } = await (supabase as any)
    .from("games")
    .select("*")
    .or(`player_a.eq.${uid},player_b.eq.${uid}`)
    .lte("played_at", new Date().toISOString())
    .is("reported_noshow", null)
    .order("played_at", { ascending: false })
    .limit(limit);
  return ((data as GameRow[]) ?? []).filter(
    (g) => !(Array.isArray(g.archived_by) && g.archived_by.includes(uid)),
  );
}
