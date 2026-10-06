// Supabase Edge Function: notify-users
// Generic direct push to a set of users. Used for game cancellations and match
// invites. JWT-gated by the platform (only authenticated members can call it).
//
// Body: { user_ids: string[], title: string, body: string, url?: string, tag?: string }
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (+ auto SUPABASE_*).
//
// NOTE (hardening TODO): for a trusted invite-only beta we only gate on auth.
// Later, verify the caller may notify each target (host of the sos / buddy).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:oksana.chopak@gmail.com";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";

/** verify_jwt accepts ANY valid JWT — including the public anon key. When
 * NOTIFY_SECRET is configured, anon-role callers must present the matching
 * x-notify-secret header (the DB's _push_users sends it from Vault); signed-in
 * members keep working as before. Unset secret = unchanged behavior
 * (2026-07-20 audit hardening). */
function callerRole(req: Request): string {
  try {
    const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload?.role ?? "");
  } catch {
    return "";
  }
}

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
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
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return jsonResponse({ ok: false, error: "VAPID keys not configured" }, { status: 500 });
    }
    if (NOTIFY_SECRET && callerRole(req) === "anon" && req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
      // The DB signs its calls with internal_config.notify_secret (Package 3);
      // accept that too, so the Lovable secret and the DB can never drift apart
      // into silently refused pushes (2026-10-06).
      const given = req.headers.get("x-notify-secret") ?? "";
      let dbSecret = "";
      try { const { data } = await createClient(SUPABASE_URL, SERVICE_KEY).from("internal_config").select("value").eq("key", "notify_secret").maybeSingle(); dbSecret = data?.value ?? ""; } catch { /* no table */ }
      if (!dbSecret || given !== dbSecret) return jsonResponse({ ok: false, error: "forbidden" }, { status: 401 });
    }
    const { user_ids, title, body, url, tag } = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(user_ids) ? [...new Set(user_ids.filter(Boolean))].slice(0, 200) : [];
    if (!ids.length || !title) {
      return jsonResponse({ ok: true, skipped: "no_targets" }, { status: 200 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", ids);
    if (error) return jsonResponse({ ok: false, error: error.message }, { status: 500 });

    const notif = JSON.stringify({
      title,
      body: body ?? "",
      url: url ?? "/board",
      tag: tag ?? "courtship",
    });

    const rows = (subs ?? []) as Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>;
    const notified = new Set<string>();
    let sent = 0, pruned = 0;

    await Promise.allSettled(rows.map(async (r) => {
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      try {
        await webpush.sendNotification(subscription as any, notif);
        sent++;
        notified.add(r.user_id);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          pruned++;
        }
      }
    }));

    if (notified.size > 0) {
      await sb.from("push_events").insert([...notified].map((uid) => ({ user_id: uid, kind: "direct" })));
    }
    return jsonResponse({ ok: true, targets: rows.length, sent, pruned }, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return jsonResponse({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
});
