import { supabase } from "@/integrations/supabase/client";

export type SosRow = {
  id: string;
  caller_id: string;
  play_at: string;
  court_id: string | null;
  format: "singles" | "doubles_need1" | "doubles_need2";
  level_min: number;
  level_max: number;
  court_status: "booked_paid" | "booked" | "will_book" | "public";
  note: string | null;
  status: "active" | "claimed" | "expired" | "cancelled";
  claimed_by: string | null;
  created_at: string;
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

export function formatLabel(f: string): string {
  if (f === "singles") return "Singles";
  if (f === "doubles_need1") return "Doubles · need 1";
  if (f === "doubles_need2") return "Doubles · need 2";
  return f;
}

export function whatsappClaimLink(phoneE164: string, myName: string, when: string, court: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const text = `Hey! I claimed your SOS for ${when} at ${court} 🎾 I'm ${myName} — see you there!`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}