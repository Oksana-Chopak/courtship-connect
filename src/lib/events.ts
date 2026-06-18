import { supabase } from "@/integrations/supabase/client";

export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  starts_at: string;
  city: string | null;
  location: string;
  format: string | null;
  description: string | null;
  contact: string | null;
  price_sek: number | null;
  status: string;
  created_at: string;
};

export async function createEventRequest(input: {
  title: string;
  starts_at: string;
  city: string | null;
  location: string;
  format: string | null;
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
