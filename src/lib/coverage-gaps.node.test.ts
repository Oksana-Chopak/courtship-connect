// Node-environment pass: the SSR arms (typeof window === "undefined") and a
// few branch stragglers that jsdom can never reach.
import { describe, it, expect, vi } from "vitest";

const { rpcMock, toastOk, toastErr } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  toastOk: [] as unknown[][],
  toastErr: [] as unknown[][],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => { toastOk.push(a); },
    error: (...a: unknown[]) => { toastErr.push(a); },
  },
}));

describe("SSR guards (no window at all)", () => {
  it("checkCelebration is a calm no-op on the server", async () => {
    const { checkCelebration } = await import("./celebrate");
    expect(checkCelebration(5, 1, 0, 0)).toBeNull();
  });
  it("invite/game links degrade to a bare origin server-side", async () => {
    const { myInviteLink, myGameShareLink, shareInvite } = await import("./share");
    rpcMock.mockResolvedValue({ data: "CODE1" });
    expect(await myInviteLink()).toContain("code=CODE1");
    rpcMock.mockResolvedValue({ data: null });
    expect(await myInviteLink()).toBe("");
    rpcMock.mockResolvedValue({ data: "C" });
    expect(await myGameShareLink("g1")).toBe("/g/g1?code=C");
    // shareInvite with an unparsable link ("" origin) exercises the URL catch
    rpcMock.mockResolvedValue({ data: null });
    await expect(shareInvite("m {link} {code}", "copied")).resolves.toBeUndefined();
  });
  it("server-side shareInvite composes the exact message even when the URL parse fails", async () => {
    const { shareInvite } = await import("./share");
    rpcMock.mockRejectedValue(new Error("net"));
    toastErr.length = 0;
    // No window on the server → origin "", new URL("") throws, the code seed
    // stays "" — the assembled message must be byte-exact with EMPTY link/code.
    // (Node has no clipboard/DOM either, so the never-fail chain ends in
    // toast.error carrying the text — which is exactly what we can pin.)
    await shareInvite("m {link} c={code}", "copied");
    expect(toastErr).toEqual([["m  c="]]);
  });
});

describe("node-side courtship stragglers", () => {
  it("whenLabel works without localStorage (server render)", async () => {
    const { whenLabel } = await import("./courtship");
    const today = new Date(); today.setHours(18, 0, 0, 0);
    expect(whenLabel(today.toISOString())).toMatch(/^Today /);
  });
  it("hourRange pads only non-zero minutes", async () => {
    const { hourRange } = await import("./courtship");
    const a = new Date(); a.setHours(9, 30, 0, 0);
    const b = new Date(); b.setHours(11, 0, 0, 0);
    expect(hourRange(a, b)).toBe("9:30–11");
  });
  it("weeklyStreak: a second gap week breaks the run (single freeze only)", async () => {
    const { weeklyStreak } = await import("./courtship");
    const now = new Date();
    const weeksAgo = (n: number) => new Date(now.getTime() - n * 7 * 86400e3).toISOString();
    // played this week and 3 weeks ago → one freeze bridges week -1, but the
    // second consecutive empty week (-2) stops the walk
    const r = weeklyStreak([weeksAgo(0), weeksAgo(3)]);
    expect(r.playedThisWeek).toBe(true);
    expect(r.weeks).toBe(1);
    // invalid dates are filtered, empty input is calm
    expect(weeklyStreak(["not-a-date", ""]).weeks).toBe(0);
  });
});

describe("streak start arm", () => {
  it("played only LAST week → streak counts from last week", async () => {
    const { weeklyStreak } = await import("./courtship");
    const lastWeek = new Date(Date.now() - 7 * 86400e3).toISOString();
    const r = weeklyStreak([lastWeek]);
    expect(r.playedThisWeek).toBe(false);
    expect(r.weeks).toBe(1);
  });
});
