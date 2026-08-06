import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

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

// Signup is open (2026-08-06), but a shared link still carries the user's invite
// code — it auto-buddies the newcomer with the inviter and credits the referral.
// An optional `next` deep-links them straight to a specific game once they're in.
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

// One-tap "invite a friend" — builds my invite link + code and opens the share
// sheet. Pass the already-translated message template ("{link}"/"{code}") and
// the copied-toast text so this lib stays i18n-free.
export async function shareInvite(messageTemplate: string, copiedNote: string): Promise<void> {
  const link = await myInviteLink();
  let code = "";
  try { code = new URL(link).searchParams.get("code") ?? ""; } catch { /* ignore */ }
  const msg = messageTemplate.replace("{link}", link).replace("{code}", code);
  await shareMessage(msg, copiedNote);
}

// Native share sheet (WhatsApp / Telegram / etc.) with a clipboard fallback.
// Share any in-app destination (a game / event) with your invite link baked in,
// so whoever a friend forwards it to lands on it and can sign up in one flow.
export async function shareTo(next: string, messageTemplate: string, copiedNote: string): Promise<void> {
  const link = await myInviteLink(next);
  let msg = messageTemplate.replace("{link}", link);
  // Belt & suspenders: a share without its link is pointless — if the template
  // arrived without the placeholder (e.g. an interpolator ate it), append it.
  if (!msg.includes(link)) msg = `${msg.trim()} ${link}`;
  await shareMessage(msg, copiedNote);
}

/** Legacy textarea+execCommand copy — works where the async Clipboard API is
 *  denied (e.g. the cross-origin Lovable preview iframe). Deprecated but the
 *  most reliable fallback under a user gesture. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy with the full fallback chain; NEVER fails silently (a dead button is
 *  indistinguishable from a broken app — 2026-07-25 tester report from the
 *  preview iframe, where navigator.clipboard is permission-blocked). */
export async function copyText(text: string, copiedNote: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copiedNote);
    return;
  } catch { /* clipboard API denied — try legacy */ }
  if (legacyCopy(text)) {
    toast.success(copiedNote);
    return;
  }
  // Last resort: show the text so it can be copied by hand.
  try { window.prompt(copiedNote, text); } catch { toast.error(text); }
}

export async function shareMessage(message: string, copiedNote: string): Promise<void> {
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ text: message });
      return;
    } catch {
      return; // user dismissed the sheet
    }
  }
  await copyText(message, copiedNote);
}

/** Share link for a GAME: lands on the public preview (/g/<id>), value first —
 *  signup is asked only when the guest taps "I'm in". Carries my invite code. */
export async function myGameShareLink(gameId: string): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let code: string | null = null;
  try {
    const { data } = await (supabase as any).rpc("ensure_my_invite_code");
    code = (data as string | null) ?? null;
  } catch { /* fine — page still works, invite gate will ask */ }
  return `${origin}/g/${gameId}${code ? `?code=${encodeURIComponent(code)}` : ""}`;
}
