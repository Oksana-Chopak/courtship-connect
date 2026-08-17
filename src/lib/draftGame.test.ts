// @vitest-environment jsdom
// The reverse-registration draft: the guest's game must never vanish (audit
// P0-1) and the insert fallback chain must drop columns ACCUMULATIVELY (P1-10).
import { describe, it, expect, beforeEach, vi } from "vitest";

const insertMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));

import { rememberDraftGame, peekDraftGame, clearDraftGame, publishDraftGame, type DraftGame } from "./draftGame";

const KEY = "courtship.draftGame";
const future = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();
const draft = (over: Partial<DraftGame> = {}): DraftGame => ({
  court_id: "c1", city: "Uppsala", play_at: future(24), play_until: null,
  court_type_any: false, format: "singles", level_min: 2, level_max: 4,
  court_status: "booked", court_type: "outdoor", duration_min: 60, note: null,
  ...over,
});
/** One fake insert() outcome: chainable .select().single() resolving to r. */
const outcome = (r: { data?: unknown; error?: { message: string } | null }) => ({
  select: () => ({ single: () => Promise.resolve({ data: r.data ?? null, error: r.error ?? null }) }),
});

beforeEach(() => { localStorage.clear(); insertMock.mockReset(); });

describe("remember / peek / clear", () => {
  it("round-trips a draft and validates its shape", () => {
    rememberDraftGame(draft());
    expect(peekDraftGame()!.court_id).toBe("c1");
    clearDraftGame();
    expect(peekDraftGame()).toBeNull();
  });
  it("rejects garbage and wrong shapes", () => {
    expect(peekDraftGame()).toBeNull();
    localStorage.setItem(KEY, "{broken");
    expect(peekDraftGame()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ court_id: 42, play_at: "x" }));
    expect(peekDraftGame()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify(null));
    expect(peekDraftGame()).toBeNull();
  });
});

describe("publishDraftGame", () => {
  it("no draft → nothing to do", async () => {
    expect(await publishDraftGame("u1")).toEqual({ id: null, reason: null });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("stale start time → reason stale, draft KEPT for the wizard rescue", async () => {
    rememberDraftGame(draft({ play_at: new Date(Date.now() + 2 * 60e3).toISOString() }));
    expect(await publishDraftGame("u1")).toEqual({ id: null, reason: "stale" });
    expect(peekDraftGame()).not.toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("success publishes an open auto-flare game for the new user and clears the draft", async () => {
    rememberDraftGame(draft({ court_type_any: true, play_until: future(26), note: "bring balls" }));
    insertMock.mockReturnValueOnce(outcome({ data: { id: "g9" } }));
    expect(await publishDraftGame("u42")).toEqual({ id: "g9", reason: null });
    const row = insertMock.mock.calls[0][0];
    expect(row).toMatchObject({
      caller_id: "u42", kind: "open", status: "active", auto_flare: true,
      court_type_any: true, note: "bring balls", format: "singles",
    });
    expect(row.play_until).toBeTruthy();
    expect(peekDraftGame()).toBeNull();
  });

  it("drops columns ACCUMULATIVELY across the whole fallback chain", async () => {
    rememberDraftGame(draft({ court_type_any: true, play_until: future(26) }));
    insertMock
      .mockReturnValueOnce(outcome({ error: { message: 'column "court_type_any" does not exist' } }))
      .mockReturnValueOnce(outcome({ error: { message: 'column "play_until" does not exist' } }))
      .mockReturnValueOnce(outcome({ error: { message: 'column "duration_min" does not exist' } }))
      .mockReturnValueOnce(outcome({ data: { id: "g1" } }));
    expect(await publishDraftGame("u1")).toEqual({ id: "g1", reason: null });
    expect(insertMock).toHaveBeenCalledTimes(4);
    const last = insertMock.mock.calls[3][0];
    // the final attempt must be missing ALL previously dropped columns at once
    expect("court_type_any" in last).toBe(false);
    expect("play_until" in last).toBe(false);
    expect("duration_min" in last).toBe(false);
    expect(last.caller_id).toBe("u1");
  });

  it("total failure → reason failed, draft KEPT (never silently lost)", async () => {
    rememberDraftGame(draft());
    insertMock.mockReturnValue(outcome({ error: { message: "row-level security" } }));
    expect(await publishDraftGame("u1")).toEqual({ id: null, reason: "failed" });
    expect(peekDraftGame()).not.toBeNull();
    expect(insertMock).toHaveBeenCalledTimes(1); // unrelated error → no pointless retries
  });

  it("insert returning no id counts as failed", async () => {
    rememberDraftGame(draft());
    insertMock.mockReturnValueOnce(outcome({ data: {} }));
    expect(await publishDraftGame("u1")).toEqual({ id: null, reason: "failed" });
  });
});

describe("edge branches", () => {
  it("rememberDraftGame swallows storage explosions", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => rememberDraftGame(draft())).not.toThrow();
    spy.mockRestore();
  });
  it("peek rejects a draft whose play_at is not a string", () => {
    localStorage.setItem(KEY, JSON.stringify({ court_id: "c1", play_at: 123 }));
    expect(peekDraftGame()).toBeNull();
  });
  it("publishes a minimal draft (no window, no any-flag) with null/false defaults", async () => {
    rememberDraftGame(draft({ play_until: undefined, court_type_any: undefined, note: "x" }));
    insertMock.mockReturnValueOnce(outcome({ data: { id: "g2" } }));
    await publishDraftGame("u1");
    const row = insertMock.mock.calls[0][0];
    expect(row.play_until).toBeNull();
    expect(row.court_type_any).toBe(false);
  });
});

describe("fallback-chain guard arms", () => {
  it("clearDraftGame swallows storage explosions", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => clearDraftGame()).not.toThrow();
    spy.mockRestore();
  });
  it("an error with NO message never matches a column fallback", async () => {
    rememberDraftGame(draft());
    insertMock.mockReturnValueOnce(outcome({ error: {} as { message: string } }));
    expect(await publishDraftGame("u1")).toEqual({ id: null, reason: "failed" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
