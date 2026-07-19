// email-notify — the second notification channel.
// _push_users posts the same payload here as to notify-users (web push);
// we resolve each user's email (service role), honor profiles.email_notifs,
// and send a small branded email via Resend. Fire-and-forget: any failure
// returns 200 so the DB caller never blocks.
// Secrets: RESEND_API_KEY (required to actually send; otherwise no-op),
// BROADCAST_FROM (optional; defaults to Resend's onboarding sender).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("BROADCAST_FROM") ?? "Courtship <onboarding@resend.dev>";
const APP = "https://court-ship.com";

function html(title: string, body: string, url: string) {
  const link = `${APP}${url?.startsWith("/") ? url : "/board"}`;
  return `<!doctype html><html><body style="margin:0;background:#F6F0E1;font-family:Georgia,serif;color:#2B2118;padding:24px">
  <div style="max-width:460px;margin:0 auto;background:#FDF9EE;border:2px solid #2B2118;border-radius:16px;padding:22px">
    <div style="font-size:22px;font-weight:bold">${title}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;margin-top:10px">${body}</div>
    <a href="${link}" style="display:inline-block;margin-top:16px;background:#FF5747;color:#FFF6E8;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border:2px solid #2B2118;border-radius:12px;padding:10px 18px">Open Courtship 🎾</a>
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#8a7f70;margin-top:18px">You get these because game activity involves you. Turn them off anytime in Settings.</div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const { user_ids, title, body, url } = await req.json().catch(() => ({}));
    if (!Array.isArray(user_ids) || !user_ids.length || !title) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
    }
    if (!RESEND_KEY) return new Response(JSON.stringify({ ok: true, skipped: "no RESEND_API_KEY" }), { status: 200 });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // honor per-user opt-out (column may not exist pre-SQL → treat as opted-in)
    let allowed = new Set<string>(user_ids as string[]);
    try {
      const { data: profs } = await sb.from("profiles").select("id,email_notifs").in("id", user_ids);
      if (profs) allowed = new Set(profs.filter((p: any) => p.email_notifs !== false).map((p: any) => p.id));
    } catch (_) { /* keep all */ }

    const emails: string[] = [];
    for (const id of user_ids as string[]) {
      if (!allowed.has(id)) continue;
      const { data } = await sb.auth.admin.getUserById(id);
      const e = data?.user?.email;
      if (e) emails.push(e);
    }
    if (!emails.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const htmlBody = html(String(title), String(body ?? ""), String(url ?? "/board"));
    const batch = [...new Set(emails)].slice(0, 100).map((to) => ({
      from: FROM, to: [to], subject: String(title), html: htmlBody,
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
