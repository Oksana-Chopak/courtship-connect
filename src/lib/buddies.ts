import { supabase } from "@/integrations/supabase/client";

export type BuddyRow = {
  id: string;
  user_low: string;
  user_high: string;
  source: "played" | "invite" | "manual";
  created_at: string;
};

export type BuddyRequest = {
  id: string;
  from_id: string;
  to_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export async function fetchMyBuddies(uid: string) {
  const { data } = await (supabase as any)
    .from("buddies")
    .select("*")
    .or(`user_low.eq.${uid},user_high.eq.${uid}`)
    .order("created_at", { ascending: false });
  return (data as BuddyRow[]) ?? [];
}

export async function fetchBuddyIds(uid: string): Promise<Set<string>> {
  const rows = await fetchMyBuddies(uid);
  return new Set(rows.map((b) => (b.user_low === uid ? b.user_high : b.user_low)));
}

export async function fetchPendingRequestsTo(uid: string) {
  const { data } = await (supabase as any)
    .from("buddy_requests")
    .select("*")
    .eq("to_id", uid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data as BuddyRequest[]) ?? [];
}

export async function isBuddyWith(uid: string, other: string): Promise<boolean> {
  const ids = await fetchBuddyIds(uid);
  return ids.has(other);
}

export async function hasOutgoingRequest(from: string, to: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("buddy_requests")
    .select("id,status")
    .eq("from_id", from)
    .eq("to_id", to)
    .maybeSingle();
  return !!(data && (data as any).status === "pending");
}

export async function requestBuddy(other: string) {
  const { error } = await (supabase as any).rpc("request_buddy", { _other: other });
  if (error) throw new Error(error.message);
}

export async function respondBuddyRequest(reqId: string, accept: boolean) {
  const { error } = await (supabase as any).rpc("respond_buddy_request", {
    _req_id: reqId,
    _accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function removeBuddy(other: string) {
  const { error } = await (supabase as any).rpc("remove_buddy", { _other: other });
  if (error) throw new Error(error.message);
}

export function buddySourceLabel(s: string, lang: "en" | "sv" = "en") {
  if (lang === "sv") {
    if (s === "played") return "Spelade en match";
    if (s === "invite") return "Bjöd in dig";
    return "Manuellt";
  }
  if (s === "played") return "Played a match";
  if (s === "invite") return "Invited you";
  return "Manual";
}