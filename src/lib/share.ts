import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// The app is invite-only, so a shared game link must carry the user's invite
// code — that way someone arriving from an external tennis chat can sign up.
export async function myInviteLink(): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  try {
    const { data } = await (supabase as any).rpc("ensure_my_invite_code");
    const code = (data as string | null) ?? null;
    return code ? `${origin}/auth?code=${encodeURIComponent(code)}` : origin;
  } catch {
    return origin;
  }
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
