// @vitest-environment jsdom
// Invite memory — the referral must survive a guest wandering away from the
// invite landing (/board?code=…&by=…) before signing up (Lovable scan 2026-10-16).
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { rememberInvite, rememberedInvite, forgetInvite } from "./share";

const KEY = "courtship.invite";
const DAY = 24 * 3600e3;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("rememberInvite / rememberedInvite / forgetInvite", () => {
  it("round-trips a code (normalised) and the inviter's first name", () => {
    rememberInvite("  anna-x7k ", " Anna ");
    expect(rememberedInvite()).toEqual({ code: "ANNA-X7K", by: "Anna" });
  });

  it("keeps the code when no name came with it", () => {
    rememberInvite("BOB-1");
    expect(rememberedInvite()).toEqual({ code: "BOB-1", by: "" });
    rememberInvite("BOB-2", null);
    expect(rememberedInvite()).toEqual({ code: "BOB-2", by: "" });
  });

  it("latest invite wins", () => {
    rememberInvite("FIRST-1", "A");
    rememberInvite("SECOND-2", "B");
    expect(rememberedInvite()?.code).toBe("SECOND-2");
  });

  it("caps absurd lengths", () => {
    rememberInvite("x".repeat(80), "y".repeat(80));
    const r = rememberedInvite()!;
    expect(r.code).toHaveLength(40);
    expect(r.by).toHaveLength(30);
  });

  it("ignores empty, blank, null and undefined codes (nothing stored)", () => {
    for (const bad of ["", "   ", null, undefined]) {
      rememberInvite(bad as string | null | undefined, "Anna");
      expect(localStorage.getItem(KEY)).toBeNull();
    }
  });

  it("returns null when nothing was remembered", () => {
    expect(rememberedInvite()).toBeNull();
  });

  it("expires after 30 days", () => {
    rememberInvite("OLD-1", "Old");
    const at = JSON.parse(localStorage.getItem(KEY)!).at as number;
    expect(rememberedInvite(at + 30 * DAY)).toEqual({ code: "OLD-1", by: "Old" });
    expect(rememberedInvite(at + 30 * DAY + 1)).toBeNull();
  });

  it("rejects malformed stored values", () => {
    const cases: unknown[] = [
      null,
      { by: "A", at: Date.now() },
      { code: 7, by: "A", at: Date.now() },
      { code: "", by: "A", at: Date.now() },
      { code: "C-1", by: "A" },
      { code: "C-1", by: "A", at: "yesterday" },
    ];
    for (const v of cases) {
      localStorage.setItem(KEY, JSON.stringify(v));
      expect(rememberedInvite()).toBeNull();
    }
    localStorage.setItem(KEY, "{not json");
    expect(rememberedInvite()).toBeNull();
  });

  it("treats a non-string stored name as no name", () => {
    localStorage.setItem(KEY, JSON.stringify({ code: "C-1", by: 42, at: Date.now() }));
    expect(rememberedInvite()).toEqual({ code: "C-1", by: "" });
  });

  it("forgets", () => {
    rememberInvite("GONE-1", "G");
    forgetInvite();
    expect(rememberedInvite()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => rememberInvite("X-1", "X")).not.toThrow();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(rememberedInvite()).toBeNull();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => forgetInvite()).not.toThrow();
  });
});
