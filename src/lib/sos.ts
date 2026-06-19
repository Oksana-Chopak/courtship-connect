import { supabase } from "@/integrations/supabase/client";

export type SosRow = {
  id: string;
  caller_id: string;
  play_at: string;
  court_id: string | null;
  format: "singles" | "doubles_need1" | "doubles_need2" | "doubles_need3";
  level_min: number;
  level_max: number;
  court_status: "booked_paid" | "booked" | "will_book" | "public";
  note: string | null;
  status: "active" | "claimed" | "expired" | "cancelled";
  claimed_by: string | null;
  created_at: string;
  kind: "sos" | "open";
  auto_flare: boolean;
  flared_at: string | null;
  court_type: "indoor" | "outdoor";
  spots_needed?: number;
  spots_filled?: number;
};

export type CourtRow = { id: string; name: string; area: string | null; city: string };

export type EligibleSosRow = SosRow & {
  court_name: string | null;
  court_city: string | null;
  court_area: string | null;
  caller_name: string | null;
  is_buddy: boolean;
};

export async function sweepExpired() {
  await (supabase as any).rpc("expire_old_sos");
}

export async function fetchCourts(): Promise<CourtRow[]> {
  const { data } = await (supabase as any)
    .from("courts")
    .select("id,name,area,city")
    .order("city")
    .order("name");
  return (data as CourtRow[]) ?? [];
}

export async function fetchEligibleSos(): Promise<EligibleSosRow[]> {
  const { data, error } = await (supabase as any).rpc("eligible_sos_for_me");
  if (error) return [];
  return (data as EligibleSosRow[]) ?? [];
}

export async function fetchOpenGames(): Promise<EligibleSosRow[]> {
  const { data, error } = await (supabase as any).rpc("eligible_open_games_for_me");
  if (error) return [];
  return (data as EligibleSosRow[]) ?? [];
}

export type CommunityStats = {
  sets_saved: number;
  games_matched: number;
  new_buddies: number;
  all_time_games: number;
};

export async function fetchCommunityStats(city: string): Promise<CommunityStats | null> {
  const { data, error } = await (supabase as any).rpc("community_stats", { _city: city });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function activeSosCount(uid: string): Promise<number> {
  const { data } = await (supabase as any).rpc("active_sos_count", { _uid: uid });
  return (data as number) ?? 0;
}

export async function countMatchingRescuers(sosId: string): Promise<number> {
  const { data } = await (supabase as any).rpc("count_matching_rescuers", { _sos_id: sosId });
  return (data as number) ?? 0;
}

export async function claimSos(sosId: string): Promise<{ ok: boolean; reason: string; game_id: string | null }> {
  const { data, error } = await (supabase as any).rpc("claim_sos", { _sos_id: sosId });
  if (error) return { ok: false, reason: error.message, game_id: null };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, reason: row?.reason ?? "unknown", game_id: row?.game_id ?? null };
}

export async function withdrawClaim(sosId: string): Promise<{ ok: boolean; re_flared: boolean; reason: string }> {
  const { data, error } = await (supabase as any).rpc("withdraw_claim", { _sos_id: sosId });
  if (error) return { ok: false, re_flared: false, reason: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, re_flared: !!row?.re_flared, reason: row?.reason ?? "unknown" };
}

/** SOS / open games I claimed and that haven't started yet. */
export async function fetchMyUpcomingClaims(uid: string): Promise<EligibleSosRow[]> {
  const { data } = await (supabase as any)
    .from("sos_requests")
    .select("*")
    .eq("claimed_by", uid)
    .eq("status", "claimed")
    .gt("play_at", new Date().toISOString())
    .order("play_at", { ascending: true });
  const rows = (data as any[]) ?? [];
  if (!rows.length) return [];
  const courtIds = Array.from(new Set(rows.map((r) => r.court_id).filter(Boolean)));
  const callerIds = Array.from(new Set(rows.map((r) => r.caller_id)));
  const [{ data: cs }, { data: ps }] = await Promise.all([
    (supabase as any).from("courts").select("id,name,city,area").in("id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"]),
    (supabase as any).rpc("players_directory", { _ids: callerIds }),
  ]);
  const courtMap = new Map<string, any>((cs as any[] | null)?.map((c) => [c.id, c]) ?? []);
  const callerMap = new Map<string, string>((ps as any[] | null)?.map((p) => [p.id, p.name]) ?? []);
  return rows.map((r) => ({
    ...r,
    court_name: courtMap.get(r.court_id)?.name ?? null,
    court_city: courtMap.get(r.court_id)?.city ?? null,
    court_area: courtMap.get(r.court_id)?.area ?? null,
    caller_name: callerMap.get(r.caller_id) ?? null,
    is_buddy: false,
  })) as EligibleSosRow[];
}

export async function fetchMyActiveGames(): Promise<EligibleSosRow[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return [];
  const { data } = await (supabase as any)
    .from("sos_requests")
    .select("*")
    .eq("caller_id", uid)
    .in("status", ["active", "claimed"])
    .gt("play_at", new Date().toISOString())
    .order("play_at", { ascending: true });
  const rows = (data as any[]) ?? [];
  if (!rows.length) return [];
  const courtIds = Array.from(new Set(rows.map((r) => r.court_id).filter(Boolean)));
  const { data: cs } = await (supabase as any)
    .from("courts").select("id,name,city,area")
    .in("id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"]);
  const courtMap = new Map<string, any>((cs as any[] | null)?.map((c) => [c.id, c]) ?? []);
  return rows.map((r) => ({
    ...r,
    court_name: courtMap.get(r.court_id)?.name ?? null,
    court_city: courtMap.get(r.court_id)?.city ?? null,
    court_area: courtMap.get(r.court_id)?.area ?? null,
    caller_name: null,
    is_buddy: false,
  })) as EligibleSosRow[];
}

export function formatLabel(f: string): string {
  if (f === "singles") return "Singles";
  if (f === "doubles_need1") return "Doubles · need 1";
  if (f === "doubles_need2") return "Doubles · need 2";
  if (f === "doubles_need3") return "Doubles · need 3";
  return f;
}

export function whatsappClaimLink(phoneE164: string, myName: string, when: string, court: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const text = `Hey! I claimed your SOS for ${when} at ${court} 🎾 I'm ${myName} — see you there!`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}