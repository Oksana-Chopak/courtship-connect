import { supabase } from "@/integrations/supabase/client";

export type SosRow = {
  duration_min?: number;
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
  caller_last_name?: string | null;
  caller_photo_url?: string | null;
  court_name: string | null;
  court_city: string | null;
  court_area: string | null;
  caller_name: string | null;
  is_buddy: boolean;
};

export async function fetchCourts(): Promise<CourtRow[]> {
  const { data } = await (supabase as any)
    .from("courts")
    .select("id,name,area,city")
    .order("city")
    .order("name");
  return (data as CourtRow[]) ?? [];
}


/** Enrich caller_name-only rows with caller_last_name + caller_photo_url in one
 * players_directory batch. Silent no-op if RPC unavailable. */
export async function hydrateCallers(rows: EligibleSosRow[]): Promise<EligibleSosRow[]> {
  const ids = Array.from(new Set(rows.map((r) => r.caller_id).filter(Boolean)));
  if (!ids.length) return rows;
  try {
    const { data } = await (supabase as any).rpc("players_directory", { _ids: ids });
    const byId = new Map<string, any>(((data as any[]) ?? []).map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = byId.get(r.caller_id);
      return p ? { ...r, caller_last_name: p.last_name ?? null, caller_photo_url: p.photo_url ?? null } : r;
    });
  } catch {
    return rows;
  }
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

// ── Planned-game applications: players raise a hand, the HOST picks ──
// (Urgent SOS keeps first-claim-wins.) All fns are resilient: before the SQL
// is applied they fall back gracefully so nothing breaks mid-rollout.

const MISSING_RPC = /(does not exist|PGRST202|schema cache|not_applicable)/i;

/** Apply to a planned game. Falls back to the old instant claim if the
 *  applications RPC isn't deployed yet (fallbackClaimed=true then). */
export async function applyToGame(sosId: string): Promise<{ ok: boolean; reason: string; fallbackClaimed?: boolean }> {
  const { data, error } = await (supabase as any).rpc("apply_to_game", { _sos_id: sosId });
  if (error) {
    if (MISSING_RPC.test(error.message ?? "")) {
      const r = await claimSos(sosId);
      return { ok: r.ok, reason: r.reason, fallbackClaimed: true };
    }
    return { ok: false, reason: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, reason: row?.reason ?? "unknown" };
}

export async function withdrawApplication(sosId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("withdraw_application", { _sos_id: sosId });
  if (error) return false;
  return !!data;
}

/** Which planned games have I applied to (pending)? Empty pre-SQL. */
export async function fetchMyApplicationSosIds(uid: string): Promise<Set<string>> {
  try {
    const { data } = await (supabase as any)
      .from("sos_applications").select("sos_id").eq("applicant_id", uid).eq("status", "pending");
    return new Set(((data as any[]) ?? []).map((r) => r.sos_id));
  } catch { return new Set(); }
}

export type ApplicantRow = { id: string; name: string; photo_url: string | null; level: number; vibe: string; rescues_count: number | null };

/** Pending candidates for MY game (host view). Empty pre-SQL. */
export async function fetchApplicants(sosId: string): Promise<ApplicantRow[]> {
  try {
    const { data: apps } = await (supabase as any)
      .from("sos_applications").select("applicant_id,created_at").eq("sos_id", sosId).eq("status", "pending").order("created_at");
    const ids = ((apps as any[]) ?? []).map((a) => a.applicant_id);
    if (!ids.length) return [];
    const { data: ps } = await (supabase as any).rpc("players_directory", { _ids: ids });
    const byId = new Map<string, any>(((ps as any[]) ?? []).map((p) => [p.id, p]));
    return ids.map((id) => {
      const p = byId.get(id) ?? {};
      return { id, name: p.name ?? "Player", photo_url: p.photo_url ?? null, level: p.level ?? 3, vibe: p.vibe ?? "friendly", rescues_count: p.rescues_count ?? 0 };
    });
  } catch { return []; }
}

/** Pending-candidate counts for a set of my games (board badge). Empty pre-SQL. */
export async function fetchApplicantCounts(sosIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!sosIds.length) return m;
  try {
    const { data } = await (supabase as any)
      .from("sos_applications").select("sos_id").in("sos_id", sosIds).eq("status", "pending");
    for (const r of ((data as any[]) ?? [])) m.set(r.sos_id, (m.get(r.sos_id) ?? 0) + 1);
  } catch { /* pre-SQL */ }
  return m;
}

export async function pickApplicant(sosId: string, applicantId: string): Promise<{ ok: boolean; reason: string; game_id: string | null }> {
  const { data, error } = await (supabase as any).rpc("pick_applicant", { _sos_id: sosId, _applicant: applicantId });
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
  const nowIso = new Date().toISOString();
  // "Claims I made" = games where I'm player_b (the claimer). sos_requests.claimed_by
  // only stores the LAST claimer, so for partially-filled doubles (status still
  // 'active') it silently dropped me from my own upcoming list. Derive from games.
  const { data: gs } = await (supabase as any)
    .from("games")
    .select("sos_id")
    .eq("player_b", uid)
    .gt("played_at", nowIso);
  const sosIds = Array.from(new Set(((gs as any[]) ?? []).map((g) => g.sos_id).filter(Boolean)));
  if (!sosIds.length) return [];
  const { data } = await (supabase as any)
    .from("sos_requests")
    .select("*")
    .in("id", sosIds)
    .in("status", ["active", "claimed"])
    .gt("play_at", nowIso)
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
  const text = `\u{1F3BE} Hey! I'm in for our tennis match ${when} at ${court} — I'm ${myName}, see you on court!`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}