import { describe, it, expect } from "vitest";
import { ReportGate, describeError, isNoise } from "./health";

describe("ReportGate — never floods, never repeats within a minute", () => {
  it("lets distinct errors through up to 10 a minute, then holds", () => {
    let now = 1_000_000;
    const g = new ReportGate(() => now);
    for (let i = 0; i < 10; i++) expect(g.allow(`e${i}`)).toBe(true);
    expect(g.allow("e10")).toBe(false);
    now += 61_000;
    expect(g.allow("e10")).toBe(true);
  });
  it("dedupes the same key for 60s", () => {
    let now = 0;
    const g = new ReportGate(() => now);
    expect(g.allow("same")).toBe(true);
    now += 30_000;
    expect(g.allow("same")).toBe(false);
    now += 30_001;
    expect(g.allow("same")).toBe(true);
  });
});

describe("describeError — one readable line from anything thrown", () => {
  it("handles strings, Errors, supabase-style objects, junk", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError(new Error("nope"))).toBe("nope");
    expect(describeError(new TypeError(""))).toBe("TypeError");
    expect(describeError({ message: "rpc failed" })).toBe("rpc failed");
    expect(describeError({ error_description: "bad token" })).toBe("bad token");
    expect(describeError({ error: "x" })).toBe("x");
    expect(describeError({ code: 42 })).toBe('{"code":42}');
    expect(describeError(null)).toBe("unknown error");
    expect(describeError(undefined)).toBe("unknown error");
  });
});

describe("isNoise — browser/extension chatter is not a product error", () => {
  it("drops known noise, keeps real errors", () => {
    expect(isNoise("ResizeObserver loop completed with undelivered notifications")).toBe(true);
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("The operation was aborted")).toBe(true);
    expect(isNoise("chrome-extension://abc failed")).toBe(true);
    expect(isNoise("Failed to send a request to the Edge Function")).toBe(false);
    expect(isNoise("Cannot read properties of undefined (reading 'id')")).toBe(false);
  });
});
