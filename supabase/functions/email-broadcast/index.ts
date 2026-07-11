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
const FROM = Deno.env.get("BROADCAST_FROM") ?? "Courtship <onboarding@resend.dev>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Minimal branded HTML wrapper (cream/ink, Courtship tone). */
function html(bodyText: string): string {
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
    </p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    if (!RESEND_KEY) {
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

    // Recipients: every auth user (test → only the calling admin).
    let emails: string[] = [];
    if (test) {
      emails = [caller!.user!.email!].filter(Boolean) as string[];
    } else {
      let page = 1;
      while (true) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        emails.push(...(data.users ?? []).map((u) => u.email).filter(Boolean) as string[]);
        if (!data.users || data.users.length < 1000) break;
        page += 1;
      }
      emails = [...new Set(emails)];
    }
    if (!emails.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const htmlBody = html(String(body));
    let sent = 0;
    const failures: string[] = [];
    // Individual emails, batched 100 per Resend batch call.
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100).map((to) => ({
        from: FROM,
        to: [to],
        subject: String(subject),
        html: htmlBody,
      }));
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify(batch),
      });
      if (r.ok) sent += batch.length;
      else failures.push(`batch ${i / 100}: ${r.status} ${await r.text().catch(() => "")}`.slice(0, 200));
    }
    return new Response(JSON.stringify({ ok: failures.length === 0, sent, total: emails.length, failures }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
