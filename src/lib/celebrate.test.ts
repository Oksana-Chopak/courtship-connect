// @vitest-environment jsdom
// The celebration engine: baseline-diff logic, track priority, level-ups and
// the dictionary routing fields the overlay depends on (audit P1-14).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkCelebration } from "./celebrate";

const KEY = "courtship.progress";
const seed = (games: number, rescues: number, referrals?: number, hosted?: number) => {
  const p: Record<string, number> = { games, rescues };
  if (referrals !== undefined) p.referrals = referrals;
  if (hosted !== undefined) p.hosted = hosted;
  localStorage.setItem(KEY, JSON.stringify(p));
};

beforeEach(() => { localStorage.clear(); });

describe("checkCelebration", () => {
  it("first run only records the baseline — no retroactive confetti", () => {
    expect(checkCelebration(10, 3, 1, 2)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ games: 10, rescues: 3, referrals: 1, hosted: 2 });
  });

  it("nothing changed → null, baseline advanced", () => {
    seed(5, 1, 0, 0);
    expect(checkCelebration(5, 1, 0, 0)).toBeNull();
  });

  it("a game increase celebrates with the activity track", () => {
    seed(0, 0, 0, 0);
    const c = checkCelebration(1, 0, 0, 0)!;
    expect(c.kind).toBe("game");
    expect(c.count).toBe(1);
    expect(c.leveledUp).toBe(true);          // crossed into Rookie
    expect(c.track).toBe("activity");
    expect(c.tierLevel).toBe(1);
    expect(c.nextLevel).toBe(2);
    expect(c.toNext).toBeGreaterThan(0);
  });

  it("priority is games > rescues > recruits > hosted", () => {
    seed(1, 1, 1, 1);
    expect(checkCelebration(2, 2, 2, 2)!.kind).toBe("game");
    seed(2, 1, 1, 1);
    expect(checkCelebration(2, 2, 2, 2)!.kind).toBe("rescue");
    seed(2, 2, 1, 1);
    expect(checkCelebration(2, 2, 2, 2)!.kind).toBe("recruit");
    seed(2, 2, 2, 1);
    expect(checkCelebration(2, 2, 2, 2)!.kind).toBe("host");
  });

  it("no level-up when the increase stays inside a tier", () => {
    seed(1, 0, 0, 0);
    const c = checkCelebration(2, 0, 0, 0)!;   // Rookie(1) → still Rookie at 2
    expect(c.kind).toBe("game");
    expect(c.leveledUp).toBe(false);
  });

  it("maxed track has no next tier", () => {
    seed(399, 0, 0, 0);
    const c = checkCelebration(400, 0, 0, 0)!; // GOAT, top of the ladder
    expect(c.leveledUp).toBe(true);
    expect(c.toNext).toBeNull();
    expect(c.nextLevel).toBeNull();
  });

  it("old baseline without referrals/hosted never false-fires those tracks", () => {
    seed(3, 1); // pre-Phase-1 baseline shape
    expect(checkCelebration(3, 1, 7, 5)).toBeNull();
  });

  it("corrupted or non-numeric baseline is treated as first run", () => {
    localStorage.setItem(KEY, "{not json");
    expect(checkCelebration(9, 9, 9, 9)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ games: "x" }));
    expect(checkCelebration(10, 9, 9, 9)).toBeNull();
  });

  it("null-ish live counters are treated as zeros", () => {
    seed(0, 0, 0, 0);
    expect(
      checkCelebration(
        undefined as unknown as number, null as unknown as number,
        undefined as unknown as number, undefined as unknown as number,
      ),
    ).toBeNull();
  });

  it("storage write failures never crash the board", () => {
    seed(0, 0, 0, 0);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => checkCelebration(1, 0, 0, 0)).not.toThrow();
    spy.mockRestore();
  });
});
