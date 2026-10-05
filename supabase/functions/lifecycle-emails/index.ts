// lifecycle-emails — the welcome / install / community / come-back emails and
// the Monday digest. One function, three entry points:
//
//   1. Daily run (pg_cron, 08:00 Stockholm):  POST {"run":"daily"}  with the
//      x-notify-secret header (public._notify_headers()). Picks at most ONE
//      email per player per day by the rules in planFor(), sends it, records it
//      in public.lifecycle_sends. Idle unless app_config.lifecycle_enabled='true'
//      — until then every run is a dry run (plan only, nothing sent).
//   2. Event send (DB trigger on profiles INSERT): POST {"template":"welcome_0","user_id":…}
//   3. Admin (JWT of an is_admin profile): {"dry":true} → the plan for today;
//      {"preview":"<template>"} → that email, to the admin's own inbox.
//
// Sending: Brevo (BREVO_API_KEY) or Resend (RESEND_API_KEY). Honors
// profiles.email_level ('off' → nothing), email_digest, suppressed_emails and
// puts a one-click unsubscribe link in every footer. Copy lives in templates.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { render, TEMPLATES, type Ctx, type GameLine } from "./templates.ts";

const APP = "https://court-ship.com";
const FROM = Deno.env.get("BROADCAST_FROM") ?? "Courtship <onboarding@resend.dev>";
const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DAILY_CAP = 150;          // Brevo free tier is 300/day; leave room for game pings
const DAY = 86400e3;

type AuthUser = { id: string; email: string; created_at: string; last_sign_in_at: string | null };
type Profile = {
  id: string; name: string | null; created_at: string; last_seen_at: string | null; installed_at: string | null;
  games_played: number | null; email_level: string | null; email_notifs: boolean | null; email_digest: boolean | null;
  home_city: string | null;
};
type Plan = { user: AuthUser; profile: Profile | null; template: string; reason: string };

function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

async function sendOne(to: string, subject: string, html: string): Promise<{ ok: boolean; detail: string }> {
  if (BREVO_KEY) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_KEY },
      body: JSON.stringify({ sender: parseFrom(FROM), replyTo: parseFrom(FROM), to: [{ email: to }], subject, htmlContent: html }),
    });
    return { ok: r.ok, detail: r.ok ? "" : `${r.status} ${await r.text().catch(() => "")}`.slice(0, 200) };
  }
  if (RESEND_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    return { ok: r.ok, detail: r.ok ? "" : `${r.status} ${await r.text().catch(() => "")}`.slice(0, 200) };
  }
  return { ok: false, detail: "no BREVO_API_KEY / RESEND_API_KEY" };
}

async function dropSuppressed(sb: any, emails: string[]): Promise<Set<string>> {
  const bad = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await sb.from("suppressed_emails").select("email").in("email", emails.slice(i, i + 500));
    for (const r of data ?? []) bad.add(r.email);
  }
  return bad;
}

async function unsubToken(sb: any, email: string): Promise<string> {
  const { data } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", email).maybeSingle();
  if (data?.token) return data.token;
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await sb.from("email_unsubscribe_tokens").upsert({ email, token }, { onConflict: "email", ignoreDuplicates: true });
  const { data: again } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", email).maybeSingle();
  return again?.token ?? token;
}

async function listAuthUsers(sb: any): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users ?? []) if (u.email) out.push({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
    if (!data.users || data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

const stockholmDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(d); // YYYY-MM-DD
const isMondayInStockholm = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", weekday: "short" }).format(d) === "Mon";

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const tz = "Europe/Stockholm";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
  const day = stockholmDay(d), today = stockholmDay(new Date()), tomorrow = stockholmDay(new Date(Date.now() + DAY));
  const label = day === today ? "Today" : day === tomorrow ? "Tomorrow" : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
  return `${label} ${time}`;
}

/** Up to 5 open public games, soonest first, with court and host names. */
async function openGames(sb: any): Promise<{ games: GameLine[]; count: number }> {
  const { data, count } = await sb.from("sos_requests")
    .select("id,kind,play_at,court_id,caller_id,broadcast", { count: "exact" })
    .eq("status", "active").gt("play_at", new Date().toISOString()).neq("broadcast", false)
    .order("play_at", { ascending: true }).limit(5);
  const rows = (data ?? []) as any[];
  if (!rows.length) return { games: [], count: count ?? 0 };
  const courtIds = [...new Set(rows.map((r) => r.court_id).filter(Boolean))];
  const hostIds = [...new Set(rows.map((r) => r.caller_id).filter(Boolean))];
  const [{ data: courts }, { data: hosts }] = await Promise.all([
    courtIds.length ? sb.from("courts").select("id,name,city").in("id", courtIds) : Promise.resolve({ data: [] }),
    hostIds.length ? sb.from("profiles").select("id,name").in("id", hostIds) : Promise.resolve({ data: [] }),
  ]);
  const cmap = new Map((courts ?? []).map((c: any) => [c.id, c]));
  const hmap = new Map((hosts ?? []).map((h: any) => [h.id, h.name]));
  return {
    count: count ?? rows.length,
    games: rows.map((r) => {
      const c: any = cmap.get(r.court_id);
      return { when: whenLabel(r.play_at), court: c ? `${c.name}${c.city ? " · " + c.city : ""}` : "the court", host: hmap.get(r.caller_id) ?? "A player", url: `${APP}/sos/${r.id}`, sos: r.kind === "sos" };
    }),
  };
}

type World = {
  now: Date; monday: boolean;
  profiles: Map<string, Profile>; pushOn: Set<string>; buddies: Map<string, number>;
  posted: Set<string>; played: Set<string>;
  sends: Map<string, Array<{ template: string; at: number }>>;
};

async function loadWorld(sb: any): Promise<World> {
  const now = new Date();
  const [{ data: profs }, { data: subs }, { data: bud }, { data: posts }, { data: games }, { data: sends, error: sendsErr }] = await Promise.all([
    sb.from("profiles").select("id,name,created_at,last_seen_at,installed_at,games_played,email_level,email_notifs,email_digest,home_city"),
    sb.from("push_subscriptions").select("user_id"),
    sb.from("buddies").select("user_low,user_high"),
    sb.from("sos_requests").select("caller_id"),
    sb.from("games").select("player_a,player_b"),
    sb.from("lifecycle_sends").select("user_id,template,sent_at").gt("sent_at", new Date(now.getTime() - 400 * DAY).toISOString()),
  ]);
  // Without the ledger every run would re-send yesterday's emails — refuse to plan.
  if (sendsErr) throw new Error(`lifecycle_sends unavailable (${sendsErr.message}) — paste the PACKAGE3 sql first`);
  const buddies = new Map<string, number>();
  for (const b of bud ?? []) { buddies.set(b.user_low, (buddies.get(b.user_low) ?? 0) + 1); buddies.set(b.user_high, (buddies.get(b.user_high) ?? 0) + 1); }
  const played = new Set<string>();
  for (const g of games ?? []) { if (g.player_a) played.add(g.player_a); if (g.player_b) played.add(g.player_b); }
  const sendMap = new Map<string, Array<{ template: string; at: number }>>();
  for (const s of sends ?? []) { const arr = sendMap.get(s.user_id) ?? []; arr.push({ template: s.template, at: new Date(s.sent_at).getTime() }); sendMap.set(s.user_id, arr); }
  return {
    now, monday: isMondayInStockholm(now),
    profiles: new Map((profs ?? []).map((p: Profile) => [p.id, p])),
    pushOn: new Set((subs ?? []).map((s: any) => s.user_id)),
    buddies,
    posted: new Set((posts ?? []).map((r: any) => r.caller_id).filter(Boolean)),
    played,
    sends: sendMap,
  };
}

/** The one email (or none) a player should get today. First match wins. */
function planFor(u: AuthUser, w: World): { template: string; reason: string } | null {
  const sent = w.sends.get(u.id) ?? [];
  const sentEver = (t: string) => sent.some((s) => s.template === t);
  const sentWithin = (t: string, days: number) => sent.some((s) => s.template === t && w.now.getTime() - s.at < days * DAY);
  const anyWithin = (hours: number) => sent.some((s) => w.now.getTime() - s.at < hours * 3600e3);
  if (anyWithin(20)) return null; // one lifecycle email per day, full stop
  const p = w.profiles.get(u.id) ?? null;
  const days = (w.now.getTime() - new Date(u.created_at).getTime()) / DAY;

  if (!p) {
    if (days >= 1 && days <= 30 && !sentEver("unfinished")) return { template: "unfinished", reason: `signed up ${days.toFixed(0)}d ago, no profile` };
    return null;
  }
  const level = p.email_level ?? (p.email_notifs === false ? "off" : "important");
  if (level === "off") return null;

  const lastActive = Math.max(
    p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0,
    u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0,
    new Date(p.created_at).getTime(),
  );
  const quietDays = (w.now.getTime() - lastActive) / DAY;
  const activeEver = (p.games_played ?? 0) > 0 || w.posted.has(u.id) || w.played.has(u.id);
  const installed = !!p.installed_at;
  const pdays = (w.now.getTime() - new Date(p.created_at).getTime()) / DAY;

  if (w.monday && p.email_digest !== false && quietDays <= 60 && !sentWithin("digest", 6)) return { template: "digest", reason: "Monday digest" };
  if (pdays >= 1 && pdays <= 4 && !activeEver && !sentEver("welcome_1")) return { template: "welcome_1", reason: `day ${pdays.toFixed(0)}, no game yet` };
  if (installed && (w.now.getTime() - new Date(p.installed_at!).getTime()) >= 2 * DAY && !w.pushOn.has(u.id) && pdays <= 90 && !sentEver("push_off")) return { template: "push_off", reason: "installed, push off" };
  if (!installed && pdays >= 3 && pdays <= 45 && !sentEver("install_3")) return { template: "install_3", reason: `day ${pdays.toFixed(0)}, not installed` };
  if (pdays >= 7 && pdays <= 60 && !sentEver("community_7")) return { template: "community_7", reason: `day ${pdays.toFixed(0)}` };
  if (pdays >= 14 && pdays <= 90 && (w.buddies.get(u.id) ?? 0) < 2 && !sentEver("invite_14")) return { template: "invite_14", reason: `day ${pdays.toFixed(0)}, ${w.buddies.get(u.id) ?? 0} buddies` };
  if (quietDays >= 14 && quietDays < 30 && activeEver && !sentWithin("fading", 60)) return { template: "fading", reason: `quiet ${quietDays.toFixed(0)}d` };
  if (quietDays >= 45 && !sentEver("sleeping")) return { template: "sleeping", reason: `quiet ${quietDays.toFixed(0)}d` };
  return null;
}

async function inviteLinkFor(sb: any, uid: string, firstName: string): Promise<string | undefined> {
  const { data } = await sb.from("invite_codes").select("code,active").eq("owner_id", uid).limit(1).maybeSingle();
  if (!data?.code || data.active === false) return undefined;
  const q = new URLSearchParams({ code: data.code });
  if (firstName) q.set("by", firstName);
  return `${APP}/board?${q.toString()}`;
}

async function buildCtx(sb: any, u: AuthUser, p: Profile | null, template: string, og: { games: GameLine[]; count: number }, token: string): Promise<Ctx> {
  const firstName = String(p?.name ?? "").trim().split(" ")[0];
  const ctx: Ctx = {
    firstName, app: APP,
    unsubUrl: `${APP}/unsubscribe?token=${token}`, settingsUrl: `${APP}/settings`,
    openCount: og.count, games: og.games, installed: !!p?.installed_at, city: p?.home_city ?? undefined,
  };
  if (template === "invite_14") ctx.inviteLink = await inviteLinkFor(sb, u.id, firstName);
  return ctx;
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));

    // ── who is calling ────────────────────────────────────────────────────
    let secret = "";
    try { const { data } = await sb.from("internal_config").select("value").eq("key", "notify_secret").maybeSingle(); secret = data?.value ?? ""; } catch { /* no table yet */ }
    const bySecret = !!secret && req.headers.get("x-notify-secret") === secret;
    let admin: { id: string; email: string } | null = null;
    if (!bySecret) {
      const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: caller } = await sb.auth.getUser(jwt);
      const uid = caller?.user?.id;
      if (!uid) return json({ ok: false, error: "not_authenticated" }, 401);
      const { data: me } = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
      if (!me?.is_admin) return json({ ok: false, error: "not_admin" }, 403);
      admin = { id: uid, email: caller!.user!.email! };
    }

    const { data: cfg } = await sb.from("app_config").select("value").eq("key", "lifecycle_enabled").maybeSingle();
    const enabled = cfg?.value === "true";

    // ── admin preview: one template to my own inbox ───────────────────────
    if (admin && typeof body.preview === "string") {
      const template = body.preview;
      if (!(TEMPLATES as readonly string[]).includes(template)) return json({ ok: false, error: "unknown_template" }, 400);
      const { data: p } = await sb.from("profiles").select("id,name,created_at,last_seen_at,installed_at,games_played,email_level,email_notifs,email_digest,home_city").eq("id", admin.id).maybeSingle();
      const og = await openGames(sb);
      const ctx = await buildCtx(sb, { id: admin.id, email: admin.email, created_at: p?.created_at ?? new Date().toISOString(), last_sign_in_at: null }, p ?? null, template, og, await unsubToken(sb, admin.email));
      if (template === "invite_14" && !ctx.inviteLink) ctx.inviteLink = `${APP}/board?code=YOURCODE&by=${encodeURIComponent(ctx.firstName || "Oxy")}`;
      const r = render(template, ctx)!;
      const s = await sendOne(admin.email, `[preview] ${r.subject}`, r.html);
      return json({ ok: s.ok, sent: s.ok ? 1 : 0, detail: s.detail || undefined, enabled });
    }

    // ── event send (DB trigger): one template, one user ───────────────────
    if (typeof body.template === "string" && typeof body.user_id === "string" && (bySecret || admin)) {
      if (!enabled) return json({ ok: true, skipped: "lifecycle_disabled" });
      const template = body.template;
      if (!(TEMPLATES as readonly string[]).includes(template)) return json({ ok: false, error: "unknown_template" }, 400);
      const { data: already, error: ledgerErr } = await sb.from("lifecycle_sends").select("id").eq("user_id", body.user_id).eq("template", template).limit(1);
      if (ledgerErr) return json({ ok: false, error: "lifecycle_sends unavailable — paste the PACKAGE3 sql first" });
      if (already?.length) return json({ ok: true, skipped: "already_sent" });
      const { data: au } = await sb.auth.admin.getUserById(body.user_id);
      const email = au?.user?.email;
      if (!email) return json({ ok: true, skipped: "no_email" });
      const { data: p } = await sb.from("profiles").select("id,name,created_at,last_seen_at,installed_at,games_played,email_level,email_notifs,email_digest,home_city").eq("id", body.user_id).maybeSingle();
      const level = p?.email_level ?? (p?.email_notifs === false ? "off" : "important");
      if (level === "off") return json({ ok: true, skipped: "email_off" });
      if ((await dropSuppressed(sb, [email])).has(email)) return json({ ok: true, skipped: "suppressed" });
      const og = await openGames(sb);
      const ctx = await buildCtx(sb, { id: body.user_id, email, created_at: au!.user!.created_at, last_sign_in_at: null }, p ?? null, template, og, await unsubToken(sb, email));
      const r = render(template, ctx)!;
      const s = await sendOne(email, r.subject, r.html);
      if (s.ok) await sb.from("lifecycle_sends").insert({ user_id: body.user_id, template });
      return json({ ok: s.ok, sent: s.ok ? 1 : 0, detail: s.detail || undefined });
    }

    // ── daily run / dry run ───────────────────────────────────────────────
    const dry = !!body.dry || !enabled;
    const [users, world] = await Promise.all([listAuthUsers(sb), loadWorld(sb)]);
    const plans: Plan[] = [];
    for (const u of users) {
      const pl = planFor(u, world);
      if (pl) plans.push({ user: u, profile: world.profiles.get(u.id) ?? null, ...pl });
    }
    const counts: Record<string, number> = {};
    for (const pl of plans) counts[pl.template] = (counts[pl.template] ?? 0) + 1;
    if (dry) {
      return json({
        ok: true, dry: true, enabled, users: users.length, planned: counts,
        sample: plans.slice(0, 40).map((pl) => ({ name: pl.profile?.name ?? pl.user.email.split("@")[0], template: pl.template, reason: pl.reason })),
      });
    }

    const suppressed = await dropSuppressed(sb, plans.map((pl) => pl.user.email));
    const og = await openGames(sb);
    let sent = 0; const failures: string[] = []; const sentCounts: Record<string, number> = {};
    for (const pl of plans.slice(0, DAILY_CAP)) {
      if (suppressed.has(pl.user.email)) continue;
      if (pl.template === "digest" && og.count === 0) continue; // never a digest of nothing
      const ctx = await buildCtx(sb, pl.user, pl.profile, pl.template, og, await unsubToken(sb, pl.user.email));
      const r = render(pl.template, ctx);
      if (!r) continue;
      const s = await sendOne(pl.user.email, r.subject, r.html);
      if (s.ok) {
        sent++; sentCounts[pl.template] = (sentCounts[pl.template] ?? 0) + 1;
        await sb.from("lifecycle_sends").insert({ user_id: pl.user.id, template: pl.template });
      } else if (failures.length < 10) failures.push(`${pl.template}: ${s.detail}`);
    }
    return json({ ok: failures.length === 0, enabled, users: users.length, planned: counts, sent, sentCounts, failures });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 200);
  }
});
