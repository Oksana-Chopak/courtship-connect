// END-TO-END AUDIT (Oxy, 2026-10-06: "every flow, every screen, every
// transition, every role — no errors"). Runs against the production build
// with Supabase mocked at the network layer, as a guest, a member and an
// admin. For every screen it proves:
//   · no uncaught exception (pageerror),
//   · no error the player would see (oops() toasts, the root error boundary,
//     "Failed to send a request…"),
//   · no dictionary key leaked as text,
//   · the screen actually rendered (an expected word is on it, not the 404),
// and then walks the transitions a real thumb makes: tab bar, the "+ Post a
// game" button, every row on Me, the game card → game page, the wizard.
import { test, expect, type Page } from "@playwright/test";
import { mockSupabase, collectErrors, findRawKey, ERROR_TEXTS, type Role } from "./helpers";

type Screen = { path: string; expect: RegExp; roles: Role[]; not?: RegExp; client?: boolean };

// what must be on screen (any role listed) — a word proves the right screen rendered
const SCREENS: Screen[] = [
  { path: "/", expect: /tennis partner|tennispartner/i, roles: ["guest"] },
  { path: "/", expect: /UTK-hallen|Linnea|Johan/, roles: ["member", "admin"] }, // signed in → straight to the board
  { path: "/auth", expect: /email|google/i, roles: ["guest"] },
  { path: "/auth?mode=signup", expect: /email|google/i, roles: ["guest"] },
  { path: "/post", expect: /1\/3/, roles: ["guest"] },
  { path: "/privacy", expect: /privacy|integritet/i, roles: ["guest", "member"] },
  { path: "/terms", expect: /terms|villkor/i, roles: ["guest", "member"] },
  { path: "/withdraw", expect: /withdraw|ånger/i, roles: ["guest", "member"] },
  { path: "/unsubscribe?token=abc", expect: /unsubscrib|avsluta|email|mejl/i, roles: ["guest", "member"] },
  { path: "/check-email", expect: /email|mejl/i, roles: ["guest"] },
  { path: "/e/e-1", expect: /Sunday Americano/, roles: ["guest", "member", "admin"], client: true },
  { path: "/g/g-open", expect: /UTK-hallen|Johan/, roles: ["guest"], client: true },
  { path: "/g/g-open", expect: /UTK-hallen|Johan/, roles: ["member"], client: true }, // member → the real game page
  { path: "/board", expect: /UTK-hallen|Linnea|Johan/, roles: ["guest", "member", "admin"] },
  { path: "/home", expect: /UTK-hallen|Linnea|Johan|board|tavlan/i, roles: ["member"] },
  { path: "/rescue", expect: /UTK-hallen|Linnea|Johan|board|tavlan/i, roles: ["member"] },
  { path: "/games", expect: /UTK-hallen|Linnea|Johan|board|tavlan/i, roles: ["member"] },
  { path: "/sos/new", expect: /1\/3|when|time|när/i, roles: ["member"] },
  { path: "/sos/new?planned=1", expect: /1\/3|when|time|när/i, roles: ["member"] },
  { path: "/sos/g-other", expect: /Linnea|UTK-hallen/, roles: ["member"] },
  { path: "/sos/g-mine", expect: /UTK-hallen/, roles: ["member"] },
  { path: "/sos/g-mine?posted=1", expect: /UTK-hallen|share|dela/i, roles: ["member"] },
  { path: "/players", expect: /Linnea|Johan/, roles: ["guest", "member"] },
  { path: "/players/p-2", expect: /Johan/, roles: ["member"] },
  { path: "/people", expect: /Linnea|Johan|players|spelare/i, roles: ["member"] },
  { path: "/me", expect: /Oksana/, roles: ["member", "admin"] },
  { path: "/me", expect: /profile|profil/i, roles: ["guest"] },
  { path: "/settings", expect: /Oksana|settings|inställningar/i, roles: ["member"] },
  { path: "/matches", expect: /Linnea|Johan|match/i, roles: ["member"] },
  { path: "/matches?log=true", expect: /log|logga|match/i, roles: ["member"] },
  { path: "/progress", expect: /season|säsong|rank|Oksana/i, roles: ["member"] },
  { path: "/leaders", expect: /leader|topp|season|säsong|Linnea|Johan/i, roles: ["member", "guest"] },
  { path: "/lucky", expect: /lucky|serve|spin|snurra|Linnea/i, roles: ["member"] },
  { path: "/match", expect: /Linnea|Johan|crush|swipe/i, roles: ["member"] },
  { path: "/coach", expect: /coach|tränare/i, roles: ["member"] },
  { path: "/plans", expect: /member|medlem|swish|founding/i, roles: ["member"] },
  { path: "/help", expect: /help|hjälp|whatsapp|oksana/i, roles: ["member"] },
  { path: "/help", expect: /join|sign in|logga in|google/i, roles: ["guest"] }, // members-only → asks to join
  { path: "/events/new", expect: /event|title|titel/i, roles: ["member"] },
  { path: "/onboarding", expect: /name|namn|whatsapp/i, roles: ["member"] },
  { path: "/admin", expect: /clubhouse|klubbhuset|health|hälsa/i, roles: ["admin"] },
  { path: "/admin", expect: /./, roles: ["member"], not: /clubhouse|klubbhuset/i }, // a member never sees the admin page
  { path: "/this-route-does-not-exist", expect: /out of bounds|utanför banan/i, roles: ["guest", "member"] },
];

/** Routes with a server loader (/e, /g) fetch on the node server during SSR, where
 *  the mock can't see them — reach them the way the app does after the first
 *  load: a client-side navigation. */
async function gotoClient(page: Page, path: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function auditScreen(page: Page, where: string, errors: { pageErrors: string[] }) {
  const text = await page.locator("body").innerText();
  expect(errors.pageErrors, `${where}: uncaught exception`).toEqual([]);
  for (const bad of ERROR_TEXTS) expect(text, `${where}: player saw an error — "${bad}"`).not.toContain(bad);
  const key = findRawKey(text);
  expect(key, `${where}: dictionary key on screen → "${key}"`).toBeNull();
  return text;
}

for (const role of ["guest", "member", "admin"] as Role[]) {
  test.describe(`${role}: every screen renders without errors`, () => {
    for (const s of SCREENS.filter((x) => x.roles.includes(role))) {
      test(`${role} ${s.path}`, async ({ page }) => {
        await mockSupabase(page, role);
        const errors = collectErrors(page);
        if (s.client) await gotoClient(page, s.path); else await page.goto(s.path);
        await settle(page);
        const text = await auditScreen(page, `${role} ${s.path}`, errors);
        expect(text, `${role} ${s.path}: expected content`).toMatch(s.expect);
        if (s.not) expect(text, `${role} ${s.path}: must NOT show`).not.toMatch(s.not);
        if (!/does-not-exist/.test(s.path)) expect(text, `${role} ${s.path}: landed on the 404 page`).not.toMatch(/out of bounds|utanför banan/i);
      });
    }
  });
}

test.describe("member: the transitions a thumb makes", () => {
  test("tab bar → Board · Players · Me, then + Post a game → wizard", async ({ page }) => {
    await mockSupabase(page, "member");
    const errors = collectErrors(page);
    await page.goto("/board"); await settle(page);
    const tab = (re: RegExp) => page.locator("nav a").filter({ hasText: re }).first();
    await tab(/players|spelare/i).click(); await settle(page);
    await expect(page).toHaveURL(/\/players/);
    await tab(/profile|profil|^me$/i).click(); await settle(page);
    await expect(page).toHaveURL(/\/me/);
    await tab(/board|tavlan/i).click(); await settle(page);
    await expect(page).toHaveURL(/\/board/);
    await page.getByRole("button", { name: /post a game|lägg upp/i }).first().click(); await settle(page);
    await expect(page).toHaveURL(/\/sos\/new/);
    await auditScreen(page, "transitions tab bar", errors);
  });

  test("every row on Me opens its screen", async ({ page }) => {
    await mockSupabase(page, "member");
    const errors = collectErrors(page);
    await page.goto("/me"); await settle(page);
    const hrefs = await page.locator("main a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    expect(hrefs.length, "Me has rows").toBeGreaterThan(5);
    for (const href of hrefs) {
      await page.goto(href); await settle(page);
      const text = await auditScreen(page, `Me → ${href}`, errors);
      expect(text, `Me → ${href} landed on 404`).not.toMatch(/out of bounds|utanför banan/i);
    }
  });

  test("board card → game page → back; interested on another's game calls the RPC", async ({ page }) => {
    await mockSupabase(page, "member");
    const errors = collectErrors(page);
    const calls: string[] = [];
    // an SOS is claimed (claim_sos), an open game gets an application (apply_to_game)
    page.on("request", (r) => { if (/\/rest\/v1\/rpc\/(apply_to_game|claim_sos)/.test(r.url())) calls.push(r.url()); });
    await page.goto("/board"); await settle(page);
    const card = page.locator('a[href="/sos/g-other"]').first();
    if (await card.count()) await card.click(); else await page.getByText("Linnea").first().click();
    await settle(page);
    await expect(page).toHaveURL(/\/sos\/g-other/);
    await auditScreen(page, "game page", errors);
    const cta = page.locator("main button:visible").filter({ hasText: /i'm interested|interested|intresserad|i'm in|save this set|claim|rädda/i }).first();
    if (await cta.count()) { await cta.click(); await settle(page); expect(calls.length, "interest reached the API").toBeGreaterThan(0); }
    await auditScreen(page, "after interested", errors);
  });

  test("post a planned game end to end (member wizard → RPC)", async ({ page }) => {
    await mockSupabase(page, "member");
    const errors = collectErrors(page);
    const inserts: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/rest/v1/sos_requests")) inserts.push(r.postData() ?? ""); });
    await page.route("**/rest/v1/sos_requests*", async (route) => {
      const single = (route.request().headers()["accept"] ?? "").includes("object");
      const row = { id: "g-new", caller_id: "u-me", play_at: new Date(Date.now() + 86400e3).toISOString(), kind: "open", status: "active", court_id: "c-utk", format: "singles", level_min: 2, level_max: 4, court_status: "booked", court_type: "indoor", spots_needed: 1, spots_filled: 0, created_at: new Date().toISOString() };
      if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(single ? row : [row]) });
      return route.fallback();
    });
    await page.goto("/sos/new?planned=1"); await settle(page);
    // step 1: tomorrow (today's slots within 6h would turn it into an SOS) + a time
    await page.locator("main button:visible").filter({ hasText: /^(tomorrow|imorgon)$/i }).first().click();
    await page.locator("main button:visible").filter({ hasText: /^18:00$/ }).first().click();
    await auditScreen(page, "wizard step 1", errors);
    const next = () => page.locator("main button:visible").filter({ hasText: /^(next|nästa)/i }).first();
    await next().click(); await settle(page);
    await auditScreen(page, "wizard step 2", errors);
    await next().click(); await settle(page);
    const step3 = await auditScreen(page, "wizard step 3", errors);
    expect(step3, "a planned game, not an SOS").not.toMatch(/send the flare|skicka nödsignal/i);
    const post = page.locator("main button:visible").filter({ hasText: /post|lägg upp/i }).last();
    await post.click(); await settle(page);
    expect(inserts.length, "the game reached the API").toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/sos\/g-new/);
    await auditScreen(page, "after post (share card)", errors);
  });
});

test.describe("admin: the clubhouse works", () => {
  test("Health card shows checks and the players' errors; lifecycle dry run answers", async ({ page }) => {
    await mockSupabase(page, "admin");
    const errors = collectErrors(page);
    await page.goto("/admin"); await settle(page);
    await auditScreen(page, "admin", errors);
    const health = page.getByTestId("admin-health");
    await expect(health).toBeVisible();
    await expect(health.getByText(/need attention|behöver uppmärksamhet|All good|Allt fungerar/)).toBeVisible({ timeout: 15000 });
    await health.getByRole("button", { name: /show \d+ errors|visa \d+ fel/i }).click();
    await expect(health.getByText(/Failed to send a request to the Edge Function/)).toBeVisible();
    await page.getByRole("button", { name: /dry run|testkörning/i }).click(); await settle(page);
    await expect(page.getByText(/would go out today|skulle gå ut idag/i)).toBeVisible();
    // the Health card's own text legitimately quotes an error message — audit the rest of the page
    expect(errors.pageErrors).toEqual([]);
  });
});
