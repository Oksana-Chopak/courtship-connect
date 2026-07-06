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

/** The community Swish number (same app_config row the SupportCard uses). */
export async function fetchSwishNumber(): Promise<string | null> {
  try {
    const { data } = await (supabase as any).rpc("get_support_swish");
    const v = (data as string | null)?.trim();
    return v ? v : null;
  } catch { return null; }
}

/** Normalize a Swedish Swish payee to digits (07x… → 467x…). */
export function swishDigits(raw: string): string {
  let d = raw.replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = "46" + d.slice(1);
  return d;
}

/** Prefilled Swish payment deep link (opens the Swish app with everything set). */
export function swishPayLink(number: string, amountSek: number, msg: string): string {
  const payee = swishDigits(number);
  const p = new URLSearchParams({ sw: payee, amt: String(amountSek), cur: "SEK", msg: msg.slice(0, 50), edit: "msg" });
  return `https://app.swish.nu/1/p/sw/?${p.toString()}`;
}

export function tierBadge(tier: string | null | undefined): string | null {
  if (!tier) return null;
  if (tier === "pro") return "PRO";
  return "🏆";
}
