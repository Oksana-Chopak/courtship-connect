// Shared e2e plumbing: the raw-key guard, fixtures and a role-aware Supabase
// mock (network layer) so every screen renders deterministically for a guest,
// a member and an admin without credentials.
import type { Page } from "@playwright/test";

// Every namespace of the dictionaries (src/lib/i18n.tsx), generated 2026-10-05.
// A leaked key looks like "ct.sub_in" or "common.save": namespace, dot, then a
// snake_case word or ≥4 letters — so "e.g." and "19.30" never trip it.
const NS = "act|admin|ann|app|auth|board|brand|buddy|cal|cancel|cand|ce|celebrate|city|claim|coach|common|consent|court|crush|ct|date|e|emailn|empty|err|ev|exp|feat|feedback|fmt|g|games|goal|gs|guest|health|help|hero|hist|home|index|install|inv|invite|lang|lb|lead|legal|lf|log|lucky|lvl|match|matches|me|mem|menu|mini|mm|nav|nf|ob|onboarding|optin|passport|people|plans|player|players|plus|post|post_pub|posted|privacyc|prof|prog|ptime|push|qp|rail|reason|rec|report|rescue|score|settings|share|slot|soon|sos|sport|stats|streak|support|swish|tabs|tier|tonight|unlogged|unsub|vibe|wa|withdraw|wiz|won";
const RAW_KEY = new RegExp(`(?:^|[\\s(>"'—·])((?:${NS})\\.(?:[a-z0-9]+(?:_[a-z0-9]+)+|[a-z]{4,})(?:\\.[a-z0-9_]+)*)(?=$|[\\s.,;:!?)<"'])`, "im");

/** The first leaked dictionary key in a screen's text, or null. */
export function findRawKey(text: string): string | null {
  const hit = text.match(RAW_KEY);
  return hit ? hit[1] : null;
}

/** Texts that mean "a player just saw an error" (oops() titles EN+SV, the
 *  root error boundary) — an audit screen must never contain them. */
export const ERROR_TEXTS = [
  "That one didn't land", "Net cord", "straight into the net", "Double fault on our side",
  "Den gick inte igenom", "Nätsnärt", "rakt ut i nätet", "Dubbelfel på vår sida",
  "This page didn't load", "Sidan kunde inte laddas",
  "Failed to send a request to the Edge Function",
];

export type Role = "guest" | "member" | "admin";

export const SB = "**/*.supabase.co/**";
export const inH = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

export const ME_ID = "u-me";
export const ME_USER = { id: ME_ID, email: "oxy@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, aud: "authenticated", role: "authenticated", created_at: "2026-01-01T00:00:00Z" };
export const SESSION = { access_token: "fake-access", refresh_token: "fake-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: ME_USER };

export const profile = (admin: boolean) => ({
  id: ME_ID, name: "Oksana", last_name: "Chopak", level: 3, home_city: "Uppsala", home_cities: ["Uppsala"], photo_url: null,
  games_played: 7, rescues_count: 1, referrals_count: 2, sports: ["tennis"], is_admin: admin, vibe: "friendly", looking_for: "both",
  member_tier: null, accepted_terms_version: "v1.0", email_level: "important", email_digest: true, phone_e164: "+46701234567",
  formats: ["singles"], play_times: ["evenings"], home_courts: "UTK-hallen", buddy_optin: "yes", buddy_radius_km: 10, buddy_sos_optin: true,
  bio: "Forehand enthusiast", fav_shot: "forehand", ghost_badge: false, signup_code: null, created_at: "2026-06-01T00:00:00Z",
  lang: "en", events_optin: true, push_wake_me: false, push_max_per_week: 10, installed_at: null, last_seen_at: inH(-1),
});

export const PLAYERS = [
  { id: "p-1", name: "Linnea", last_name: "K", level: 3, home_city: "Uppsala", home_cities: ["Uppsala"], photo_url: null, games_played: 4, rescues_count: 1, vibe: "friendly", looking_for: "both", formats: ["singles"], play_times: ["evenings"], is_admin: false, bio: null, fav_shot: null, sports: ["tennis"], created_at: inH(-24 * 40), buddy_optin: "yes", home_courts: "UTK-hallen" },
  { id: "p-2", name: "Johan", last_name: "S", level: 4, home_city: "Uppsala", home_cities: ["Uppsala", "Stockholm"], photo_url: null, games_played: 12, rescues_count: 3, vibe: "competitive", looking_for: "regular", formats: ["singles", "doubles"], play_times: ["weekends"], is_admin: false, bio: "Serve & volley", fav_shot: "serve", sports: ["tennis"], created_at: inH(-24 * 90), buddy_optin: "yes", home_courts: "USIF" },
];

const baseSos = (id: string, caller: string, callerName: string, kind: "sos" | "open", hours: number) => ({
  id, caller_id: caller, play_at: inH(hours), court_id: "c-utk", format: "singles", level_min: 2, level_max: 4,
  court_status: "booked", note: "Bring balls", status: "active", claimed_by: null, created_at: inH(-2), kind,
  auto_flare: false, flared_at: kind === "sos" ? inH(-1) : null, court_type: "indoor", spots_needed: 1, spots_filled: 0,
  sport: "tennis", caller_name: callerName, caller_last_name: null, caller_photo_url: null, play_until: null, ghost_name: null,
  court_type_any: false, court_name: "UTK-hallen", court_city: "Uppsala", court_area: null, is_buddy: caller === "p-1", duration_min: 60, broadcast: true,
});
export const SOS_OTHER = baseSos("g-other", "p-1", "Linnea", "sos", 3);
export const OPEN_OTHER = baseSos("g-open", "p-2", "Johan", "open", 26);
export const OPEN_MINE = baseSos("g-mine", ME_ID, "Oksana", "open", 30);

export const EVENT = { id: "e-1", host_id: "p-2", title: "Sunday Americano", starts_at: inH(72), city: "Uppsala", location: "USIF Tenniscenter", format: "americano", description: "Open play, all levels.", contact: null, price_sek: 100, status: "approved", created_at: inH(-24), capacity: 16, swish_number: null, spots_taken: 4, level_min: 1, level_max: 5, duration_min: 120, sport: "tennis" };

export const GAMES = [
  { id: "m-1", player_a: ME_ID, player_b: "p-1", confirmed_a: true, confirmed_b: true, reported_noshow: null, played_at: inH(-24 * 3), sos_id: null, archived_by: [], created_at: inH(-24 * 3), score: "6-4 3-6 10-8", winner: ME_ID, court_id: "c-utk", guest_name: null },
  { id: "m-2", player_a: "p-2", player_b: ME_ID, confirmed_a: true, confirmed_b: false, reported_noshow: null, played_at: inH(-5), sos_id: "g-past", archived_by: [], created_at: inH(-30), score: null, winner: null, court_id: "c-usif", guest_name: null },
];

export const COURTS = [
  { id: "c-usif", name: "USIF Tenniscenter", area: null, city: "Uppsala", is_custom: false, hidden: false, created_by: null },
  { id: "c-utk", name: "UTK-hallen", area: null, city: "Uppsala", is_custom: false, hidden: false, created_by: null },
  { id: "c-kltk", name: "KLTK", area: "Östermalm", city: "Stockholm", is_custom: false, hidden: false, created_by: null },
];
export const CITIES = [
  { name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 },
  { name: "Stockholm", timezone: "Europe/Stockholm", granularity_min: 30 },
];

/** Network-level Supabase stub for a role. Unknown RPCs → [], unknown tables → [] / null. */
export async function mockSupabase(page: Page, role: Role) {
  const admin = role === "admin";
  const me = role === "guest" ? null : profile(admin);
  if (me) await page.addInitScript((s) => { localStorage.setItem("sb-ycsidxtrizgycfumkrnq-auth-token", JSON.stringify(s)); }, SESSION);
  await page.route(SB, async (route) => {
    const req = route.request();
    const url = req.url();
    const single = (req.headers()["accept"] ?? "").includes("object");
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const rpc = (name: string) => path.startsWith(`/rest/v1/rpc/${name}`);
    const table = (name: string) => path.startsWith(`/rest/v1/${name}`);
    // PostgREST-ish filters: ?col=eq.v, ?col=in.(a,b), ?col=is.null — enough for the app's reads
    const qs = new URL(url).searchParams;
    const filter = (rows: any[]) => rows.filter((r) => {
      for (const [k, v] of qs.entries()) {
        if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
        if (k === "or") continue; // or=(player_a.eq.x,player_b.eq.x) → handled by caller mocks where it matters
        if (v.startsWith("eq.")) { if (String(r[k]) !== v.slice(3)) return false; }
        else if (v.startsWith("in.(")) { if (!v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k]))) return false; }
        else if (v === "is.null") { if (r[k] != null) return false; }
        else if (v.startsWith("not.is.null")) { if (r[k] == null) return false; }
      }
      return true;
    });
    const list = (rows: any[]) => { const f = filter(rows); return json(single ? (f[0] ?? null) : f); };
    let body: any = {};
    try { body = req.postDataJSON() ?? {}; } catch { body = {}; }
    const byIds = (rows: any[]) => (Array.isArray(body?._ids) ? rows.filter((r) => body._ids.includes(r.id)) : rows);

    // auth
    if (path.startsWith("/auth/v1/user")) return me ? json(ME_USER) : route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "no session" }) });
    if (path.startsWith("/auth/v1/token")) return json(SESSION);
    if (path.startsWith("/auth/v1/logout")) return json({});
    if (path.startsWith("/auth/v1/")) return json({});
    // functions (never real)
    if (path.startsWith("/functions/v1/lifecycle-emails")) return json({ ok: true, dry: true, enabled: admin, users: 84, planned: { install_3: 6 }, sample: [{ name: "Johan", template: "install_3", reason: "day 9" }] });
    if (path.startsWith("/functions/v1/")) return json({ ok: true, sent: 1, total: 1, skipped: 0, failed: [] });
    // storage
    if (path.startsWith("/storage/")) return json([]);

    // ── RPCs ──
    if (rpc("get_my_full_profile")) return me ? json(single ? me : [me]) : json(single ? null : []);
    if (rpc("public_board")) return json([SOS_OTHER, OPEN_OTHER].map((r) => ({ ...r, caller_photo: null })));
    if (rpc("eligible_sos_for_me")) return json([SOS_OTHER]);
    if (rpc("eligible_open_games_for_me")) return json([OPEN_OTHER, OPEN_MINE]);
    if (rpc("public_game")) return json(single ? { ...OPEN_OTHER, host_name: "Johan" } : [{ ...OPEN_OTHER, host_name: "Johan" }]);
    if (rpc("players_directory")) return json(byIds(me ? [me, ...PLAYERS] : PLAYERS));
    if (rpc("public_players")) return json(PLAYERS);
    if (rpc("community_stats")) return json([{ players: 84, games: 210 }]);
    if (rpc("active_sos_count")) return json(0);
    if (rpc("count_matching_rescuers")) return json(7);
    if (rpc("ensure_my_invite_code")) return json("OKSANA-7F2");
    if (rpc("my_invite_uses")) return json([{ uses: 2 }]);
    if (rpc("get_support_swish")) return json("0700266274");
    if (rpc("get_member_config")) return json({ member_monthly: 49, member_yearly: 390, pro_monthly: 99 });
    if (rpc("my_membership_claims")) return json([]);
    if (rpc("my_open_coach_request")) return json(single ? null : []);
    if (rpc("founders_wall")) return json([{ id: "p-1", name: "Linnea", last_name: "K", photo_url: null, member_tier: "founding", member_since: inH(-24 * 30) }]);
    if (rpc("swipe_deck")) return json(PLAYERS);
    if (rpc("random_player_for_me")) return json(single ? PLAYERS[0] : PLAYERS);
    if (rpc("kudos_for") || rpc("kudos_by")) return json([]);
    if (rpc("check_invite_code")) return json(true);
    if (rpc("touch_presence") || rpc("accept_terms")) return json(null);
    if (rpc("claim_sos")) return json([{ ok: true, reason: "ok", game_id: "m-new" }]);
    if (rpc("apply_to_game") || rpc("join_event") || rpc("leave_event") || rpc("withdraw_application") || rpc("withdraw_claim") || rpc("cancel_game")) return json([{ ok: true, reason: "ok" }]);
    if (rpc("confirm_game") || rpc("report_noshow") || rpc("archive_game") || rpc("log_game")) return json(null);
    if (rpc("admin_dashboard")) return json({ fill_rate_pct: 62, profiles_total: 84, profiles_new_week: 3, rescuer_optin_pct: 70, buddy_pairs: 40, ghost_count: 1, by_city: { Uppsala: 60, Stockholm: 24 } });
    if (rpc("admin_players_list")) return json([{ ...profile(true), member_tier: null, installed_at: inH(-24), last_seen_at: inH(-1), push_on: true }, ...PLAYERS.map((p) => ({ ...p, phone_e164: "+46700000000", member_tier: null, member_since: null, installed_at: null, last_seen_at: inH(-24 * 3), push_on: false, email_level: "important", signup_code: null, ghost_badge: false, buddy_radius_km: 10, buddy_sos_optin: true }))]);
    if (rpc("admin_membership_claims")) return json([{ id: "c-1", user_id: "p-2", name: "Johan", last_name: "S", tier: "founding", period: "yearly", amount_sek: 690, status: "pending", created_at: inH(-2), resolved_at: null }]);
    if (rpc("admin_lifecycle_status")) return json([{ enabled: true, template: "welcome_0", sent_7d: 3, sent_30d: 9, last_sent: inH(-30) }]);
    if (rpc("admin_user_emails")) return json(PLAYERS.map((p) => ({ id: p.id, email: `${p.name.toLowerCase()}@example.com`, name: p.name, created_at: p.created_at, last_sign_in_at: null })));
    if (rpc("admin_invite_codes")) return json([{ code: "UPPSALA80", uses_remaining: 990, active: true, owner_id: null, owner_name: null, created_at: inH(-24 * 100) }]);
    if (rpc("admin_courts_list")) return json(COURTS);
    if (rpc("admin_list_coach_requests") || rpc("admin_list_withdrawals") || rpc("admin_list_reports")) return json([]);
    if (rpc("admin_health")) return json({ at: new Date().toISOString(), profiles: 84, push_subscriptions: 30, push_users: 25, pushes_24h: 12, emails_24h: { sent: 5, failed: 0 }, lifecycle_enabled: true, lifecycle_last_sent: inH(-3), open_games: 2, pending_events: 0, client_errors_24h: 1, cron: [{ name: "courtship-lifecycle-emails", schedule: "0 6 * * *", active: true }], net: { total: 40, failed: 0, by_status: { "200": 40 }, samples: [] } });
    if (rpc("admin_client_errors")) return json([{ kind: "shown", message: "Failed to send a request to the Edge Function", where_: "/admin", n: 3, users: 1, last_at: inH(-1), sample: "FunctionsFetchError" }]);
    if (rpc("report_client_error")) return json(null);
    if (path.startsWith("/rest/v1/rpc/")) return json(single ? null : []);

    // ── tables ──
    if (table("profiles")) return me ? json(single ? me : [me]) : json(single ? null : []);
    if (table("sos_requests")) return list([SOS_OTHER, OPEN_OTHER, OPEN_MINE]);
    if (table("sos_applications")) return json([]);
    if (table("event_requests")) return list([EVENT]);
    if (table("games")) return me ? list(GAMES) : json([]);
    if (table("event_attendees")) return json([]);
    if (table("courts")) return list(COURTS);
    if (table("cities")) return list(CITIES);
    if (table("city_areas")) return json([]);
    if (table("buddies")) return json(me ? [{ user_low: "p-1", user_high: ME_ID, created_at: inH(-24 * 10) }] : []);
    if (table("buddy_requests")) return json([]);
    if (table("announcements")) return json([]);
    if (table("avatars")) return json([]);
    if (path.startsWith("/rest/v1/")) return json(single ? null : []);
    return json({});
  });
}

/** Attach collectors for uncaught exceptions + console errors. */
export function collectErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  return { pageErrors, consoleErrors };
}
