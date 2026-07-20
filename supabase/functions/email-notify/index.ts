// email-notify — the second notification channel.
// _push_users posts the same payload here as to notify-users (web push);
// we resolve each user's email (service role), honor profiles.email_notifs,
// and send a small branded email via Resend. Fire-and-forget: any failure
// returns 200 so the DB caller never blocks.
// Secrets: RESEND_API_KEY (required to actually send; otherwise no-op),
// BROADCAST_FROM (optional; defaults to Resend's onboarding sender),
// NOTIFY_SECRET (optional hardening: when set, anon-key callers must present
// the matching x-notify-secret header — _push_users reads it from Vault).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("BROADCAST_FROM") ?? "Courtship <onboarding@resend.dev>";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const APP = "https://court-ship.com";

/** The platform's verify_jwt accepts ANY valid JWT — including the public anon
 * key. Read the caller's role so we can refuse anonymous senders when the
 * shared secret is configured (2026-07-20 audit hardening). */
function callerRole(req: Request): string {
  try {
    const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload?.role ?? "");
  } catch {
    return "";
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function html(title: string, body: string, url: string, unsubUrl: string) {
  const link = `${APP}${url?.startsWith("/") ? url : "/board"}`;
  return `<!doctype html><html><body style="margin:0;background:#F6F0E1;font-family:Georgia,serif;color:#2B2118;padding:24px">
  <div style="max-width:460px;margin:0 auto;background:#FDF9EE;border:2px solid #2B2118;border-radius:16px;padding:22px">
    <div style="font-size:22px;font-weight:bold">${esc(title)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;margin-top:10px">${esc(body)}</div>
    <a href="${link}" style="display:inline-block;margin-top:16px;background:#FF5747;color:#FFF6E8;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border:2px solid #2B2118;border-radius:12px;padding:10px 18px">Open Courtship 🎾</a>
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#8a7f70;margin-top:18px">You get these because game activity involves you.
      <a href="${APP}/settings" style="color:#8a7f70">Turn email notifications off in Settings</a>
      or <a href="${unsubUrl}" style="color:#8a7f70">unsubscribe with one click</a>.</div>
  </div></body></html>`;
}

/** ePrivacy/CAN-SPAM: skip addresses on the suppression list. */
async function dropSuppressed(sb: any, emails: string[]): Promise<string[]> {
  if (!emails.length) return emails;
  const { data } = await sb.from("suppressed_emails").select("email").in("email", emails);
  const bad = new Set((data ?? []).map((r: any) => r.email));
  return emails.filter((e) => !bad.has(e));
}

/** Get-or-create a one-click unsubscribe token per address (works logged out). */
async function unsubTokens(sb: any, emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!emails.length) return map;
  const { data } = await sb.from("email_unsubscribe_tokens").select("email,token").in("email", emails);
  for (const r of data ?? []) map.set(r.email, r.token);
  const missing = emails.filter((e) => !map.has(e));
  if (missing.length) {
    const rows = missing.map((e) => ({
      email: e,
      token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
    }));
    await sb.from("email_unsubscribe_tokens").upsert(rows, { onConflict: "email", ignoreDuplicates: true });
    const { data: again } = await sb.from("email_unsubscribe_tokens").select("email,token").in("email", missing);
    for (const r of again ?? []) map.set(r.email, r.token);
  }
  return map;
}

Deno.serve(async (req) => {
  try {
    // Hardening: with NOTIFY_SECRET set, anonymous (anon-role) callers must
    // present the shared secret; signed-in members pass as before. With the
    // secret unset, behavior is unchanged — safe to deploy in any order.
    if (NOTIFY_SECRET && callerRole(req) === "anon" && req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 401 });
    }
    const { user_ids, title, body, url } = await req.json().catch(() => ({}));
    if (!Array.isArray(user_ids) || !user_ids.length || !title) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
    }
    if (!RESEND_KEY) return new Response(JSON.stringify({ ok: true, skipped: "no RESEND_API_KEY" }), { status: 200 });

    const ids = [...new Set((user_ids as string[]).filter(Boolean))].slice(0, 200);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // honor per-user opt-out (column may not exist pre-SQL → treat as opted-in)
    let allowed = new Set<string>(ids);
    try {
      const { data: profs } = await sb.from("profiles").select("id,email_notifs").in("id", ids);
      if (profs) allowed = new Set(profs.filter((p: any) => p.email_notifs !== false).map((p: any) => p.id));
    } catch (_) { /* keep all */ }

    const emails: string[] = [];
    for (const id of ids) {
      if (!allowed.has(id)) continue;
      const { data } = await sb.auth.admin.getUserById(id);
      const e = data?.user?.email;
      if (e) emails.push(e);
    }
    if (!emails.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const finalEmails = await dropSuppressed(sb, [...new Set(emails)]);
    if (!finalEmails.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
    const tokens = await unsubTokens(sb, finalEmails);
    const batch = finalEmails.slice(0, 100).map((to) => ({
      from: FROM, to: [to], subject: String(title),
      html: html(String(title), String(body ?? ""), String(url ?? "/board"),
        `${APP}/unsubscribe?token=${tokens.get(to) ?? ""}`),
    }));
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify(batch),
    });
    return new Response(JSON.stringify({ ok: r.ok, sent: r.ok ? batch.length : 0 }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 200) }), { status: 200 });
  }
});
