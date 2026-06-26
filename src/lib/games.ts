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
  score?: string | null;
  winner?: string | null;
};

/** Games this user played that are ≥ 2h after play time, not archived by them,
 *  not yet confirmed by them, and not older than 7 days (silent expiry). */
export async function fetchPendingPostGameChecks(uid: string): Promise<GameRow[]> {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const orFilter = `player_a.eq.${uid},player_b.eq.${uid}`;
  // SOS/open games: only prompt once the play time has passed (2h grace).
  // Manually logged games (sos_id null): the game already happened, so the
  // partner can confirm right away — no grace window.
  const [sosRes, logRes] = await Promise.all([
    (supabase as any).from("games").select("*").or(orFilter)
      .not("sos_id", "is", null).lte("played_at", cutoff).gte("played_at", sevenDaysAgo)
      .is("reported_noshow", null).order("played_at", { ascending: false }),
    (supabase as any).from("games").select("*").or(orFilter)
      .is("sos_id", null).gte("played_at", sevenDaysAgo)
      .is("reported_noshow", null).order("played_at", { ascending: false }),
  ]);
  const rows = [...((sosRes.data as GameRow[]) ?? []), ...((logRes.data as GameRow[]) ?? [])];
  const seen = new Set<string>();
  return rows.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    const mine = g.player_a === uid ? g.confirmed_a : g.confirmed_b;
    if (mine) return false;
    if (Array.isArray(g.archived_by) && g.archived_by.includes(uid)) return false;
    return true;
  });
}

/** Log a game you played (even one not arranged through the app). Creates a
 *  game already confirmed on your side; the other player confirms theirs, then
 *  it counts for both (via the existing bump trigger). Needs the log_game RPC. */
export async function logGame(otherId: string, playedAtISO: string, score?: string, winner?: string | null): Promise<void> {
  const params: Record<string, any> = {
    _other_id: otherId,
    _played_at: playedAtISO,
    _score: score && score.trim() ? score.trim() : null,
  };
  if (winner) params._winner = winner; // only send when set — resilient if the RPC isn't upgraded yet
  const { error } = await (supabase as any).rpc("log_game", params);
  if (error) throw new Error(error.message);
}

export async function confirmGame(gameId: string, score?: string, winner?: string | null) {
  const params: Record<string, any> = {
    _game_id: gameId,
    _score: score && score.trim() ? score.trim() : null,
  };
  if (winner) params._winner = winner; // only send when set — resilient if the RPC isn't upgraded yet
  const { error } = await (supabase as any).rpc("confirm_game", params);
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
