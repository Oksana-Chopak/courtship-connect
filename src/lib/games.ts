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
};

/** Games this user played that are ≥ 2h after play time and not yet resolved by them. */
export async function fetchPendingPostGameChecks(uid: string): Promise<GameRow[]> {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data } = await (supabase as any)
    .from("games")
    .select("*")
    .or(`player_a.eq.${uid},player_b.eq.${uid}`)
    .lte("played_at", cutoff)
    .is("reported_noshow", null)
    .order("played_at", { ascending: false });
  const rows = (data as GameRow[]) ?? [];
  return rows.filter((g) => {
    const mine = g.player_a === uid ? g.confirmed_a : g.confirmed_b;
    return !mine;
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