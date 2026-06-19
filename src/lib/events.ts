import { supabase } from "@/integrations/supabase/client";

export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  starts_at: string;
  city: string | null;
  location: string;
  format: string | null;
  capacity: number | null;
  spots_taken: number;
  price_sek: number | null;
  description: string | null;
  contact: string | null;
  status: string;
  created_at: string;
};

export type Attendee = { id: string; user_id: string; status: string; name: string };

export async function createEventRequest(input: {
  title: string;
  starts_at: string;
  city: string | null;
  location: string;
  format: string | null;
  capacity: number | null;
  price_sek: number | null;
  swish_number: string | null;
  description: string | null;
  contact: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { error } = await (supabase as any)
    .from("event_requests")
    .insert({ ...input, host_id: u.user.id, status: "pending" });
  if (error) throw error;
}

export async function fetchApprovedEvents(): Promise<EventRow[]> {
  const { data } = await (supabase as any)
    .from("event_requests")
    .select("*")
    .eq("status", "approved")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  return (data as EventRow[]) ?? [];
}

export async function fetchPendingEvents(): Promise<EventRow[]> {
  const { data } = await (supabase as any)
    .from("event_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data as EventRow[]) ?? [];
}

export async function setEventStatus(id: string, status: "approved" | "rejected"): Promise<void> {
  const { error } = await (supabase as any)
    .from("event_requests")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ---- attendance ----

export async function fetchMyAttendance(): Promise<Record<string, string>> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return {};
  const { data } = await (supabase as any)
    .from("event_attendees")
    .select("event_id,status")
    .eq("user_id", u.user.id);
  const map: Record<string, string> = {};
  for (const r of ((data as any[]) ?? [])) map[r.event_id] = r.status;
  return map;
}

export async function joinEvent(eventId: string): Promise<{ ok: boolean; reason: string; status: string | null }> {
  const { data, error } = await (supabase as any).rpc("join_event", { _event_id: eventId });
  if (error) return { ok: false, reason: error.message, status: null };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, reason: row?.reason ?? "error", status: row?.attendee_status ?? null };
}

export async function leaveEvent(eventId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("leave_event", { _event_id: eventId });
  if (error) throw error;
}

export async function fetchEventAttendees(eventId: string): Promise<Attendee[]> {
  const { data } = await (supabase as any)
    .from("event_attendees")
    .select("id,user_id,status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const rows = (data as any[]) ?? [];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.user_id);
  const { data: pubs } = await (supabase as any).rpc("players_directory", { _ids: ids });
  const nameById = new Map<string, string>(((pubs as any[]) ?? []).map((p) => [p.id, p.name]));
  return rows.map((r) => ({ id: r.id, user_id: r.user_id, status: r.status, name: nameById.get(r.user_id) ?? "Player" }));
}

export async function markAttendeePaid(attendeeId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("event_attendees")
    .update({ status: "paid" })
    .eq("id", attendeeId);
  if (error) throw error;
}

export async function fetchEventSwish(eventId: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("get_event_swish", { _event_id: eventId });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function fetchEventContact(eventId: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("get_event_contact", { _event_id: eventId });
  if (error) return null;
  return (data as string | null) ?? null;
}
