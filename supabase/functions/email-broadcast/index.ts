// Supabase Edge Function: email-broadcast
// Admin-only email blast to every registered user, via Resend.
//
// Body: { subject: string, body: string, test?: boolean }
//   test=true → sends ONLY to the calling admin (dry-run before the real blast).
//
// Secrets: RESEND_API_KEY (required), BROADCAST_FROM (optional; defaults to
//   Resend's shared onboarding sender until the court-ship.com domain is
//   verified in Resend — then set e.g. "Courtship <hello@court-ship.com>").
//
// Security: platform JWT-gated + we re-verify the caller's own profiles row
// has is_admin=true using the service role. Non-admins get 403.
// Batching: Resend allows up to 100 recipients per /emails/batch call; each
// user gets an INDIVIDUAL email (no exposed recipient lists, no BCC leaks).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

/** "Name <email>" → Brevo sender object; bare address works too. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

/** Send a batch through whichever provider is configured. Brevo (ex-Sendinblue)
 *  wins when both keys exist — single-sender verification works without DNS,
 *  which is how this project actually sends (2026-08-14). Brevo has no batch
 *  endpoint, so it loops; Resend keeps the original /emails/batch call. */
async function sendBatch(batch: Array<{ from: string; to: string[]; subject: string; html: string }>): Promise<{ ok: boolean; detail: string }> {
  if (BREVO_KEY) {
    let okAll = true;
    let detail = "";
    for (const m of batch) {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": BREVO_KEY },
        body: JSON.stringify({
          sender: parseFrom(m.from),
          to: m.to.map((email) => ({ email })),
          subject: m.subject,
          htmlContent: m.html,
        }),
      });
      if (!r.ok) {
        okAll = false;
        if (!detail) detail = `${r.status} ${await r.text().catch(() => "")}`.slice(0, 200);
      }
    }
    return { ok: okAll, detail };
  }
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify(batch),
  });
  return { ok: r.ok, detail: r.ok ? "" : `${r.status} ${await r.text().catch(() => "")}`.slice(0, 200) };
}

const FROM = Deno.env.get("BROADCAST_FROM") ?? "Courtship <onboarding@resend.dev>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const APP = "https://court-ship.com";

/** Minimal branded HTML wrapper (cream/ink, Courtship tone). */
function html(bodyText: string, unsubUrl: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F6F0E1;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Georgia,serif;color:#2B2118;">
    <div style="font-size:22px;font-weight:bold;margin-bottom:18px;">🎾 Courtship</div>
    <div style="background:#FDF9EE;border:2px solid #2B2118;border-radius:14px;padding:22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;">
      ${paragraphs}
    </div>
    <p style="font-size:12px;color:#8C5A33;margin-top:16px;font-family:Arial,Helvetica,sans-serif;">
      You're getting this because you have a Courtship account.
      Reply to this email to reach Oksana directly.
      <a href="${unsubUrl}" style="color:#8C5A33">Unsubscribe</a> or manage emails in
      <a href="${APP}/settings" style="color:#8C5A33">Settings</a>.
    </p>
  </div></body></html>`;
}

/** ePrivacy/CAN-SPAM: skip addresses on the suppression list. */
async function dropSuppressed(sb: any, emails: string[]): Promise<string[]> {
  if (!emails.length) return emails;
  const bad = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await sb.from("suppressed_emails").select("email").in("email", emails.slice(i, i + 500));
    for (const r of data ?? []) bad.add(r.email);
  }
  return emails.filter((e) => !bad.has(e));
}

/** Get-or-create a one-click unsubscribe token per address (works logged out). */
async function unsubTokens(sb: any, emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    const { data } = await sb.from("email_unsubscribe_tokens").select("email,token").in("email", chunk);
    for (const r of data ?? []) map.set(r.email, r.token);
    const missing = chunk.filter((e) => !map.has(e));
    if (missing.length) {
      const rows = missing.map((e) => ({
        email: e,
        token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
      }));
      await sb.from("email_unsubscribe_tokens").upsert(rows, { onConflict: "email", ignoreDuplicates: true });
      const { data: again } = await sb.from("email_unsubscribe_tokens").select("email,token").in("email", missing);
      for (const r of again ?? []) map.set(r.email, r.token);
    }
  }
  return map;
}

Deno.serve(async (req) => {
  try {
    if (!RESEND_KEY && !BREVO_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }), { status: 500 });
    }
    // Identify the caller from their JWT, then hard-verify is_admin.
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await sb.auth.getUser(jwt);
    const uid = caller?.user?.id;
    if (!uid) return new Response(JSON.stringify({ ok: false, error: "not_authenticated" }), { status: 401 });
    const { data: me } = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
    if (!me?.is_admin) return new Response(JSON.stringify({ ok: false, error: "not_admin" }), { status: 403 });

    const { subject, body, test } = await req.json().catch(() => ({}));
    if (!subject || !body) {
      return new Response(JSON.stringify({ ok: false, error: "subject and body required" }), { status: 400 });
    }

    // Recipients: every auth user who hasn't opted out (test → only the
    // calling admin). Legal pack 2026-07-20: the blast now honors
    // profiles.email_notifs AND the suppression list, and every email carries
    // a one-click unsubscribe link (ePrivacy soft opt-in requires a working
    // opt-out on EVERY message, not just a settings page behind a login).
    let emails: string[] = [];
    if (test) {
      emails = [caller!.user!.email!].filter(Boolean) as string[];
    } else {
      const optedOut = new Set<string>();
      try {
        const { data: profs } = await sb.from("profiles").select("id,email_notifs");
        for (const p of profs ?? []) if (p.email_notifs === false) optedOut.add(p.id);
      } catch (_) { /* column may not exist pre-SQL → treat all as opted-in */ }
      let page = 1;
      while (true) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        emails.push(...(data.users ?? [])
          .filter((u) => !optedOut.has(u.id))
          .map((u) => u.email).filter(Boolean) as string[]);
        if (!data.users || data.users.length < 1000) break;
        page += 1;
      }
      emails = await dropSuppressed(sb, [...new Set(emails)]);
    }
    if (!emails.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const tokens = await unsubTokens(sb, emails);
    let sent = 0;
    const failures: string[] = [];
    // Individual emails, batched 100 per Resend batch call.
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100).map((to) => ({
        from: FROM,
        to: [to],
        subject: String(subject),
        html: html(String(body), `${APP}/unsubscribe?token=${tokens.get(to) ?? ""}`),
      }));
      const r = await sendBatch(batch);
      if (r.ok) sent += batch.length;
      else failures.push(`batch ${i / 100}: ${r.detail}`.slice(0, 200));
    }
    return new Response(JSON.stringify({ ok: failures.length === 0, sent, total: emails.length, failures }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
