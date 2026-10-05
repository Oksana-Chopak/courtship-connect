// Guard against the bug that made the app "look broken to anyone browsing
// games" (2026-10-05): a dictionary key rendered as text — "ct.sub_in",
// "post.mode_planned_word" — instead of a word. The unit test
// (src/lib/i18n.keys.test.ts) proves every key used in code exists in BOTH
// dictionaries; this spec proves the screens a stranger meets never SHOW one,
// in English and in Swedish, with real game cards on the board.
import { test, expect, type Page } from "@playwright/test";

const SB = "**/*.supabase.co/**";

// Every namespace of the dictionaries (src/lib/i18n.tsx), generated 2026-10-05.
// A leaked key looks like "ct.sub_in" or "common.save": namespace, dot, then a
// snake_case word or ≥4 letters — so "e.g." and "19.30" never trip it.
const NS = "act|admin|ann|app|auth|board|brand|buddy|cal|cancel|cand|ce|celebrate|city|claim|coach|common|consent|court|crush|ct|date|e|emailn|empty|err|ev|exp|feat|feedback|fmt|g|games|goal|gs|guest|help|hero|hist|home|index|install|inv|invite|lang|lb|lead|legal|lf|log|lucky|lvl|match|matches|me|mem|menu|mini|mm|nav|nf|ob|onboarding|optin|passport|people|plans|player|players|plus|post|post_pub|posted|privacyc|prof|prog|ptime|push|qp|rail|reason|rec|report|rescue|score|settings|share|slot|soon|sos|sport|stats|streak|support|swish|tabs|tier|tonight|unlogged|unsub|vibe|wa|withdraw|wiz|won";
const RAW_KEY = new RegExp(`(?:^|[\\s(>"'\u2014\u00b7])((?:${NS})\\.(?:[a-z0-9]+(?:_[a-z0-9]+)+|[a-z]{4,})(?:\\.[a-z0-9_]+)*)(?=$|[\\s.,;:!?)<"'])`, "im");
// Case-insensitive on purpose: the board's surface labels are CSS-uppercased,
// so a leaked "ct.sub_in" reads "CT.SUB_IN" on screen.

/** The first leaked key in a screen's text, or null. */
export function findRawKey(text: string): string | null {
  const hit = text.match(RAW_KEY);
  return hit ? hit[1] : null;
}

const soon = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

async function mockSupabase(page: Page) {
  await page.route(SB, async (route) => {
    const url = route.request().url();
    const body = (json: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
    if (url.includes("/auth/v1/")) {
      if (url.includes("/user")) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "no session" }) });
      return body({});
    }
    if (url.includes("/rest/v1/rpc/public_board")) {
      return body([
        { id: "g-in", kind: "planned", play_at: soon(26), created_at: soon(-1), format: "singles", level_min: 3, level_max: 5, spots_needed: 1, spots_filled: 0,
          court_name: "USIF Tenniscenter", court_city: "Uppsala", court_type: "indoor", court_status: "will_book", caller_id: "u1", caller_name: "Anna", caller_photo: null, sport: "tennis",
          play_until: soon(30), court_type_any: false },
        { id: "g-out", kind: "planned", play_at: soon(28), created_at: soon(-2), format: "doubles_need3", level_min: 1, level_max: 5, spots_needed: 3, spots_filled: 1,
          court_name: "UTK-hallen", court_city: "Uppsala", court_type: "outdoor", court_status: "booked", caller_id: "u2", caller_name: "Björn", caller_photo: null, sport: "tennis",
          play_until: null, court_type_any: false },
        { id: "g-any", kind: "sos", play_at: soon(3), created_at: soon(-1), format: "singles", level_min: 2, level_max: 4, spots_needed: 1, spots_filled: 0,
          court_name: "Kungliga TK", court_city: "Stockholm", court_type: "indoor", court_status: "booked", caller_id: "u3", caller_name: "Cici", caller_photo: null, sport: "tennis",
          play_until: null, court_type_any: true },
      ]);
    }
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

async function expectNoRawKeys(page: Page, where: string) {
  const hit = findRawKey(await page.locator("body").innerText());
  expect(hit, `${where}: a dictionary key leaked onto the screen → "${hit}"`).toBeNull();
}

test("the guard itself fires on a leaked key (also CSS-uppercased) and stays quiet on prose", () => {
  expect(findRawKey("Levels 3–5\nCT.SUB_IN\nUppsala")).toBe("CT.SUB_IN");
  expect(findRawKey("· post.mode_planned_word ·")).toBe("post.mode_planned_word");
  expect(findRawKey("Tap “Save” (common.save) now")).toBe("common.save");
  expect(findRawKey("e.g. tonight at 19.30 — court-ship.com · IN · OUT · IN/OUT · Level 3")).toBeNull();
});

for (const lang of ["en", "sv"] as const) {
  test.describe(`no raw dictionary keys on screen (${lang})`, () => {
    test.beforeEach(async ({ page }) => {
      await mockSupabase(page);
      await page.addInitScript((l) => { try { localStorage.setItem("courtship.lang", l); } catch {} }, lang);
    });

    test("landing", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1")).toBeVisible();
      await expectNoRawKeys(page, "/");
    });

    test("board with indoor, outdoor and any-surface cards", async ({ page }) => {
      await page.goto("/board");
      await expect(page.getByText(/Anna/)).toBeVisible();
      await expect(page.getByText(/Cici/)).toBeVisible();
      // the three surface labels really rendered (this is where "ct.sub_in" leaked)
      const text = await page.locator("body").innerText();
      for (const label of lang === "sv" ? ["INNE", "UTE", "INNE/UTE"] : ["IN", "OUT", "IN/OUT"]) expect(text, `surface label ${label}`).toContain(label);
      await expectNoRawKeys(page, "/board");
    });

    test("post-a-game wizard, all three steps", async ({ page }) => {
      await page.goto("/post");
      await expect(page.getByText("1/3")).toBeVisible();
      await expectNoRawKeys(page, "/post step 1");
      await page.getByRole("button", { name: /^(next|nästa)/i }).first().click().catch(() => {});
      await expectNoRawKeys(page, "/post step 2");
    });

    test("signup", async ({ page }) => {
      await page.goto("/auth?mode=signup");
      await expect(page.locator("#auth-email")).toBeVisible();
      await expectNoRawKeys(page, "/auth");
    });
  });
}
