// Supabase Edge Function: sos-notify
// Triggered by a Database Webhook on public.sos_requests (INSERT + UPDATE).
// Sends a Web Push to every eligible rescuer (targeting policy lives in the
// SQL function public.sos_push_targets). Thin sender — no business logic here.
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@club.se)
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@courtship.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

type SosRecord = {
  id: string;
  kind: string;
  status: string;
  play_at: string;
  level_min: number;
  level_max: number;
  court_id: string | null;
};

function whenShort(iso: string): string {
  const d = new Date(iso);
  const tz = "Europe/Stockholm";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
  const dayKey = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x); // YYYY-MM-DD
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  const day = dayKey(d);
  const label = day === today ? "today" : day === tomorrow ? "tomorrow" : new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(d);
  return `${label} ${time}`;
}

// Notify only when a row IS (or just became) an active urgent SOS — never on
// every unrelated UPDATE (e.g. spots_filled), to avoid spamming rescuers.
function shouldNotify(payload: any): string | null {
  const rec = payload?.record as SosRecord | undefined;
  if (payload?.sos_id && !payload?.type) return String(payload.sos_id); // manual/test invoke
  if (!rec) return null;
  const isActiveSos = rec.kind === "sos" && rec.status === "active";
  if (!isActiveSos) return null;
  if (payload.type === "INSERT") return rec.id;
  if (payload.type === "UPDATE") {
    const old = payload.old_record as SosRecord | undefined;
    // fire only on the transition into an active SOS (flare / escalation)
    if (!old || old.kind !== "sos" || old.status !== "active") return rec.id;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ ok: false, error: "VAPID keys not configured" }), { status: 500 });
    }
    const payload = await req.json().catch(() => ({}));
    const sosId = shouldNotify(payload);
    if (!sosId) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Display bits for the copy
    const rec = (payload?.record ?? {}) as SosRecord;
    let courtName = "the court";
    if (rec.court_id) {
      const { data: court } = await sb.from("courts").select("name").eq("id", rec.court_id).maybeSingle();
      if (court?.name) courtName = court.name as string;
    }
    let levelMin = rec.level_min, levelMax = rec.level_max, playAt = rec.play_at;
    if (levelMin == null || playAt == null) {
      const { data: sos } = await sb.from("sos_requests").select("level_min,level_max,play_at").eq("id", sosId).maybeSingle();
      if (sos) { levelMin = sos.level_min; levelMax = sos.level_max; playAt = sos.play_at; }
    }

    const body = `L${levelMin}–${levelMax} ${playAt ? whenShort(playAt) : "soon"} @ ${courtName}. First to claim plays! 🎾`;
    const notif = JSON.stringify({
      title: "🚨 SOS · a partner needs you",
      body,
      url: `/sos/${sosId}`,
      tag: `sos-${sosId}`,
    });

    // Targets (one row per device) from the SQL policy function
    const { data: targets, error } = await sb.rpc("sos_push_targets", { _sos_id: sosId });
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

    const rows = (targets ?? []) as Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>;
    const notifiedUsers = new Set<string>();
    let sent = 0, pruned = 0;

    await Promise.allSettled(rows.map(async (r) => {
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      try {
        await webpush.sendNotification(subscription as any, notif);
        sent++;
        notifiedUsers.add(r.user_id);
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          pruned++;
        }
      }
    }));

    // Log one event per notified user (powers the weekly cap + observability)
    if (notifiedUsers.size > 0) {
      await sb.from("push_events").insert(
        [...notifiedUsers].map((uid) => ({ user_id: uid, sos_id: sosId, kind: "sos" })),
      );
    }

    return new Response(JSON.stringify({ ok: true, targets: rows.length, sent, pruned }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), { status: 500 });
  }
});
