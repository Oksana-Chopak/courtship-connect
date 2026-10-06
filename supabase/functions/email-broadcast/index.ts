// Supabase Edge Function: email-broadcast
// Admin-only email blast to every registered user, via Brevo (Resend fallback).
//
// Body: { subject: string, body: string, test?: boolean }
//   test=true → sends ONLY to the calling admin (dry-run before the real blast).
//
// Secrets: BREVO_API_KEY (or RESEND_API_KEY), BROADCAST_FROM
//   (e.g. "Courtship <hello@court-ship.com>" — the verified Brevo sender).
//
// Security: platform JWT-gated + we re-verify the caller's own profiles row
// has is_admin=true using the service role. Non-admins get 403.
// Each user gets an INDIVIDUAL email (no exposed recipient lists, no BCC leaks).
//
// Counting + re-runs (Lovable scan 2026-10-05): every delivery is counted per
// address, never per batch, and every success is written to email_send_log
// (template 'broadcast', key = hash of subject+body). Sending the SAME
// subject+body again only reaches the addresses that did not get it — so a
// re-run after a partial failure is a retry, never a duplicate.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

/** Who signs and how players reach her — same block as the lifecycle emails. */
const CONTACT = {
  name: Deno.env.get("CONTACT_NAME") ?? "Oksana",
  whatsapp: (Deno.env.get("CONTACT_WHATSAPP") ?? "+46700266274").replace(/\D/g, ""),
  email: Deno.env.get("CONTACT_EMAIL") ?? "oksana.chopak@gmail.com",
};
function contactBlock(): string {
  const wa = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hej ${CONTACT.name}! `)}`;
  return `<div style="margin-top:18px;padding-top:12px;border-top:1px solid rgba(43,33,24,.15);font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.5">
      <div style="font-weight:bold">Frågor? Skriv direkt till mig · Questions? Write to me directly</div>
      <div style="margin-top:8px"><a href="${wa}" style="display:inline-block;border:2px solid #2B2118;border-radius:10px;padding:7px 12px;color:#2B2118;font-weight:bold;text-decoration:none;background:#fff">💬 WhatsApp</a>
        <span style="color:#8C5A33">&nbsp;·&nbsp;</span><a href="mailto:${CONTACT.email}" style="color:#2B2118;font-weight:bold">${CONTACT.email}</a></div>
      <div style="margin-top:8px;font-family:Georgia,serif;font-size:14px">— ${CONTACT.name}, Courtship</div>
    </div>`;
}

/** "Name <email>" → Brevo sender object; bare address works too. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

type Mail = { from: string; to: string[]; subject: string; html: string };

/** Send a batch through whichever provider is configured and report PER
 *  ADDRESS. Brevo (ex-Sendinblue) wins when both keys exist — single-sender
 *  verification works without DNS, which is how this project actually sends.
 *  Brevo has no batch endpoint, so it loops (one failure never hides the other
 *  99 deliveries); Resend keeps the original /emails/batch call. */
async function sendBatch(batch: Mail[]): Promise<{ sent: string[]; failed: Array<{ to: string; detail: string }> }> {
  const sent: string[] = [];
  const failed: Array<{ to: string; detail: string }> = [];
  if (BREVO_KEY) {
    for (const m of batch) {
      try {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": BREVO_KEY },
          body: JSON.stringify({
            sender: parseFrom(m.from),
            replyTo: { email: CONTACT.email, name: CONTACT.name },
            to: m.to.map((email) => ({ email })),
            subject: m.subject,
            htmlContent: m.html,
          }),
        });
        if (r.ok) sent.push(m.to[0]);
        else failed.push({ to: m.to[0], detail: `${r.status} ${await r.text().catch(() => "")}`.slice(0, 160) });
      } catch (e) {
        failed.push({ to: m.to[0], detail: String(e).slice(0, 160) });
      }
    }
    return { sent, failed };
  }
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify(batch),
  });
  if (r.ok) sent.push(...batch.map((m) => m.to[0]));
  else {
    const detail = `${r.status} ${await r.text().catch(() => "")}`.slice(0, 160);
    failed.push(...batch.map((m) => ({ to: m.to[0], detail })));
  }
  return { sent, failed };
}

/** Stable key for "this exact email": same subject + body → same key. */
async function broadcastKey(subject: string, body: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${subject}\n\n${body}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Addresses that already received this exact email (ledger = email_send_log). */
async function alreadySent(sb: any, key: string, emails: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (!emails.length) return done;
  try {
    const { data } = await sb.from("email_send_log").select("recipient_email")
      .eq("template_name", "broadcast").eq("status", "sent").contains("metadata", { key });
    for (const r of data ?? []) done.add(r.recipient_email);
  } catch (_) { /* ledger unavailable → treat as fresh */ }
  return done;
}

async function recordSent(sb: any, key: string, emails: string[], subject: string): Promise<void> {
  if (!emails.length) return;
  try {
    await sb.from("email_send_log").insert(emails.map((e) => ({
      template_name: "broadcast", recipient_email: e, status: "sent", metadata: { key, subject: subject.slice(0, 120) },
    })));
  } catch (_) { /* counting is best-effort; the send already happened */ }
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
      ${contactBlock()}
    </div>
    <p style="font-size:12px;color:#8C5A33;margin-top:16px;font-family:Arial,Helvetica,sans-serif;line-height:1.5">
      Du får det här för att du har ett Courtship-konto. Svara på mejlet så når du ${CONTACT.name} direkt.
      <a href="${unsubUrl}" style="color:#8C5A33">Avsluta prenumeration</a> · <a href="${APP}/settings" style="color:#8C5A33">Inställningar</a><br>
      You're getting this because you have a Courtship account. Reply to this email to reach ${CONTACT.name} directly.
      <a href="${unsubUrl}" style="color:#8C5A33">Unsubscribe</a> · <a href="${APP}/settings" style="color:#8C5A33">Settings</a>
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


// ── CORS (2026-10-06) ────────────────────────────────────────────────────────
// Browsers send a preflight (OPTIONS) before any call that carries the
// Authorization header — i.e. every supabase.functions.invoke() from the app.
// Without these headers the browser refuses the call before it even leaves:
// "Failed to send a request to the Edge Function". Server-side callers
// (pg_net from DB triggers, pg_cron) never needed them, which is why the
// DB-driven pushes worked while every button in the app silently did not.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const h = new Headers(init.headers ?? {});
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  if (!h.has("content-type")) h.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!RESEND_KEY && !BREVO_KEY) {
      return jsonResponse({ ok: false, error: "No email provider key (BREVO_API_KEY) configured" }, { status: 500 });
    }
    // Identify the caller from their JWT, then hard-verify is_admin.
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await sb.auth.getUser(jwt);
    const uid = caller?.user?.id;
    if (!uid) return jsonResponse({ ok: false, error: "not_authenticated" }, { status: 401 });
    const { data: me } = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
    if (!me?.is_admin) return jsonResponse({ ok: false, error: "not_admin" }, { status: 403 });

    const { subject, body, test } = await req.json().catch(() => ({}));
    if (!subject || !body) {
      return jsonResponse({ ok: false, error: "subject and body required" }, { status: 400 });
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
        if (error) return jsonResponse({ ok: false, error: error.message }, { status: 500 });
        emails.push(...(data.users ?? [])
          .filter((u) => !optedOut.has(u.id))
          .map((u) => u.email).filter(Boolean) as string[]);
        if (!data.users || data.users.length < 1000) break;
        page += 1;
      }
      emails = await dropSuppressed(sb, [...new Set(emails)]);
    }
    if (!emails.length) return jsonResponse({ ok: true, sent: 0, total: 0, skipped: 0, failed: [] }, { status: 200 });

    // Re-run safety: the same subject+body never reaches an address twice
    // (a test send to yourself is exempt — you may want to see it again).
    const key = await broadcastKey(String(subject), String(body));
    const total = emails.length;
    const done = test ? new Set<string>() : await alreadySent(sb, key, emails);
    emails = emails.filter((e) => !done.has(e));

    const tokens = await unsubTokens(sb, emails);
    let sent = 0;
    const failed: Array<{ to: string; detail: string }> = [];
    // Individual emails, batched 100 per Resend batch call.
    for (let i = 0; i < emails.length; i += 100) {
      const batch: Mail[] = emails.slice(i, i + 100).map((to) => ({
        from: FROM,
        to: [to],
        subject: String(subject),
        html: html(String(body), `${APP}/unsubscribe?token=${tokens.get(to) ?? ""}`),
      }));
      const r = await sendBatch(batch);
      sent += r.sent.length;
      failed.push(...r.failed);
      if (!test) await recordSent(sb, key, r.sent, String(subject));
    }
    return jsonResponse({
      ok: failed.length === 0, sent, total, skipped: done.size,
      failed: failed.slice(0, 50), from: FROM,
      // kept for older clients
      failures: failed.slice(0, 50).map((f) => `${f.to}: ${f.detail}`),
    }, { status: 200 });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 });
  }
});
