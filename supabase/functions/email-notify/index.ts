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
          replyTo: { email: CONTACT.email, name: CONTACT.name },
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
    <a href="${link}" style="display:inline-block;margin-top:16px;background:#FF5747;color:#FFF6E8;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border:2px solid #2B2118;border-radius:12px;padding:10px 18px">Öppna Courtship · Open Courtship 🎾</a>
    ${contactBlock()}
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#8a7f70;margin-top:16px;line-height:1.5">Du får det här för att det rör ett spel du är med i.
      <a href="${APP}/settings" style="color:#8a7f70">Stäng av mejlnotiser i Inställningar</a> · <a href="${unsubUrl}" style="color:#8a7f70">avsluta med ett klick</a>.<br>
      You get these because game activity involves you.
      <a href="${APP}/settings" style="color:#8a7f70">Turn email notifications off in Settings</a> or <a href="${unsubUrl}" style="color:#8a7f70">unsubscribe with one click</a>.</div>
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
    // Hardening: with NOTIFY_SECRET set, anonymous (anon-role) callers must
    // present the shared secret; signed-in members pass as before. With the
    // secret unset, behavior is unchanged — safe to deploy in any order.
    if (NOTIFY_SECRET && callerRole(req) === "anon" && req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
      // Also accept the DB-side secret (internal_config.notify_secret, Package 3)
      // so a drift between the Lovable secret and the DB never silently refuses mail.
      const given = req.headers.get("x-notify-secret") ?? "";
      let dbSecret = "";
      try {
        const sb0 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
        const { data } = await sb0.from("internal_config").select("value").eq("key", "notify_secret").maybeSingle();
        dbSecret = data?.value ?? "";
      } catch { /* no table */ }
      if (!dbSecret || given !== dbSecret) return jsonResponse({ ok: false, error: "forbidden" }, { status: 401 });
    }
    const { user_ids, title, body, url, kind } = await req.json().catch(() => ({}));
    if (!Array.isArray(user_ids) || !user_ids.length || !title) {
      return jsonResponse({ ok: true, sent: 0 }, { status: 200 });
    }
    if (!RESEND_KEY && !BREVO_KEY) return jsonResponse({ ok: true, skipped: "no BREVO_API_KEY / RESEND_API_KEY" }, { status: 200 });

    const ids = [...new Set((user_ids as string[]).filter(Boolean))].slice(0, 200);
    // Event category decides who gets EMAIL (push is unaffected — BATCH13):
    //   critical → everyone except level 'off'   (picked / cancelled / joined / withdraw)
    //   social   → only users who chose 'all'    (matches, buddy requests, 💔)
    //   digest   → weekly recap: its own toggle, never for 'off'
    const k = kind === "social" || kind === "digest" ? kind : "critical";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Per-user email policy. The new columns may not exist pre-BATCH13 — fall
    // back to the legacy single toggle so behavior degrades, never breaks.
    let allowed = new Set<string>(ids);
    try {
      const { data: profs, error } = await sb.from("profiles").select("id,email_notifs,email_level,email_digest").in("id", ids);
      if (error) throw error;
      if (profs) {
        allowed = new Set(profs.filter((p: any) => {
          const level = (p.email_level as string | null) ?? (p.email_notifs === false ? "off" : "important");
          if (level === "off") return false;
          if (k === "social") return level === "all";
          if (k === "digest") return p.email_digest !== false;
          return true; // critical
        }).map((p: any) => p.id));
      }
    } catch (_) {
      try {
        const { data: profs } = await sb.from("profiles").select("id,email_notifs").in("id", ids);
        if (profs) allowed = new Set(profs.filter((p: any) => p.email_notifs !== false).map((p: any) => p.id));
      } catch (_) { /* keep all */ }
    }

    const emails: string[] = [];
    for (const id of ids) {
      if (!allowed.has(id)) continue;
      const { data } = await sb.auth.admin.getUserById(id);
      const e = data?.user?.email;
      if (e) emails.push(e);
    }
    if (!emails.length) return jsonResponse({ ok: true, sent: 0 }, { status: 200 });

    const finalEmails = await dropSuppressed(sb, [...new Set(emails)]);
    if (!finalEmails.length) return jsonResponse({ ok: true, sent: 0 }, { status: 200 });
    const tokens = await unsubTokens(sb, finalEmails);
    const batch = finalEmails.slice(0, 100).map((to) => ({
      from: FROM, to: [to], subject: String(title),
      html: html(String(title), String(body ?? ""), String(url ?? "/board"),
        `${APP}/unsubscribe?token=${tokens.get(to) ?? ""}`),
    }));
    const r = await sendBatch(batch);
    return jsonResponse({ ok: r.ok, sent: r.ok ? batch.length : 0, detail: r.detail || undefined }, { status: 200 });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e).slice(0, 200) }, { status: 200 });
  }
});
