// Events, from both sides (2026-10-16 report: "I can't see who joined my event,
// or whether they paid; the email doesn't say which weekly session").
import { test, expect, type Page } from "@playwright/test";
import { mockSupabase, EVENT, ME_ID, inH } from "./helpers";

const SB = "**/*.supabase.co/**";
const MINE = { ...EVENT, id: "e-mine", host_id: ME_ID, title: "Warm up first, tennis after", city: "Stockholm", location: "SALK-hallen", price_sek: 450, capacity: 10, spots_taken: 2, starts_at: inH(80) };
const ATTENDEES = [
  { id: "a-1", user_id: "p-1", status: "paid", name: "Linnea", phone_e164: "+46701111111" },
  { id: "a-2", user_id: "p-2", status: "booked", name: "Johan", phone_e164: "+46702222222" },
];

/** Member + one event of their own; records every join_event call. */
async function asHost(page: Page): Promise<string[]> {
  await mockSupabase(page, "member");
  const joins: string[] = [];
  await page.route(SB, async (route) => {
    const url = route.request().url();
    const json = (v: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
    if (url.includes("/rest/v1/rpc/join_event")) { joins.push(route.request().postData() ?? ""); return json([{ ok: true, reason: "ok", attendee_status: "booked" }]); }
    if (url.includes("/rest/v1/rpc/event_attendee_contacts")) return json(url.includes("e-mine") || (route.request().postData() ?? "").includes("e-mine") ? ATTENDEES : []);
    if (url.includes("/rest/v1/event_requests") && !url.includes("status=eq.pending")) {
      const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (single) return json(url.includes("e-mine") ? MINE : EVENT);
      if (url.includes("host_id=eq.u-me")) return json([MINE]);
      return json([EVENT, MINE]);
    }
    return route.fallback();
  });
  return joins;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

test("a member who OPENS an event link is shown the event, never booked", async ({ page }) => {
  const joins = await asHost(page);
  await page.goto("/");
  await settle(page);
  await page.evaluate(() => { history.pushState({}, "", "/e/e-1"); dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page).toHaveURL(/\/board/);
  await expect(page.locator("#ev-e-1")).toBeVisible();
  await expect(page.locator("#ev-e-1")).toHaveAttribute("style", /box-shadow/);
  await settle(page);
  expect(joins, "opening a link must not join").toEqual([]);
});

test("the organizer sees who's coming, who paid and who still owes the Swish", async ({ page }) => {
  await asHost(page);
  await page.goto("/board");
  const card = page.locator("#ev-e-mine");
  await expect(card).toContainText(/Who's coming · 2/);
  await expect(card).toContainText(/1 paid, 1 to pay/);
  await expect(card).toContainText("Linnea");
  await expect(card).toContainText("Johan");
  await expect(card).toContainText(/Not paid yet/);
  await expect(card.getByRole("button", { name: /mark paid/i })).toBeVisible();
});

test("the organizer opening her own event's join link does not book herself", async ({ page }) => {
  const joins = await asHost(page);
  await page.goto("/board?join_event=e-mine");
  await expect(page.locator("#ev-e-mine")).toBeVisible();
  await settle(page);
  expect(joins).toEqual([]);
  await expect(page).not.toHaveURL(/join_event/);
});

test("the host's notification lands on that exact session", async ({ page }) => {
  await asHost(page);
  await page.goto("/board?focus_event=e-mine");
  await expect(page.locator("#ev-e-mine")).toHaveAttribute("style", /box-shadow/);
  await expect(page).not.toHaveURL(/focus_event/);
});

test("Players shows the way to a coach (quiet pill)", async ({ page }) => {
  await mockSupabase(page, "member");
  await page.goto("/players");
  await page.getByRole("link", { name: /find a coach/i }).click();
  await expect(page).toHaveURL(/\/coach/);
});

test("an event can start on the half or quarter hour (not only on the court grid)", async ({ page }) => {
  await mockSupabase(page, "member");
  await page.goto("/events/new");
  await page.getByRole("button", { name: /^time$/i }).click();
  await page.getByRole("listbox").getByRole("option", { name: "12:30" }).click();
  await expect(page.getByRole("button", { name: /^time$/i })).toContainText("12:30");
});

test("Me → My events: each session by date, who's coming, who still owes the Swish", async ({ page }) => {
  await asHost(page);
  await page.goto("/me");
  const box = page.getByText("My events").locator("..");
  await expect(box).toContainText("Warm up first, tennis after");
  await expect(box).toContainText(/Who's coming · 2 \/ 10/);
  await expect(box).toContainText("Linnea");
  await expect(box).toContainText(/Johan\s*Not paid yet/);
  await expect(box).not.toContainText("Sunday Americano"); // not her event
  await box.getByRole("link").first().click();
  await expect(page.locator("#ev-e-mine")).toHaveAttribute("style", /box-shadow/);
});
