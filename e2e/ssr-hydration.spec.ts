// SERVER-RENDERED share pages must hydrate cleanly: they are the first screen a
// newcomer sees from a WhatsApp link. React #418 (server text ≠ browser text)
// reached production on 2026-10-16 — the UTC server printed 16:00 where the
// Stockholm browser printed 18:00. Opened directly (real SSR), in Stockholm time.
import { test, expect } from "@playwright/test";
import { mockSupabase, collectErrors } from "./helpers";

const HYDRATION = /#418|#423|#425|hydrat/i;

// every server-rendered route a newcomer can open from a link, plus the
// share pages with real data (the server mock feeds their loaders)
const SSR_PATHS = [
  "/e/e-1", "/e/e-1?code=OKSANA-007", "/g/g-open", "/g/g-window", "/e/missing", "/g/missing",
  "/", "/auth", "/auth?mode=signup&code=OKSANA-007", "/post", "/check-email?email=a%40b.se",
  "/privacy", "/terms", "/board", "/board?code=OKSANA-007&by=Oksana", "/players", "/leaders",
];
for (const path of SSR_PATHS) {
  test(`SSR ${path} hydrates without a mismatch`, async ({ page }) => {
    await mockSupabase(page, "guest");
    const errors = collectErrors(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    const all = [...errors.pageErrors, ...errors.consoleErrors];
    expect(all.filter((e) => HYDRATION.test(e)), `${path}: hydration error`).toEqual([]);
    expect(errors.pageErrors, `${path}: uncaught exception`).toEqual([]);
    // the share pages must really have rendered their data on the server —
    // a silent "gone" page hydrates cleanly and would hide the bug
    const must = /^\/e\/e-1/.test(path) ? "Sunday Americano" : /^\/g\/g-/.test(path) ? "UTK-hallen" : null;
    if (must) await expect(page.getByText(must).first()).toBeVisible();
  });
}

// Times are the court's local time for everyone, whatever zone the server or
// the reader is in (fixed dates in e2e/ssr-fetch-mock.mjs).
test("SSR /e and /g show Stockholm time, never the server's UTC", async ({ page }) => {
  await mockSupabase(page, "guest");
  await page.goto("/e/e-1");
  await expect(page.getByText("Sunday Americano")).toBeVisible();
  await expect(page.getByText("18:00", { exact: true })).toBeVisible();
  await expect(page.getByText("16:00", { exact: true })).toHaveCount(0);
  await page.goto("/g/g-open");
  await expect(page.getByText("17:30", { exact: true })).toBeVisible();
  await page.goto("/g/g-window");
  await expect(page.getByText("16–19", { exact: true })).toBeVisible();
});

test("a reader in another zone still sees the court's time", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "America/New_York", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await mockSupabase(page, "guest");
  const errors = collectErrors(page);
  await page.goto("http://127.0.0.1:4173/e/e-1");
  await expect(page.getByText("18:00", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect([...errors.pageErrors, ...errors.consoleErrors].filter((e) => HYDRATION.test(e))).toEqual([]);
  await ctx.close();
});
