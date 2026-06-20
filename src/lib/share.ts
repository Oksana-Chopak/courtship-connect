import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NEXT_KEY = "courtship.next";

function safePath(p: string | null | undefined): string | null {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
}

// Remember a deep-link destination so it survives the signup / email-confirm round-trip.
export function rememberNext(next: string | null | undefined) {
  const p = safePath(next);
  try {
    if (p) localStorage.setItem(NEXT_KEY, p);
  } catch {
    /* ignore */
  }
}

export function consumeNext(): string | null {
  try {
    const n = localStorage.getItem(NEXT_KEY);
    if (n) localStorage.removeItem(NEXT_KEY);
    return safePath(n);
  } catch {
    return null;
  }
}

// The app is invite-only, so a shared link carries the user's invite code — that way
// someone arriving from an external tennis chat can sign up. An optional `next`
// deep-links them straight to a specific game once they're in.
export async function myInviteLink(next?: string): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let code: string | null = null;
  try {
    const { data } = await (supabase as any).rpc("ensure_my_invite_code");
    code = (data as string | null) ?? null;
  } catch {
    /* fall through */
  }
  if (!code) return origin;
  const params = new URLSearchParams({ code });
  const p = safePath(next);
  if (p) params.set("next", p);
  return `${origin}/auth?${params.toString()}`;
}

// Native share sheet (WhatsApp / Telegram / etc.) with a clipboard fallback.
export async function shareMessage(message: string, copiedNote: string): Promise<void> {
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ text: message });
      return;
    } catch {
      return; // user dismissed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    toast.success(copiedNote);
  } catch {
    /* ignore */
  }
}
