import { supabase } from "@/integrations/supabase/client";

export type MemberTier = "member" | "founding" | "pro" | null;

export type MemberLinks = { monthly?: string; yearly?: string; pro?: string };

/** Stripe payment links from app_config (whitelisted keys). Empty pre-SQL. */
export async function fetchMemberLinks(): Promise<MemberLinks> {
  try {
    const { data } = await (supabase as any).rpc("get_member_config");
    const out: MemberLinks = {};
    for (const r of ((data as any[]) ?? [])) {
      if (r.key === "stripe_member_monthly") out.monthly = r.value;
      if (r.key === "stripe_member_yearly") out.yearly = r.value;
      if (r.key === "stripe_pro_monthly") out.pro = r.value;
    }
    return out;
  } catch { return {}; }
}

export async function fetchMyTier(uid: string): Promise<{ tier: MemberTier; since: string | null }> {
  try {
    const { data } = await (supabase as any)
      .from("profiles").select("member_tier,member_since").eq("id", uid).maybeSingle();
    return { tier: (data?.member_tier as MemberTier) ?? null, since: data?.member_since ?? null };
  } catch { return { tier: null, since: null }; }
}

export async function adminSetMember(userId: string, tier: MemberTier): Promise<void> {
  const { error } = await (supabase as any).rpc("admin_set_member", { _user: userId, _tier: tier });
  if (error) throw new Error(error.message);
}

export type FounderRow = { id: string; name: string; last_name: string | null; photo_url: string | null; member_tier: string; member_since: string | null };

export async function fetchFoundersWall(): Promise<FounderRow[]> {
  try {
    const { data } = await (supabase as any).rpc("founders_wall");
    return ((data as any[]) ?? []) as FounderRow[];
  } catch { return []; }
}

export function tierBadge(tier: string | null | undefined): string | null {
  if (!tier) return null;
  if (tier === "pro") return "PRO";
  return "🏆";
}
