// E2E smoke of the MONEY PATH — the guest funnel that pays for everything:
// landing → board peek → post-a-game wizard → draft saved → signup handoff.
// Runs against the production build (vite preview) with the Supabase backend
// mocked at the network layer, so it's deterministic and needs no credentials.
import { test, expect, type Page } from "@playwright/test";

const SB = "**/*.supabase.co/**";

/** Network-level Supabase stub: auth = signed out, RPCs return canned rows. */
async function mockSupabase(page: Page) {
  await page.route(SB, async (route) => {
    const url = route.request().url();
    const body = (json: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });

    if (url.includes("/auth/v1/")) {
      // no session anywhere in the guest funnel
      if (url.includes("/user")) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "no session" }) });
      return body({});
    }
    if (url.includes("/rest/v1/rpc/public_board")) return body([]);
    if (url.includes("/rest/v1/rpc/public_players")) return body([]);
    if (url.includes("/rest/v1/rpc/community_stats")) return body([{ players: 12, games: 34 }]);
    if (url.includes("/rest/v1/courts")) {
      return body([
        { id: "c-usif", name: "USIF Tenniscenter", area: null, city: "Uppsala", is_custom: false, hidden: false, created_by: null },
        { id: "c-utk", name: "UTK-hallen", area: null, city: "Uppsala", is_custom: false, hidden: false, created_by: null },
      ]);
    }
    if (url.includes("/rest/v1/cities")) {
      return body([
        { name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 },
        { name: "Stockholm", timezone: "Europe/Stockholm", granularity_min: 30 },
      ]);
    }
    if (url.includes("/rest/v1/")) return body([]);
    if (url.includes("/functions/v1/")) return body({ ok: true });
    return body({});
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

test("landing: brand headline + one coral CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /look around|join/i })).toBeVisible();
  // brand headline: "It's a match. Literally."
  await expect(page.locator("h1")).toContainText(/match/i);
});

test("landing CTA → guest board peek with the join banner", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /look around|join/i }).click();
  await expect(page).toHaveURL(/\/board/);
  // guest banner with its join CTA
  await expect(page.getByText(/👀/)).toBeVisible();
});

test("guest + on the tab bar routes to the post-first wizard", async ({ page }) => {
  await page.goto("/board");
  // the FAB is the "What's happening? 🎾" button; for guests it goes straight to /post
  await page.getByRole("button", { name: /what.s happening/i }).click();
  await expect(page).toHaveURL(/\/post/);
});

test("guest wizard: 3 steps, draft lands in localStorage, handoff to signup", async ({ page }) => {
  await page.goto("/post");

  // Step 1 — pick a From time on the wheel (no time is preselected by design)
  await expect(page.getByText("1/3")).toBeVisible();
  await page.getByRole("listbox", { name: /from/i }).getByRole("option").last().click();
  await page.getByRole("button", { name: /next.*court/i }).click();

  // Step 2 — default court must already be picked (self-heal belt): the
  // combobox input shows the selected court's name from the mocked table
  await expect(page.getByText("2/3")).toBeVisible();
  await expect(page.getByPlaceholder(/search your court/i)).toHaveValue(/USIF|UTK/i);
  await page.getByRole("button", { name: /next.*players/i }).click();

  // Step 3 — the single coral CTA hands off into signup
  await expect(page.getByText("3/3")).toBeVisible();
  await page.getByRole("button", { name: /post my game/i }).click();

  await expect(page).toHaveURL(/\/auth/);
  await expect(page).toHaveURL(/mode=signup/);

  // the draft survived the handoff — this is the whole funnel's promise
  const draft = await page.evaluate(() => localStorage.getItem("courtship.draftGame"));
  expect(draft).toBeTruthy();
  const parsed = JSON.parse(draft!);
  expect(parsed.court_id).toBeTruthy();
  expect(parsed.play_at).toBeTruthy();
});

test("auth screen: invite code is OPTIONAL (no code field until asked)", async ({ page }) => {
  await page.goto("/auth?mode=signup");
  await expect(page.getByRole("textbox", { name: /email/i }).or(page.locator("#auth-email"))).toBeVisible();
  // no invite input rendered by default — open signup (2026-08-06)
  await expect(page.locator("#auth-invite")).toHaveCount(0);
});
