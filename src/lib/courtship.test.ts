import { describe, it, expect } from "vitest";
import {
  durationLabel,
  isUrgent,
  whenLabel,
  activityTier,
  rescuerTier,
  recruiterTier,
  matchmakerTier,
  weeklyStreak,
} from "./courtship";

// These tests lock down the regression-prone pure logic (reward ladders, the
// weekly streak, date formatting, the urgency threshold). They assert
// INVARIANTS rather than exact thresholds, so intentional tuning of the
// ladders won't break them — but a logic bug will.

describe("durationLabel", () => {
  it("maps the known durations", () => {
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1.5h");
    expect(durationLabel(120)).toBe("2h");
  });
  it("falls back to rounded hours", () => {
    expect(durationLabel(180)).toBe("3h");
  });
});

describe("isUrgent", () => {
  const H = 60 * 60 * 1000;
  it("is true within the 6h window", () => {
    expect(isUrgent(new Date(Date.now() + 1 * H))).toBe(true);
    expect(isUrgent(new Date(Date.now() + 5 * H))).toBe(true);
  });
  it("is false beyond 6h", () => {
    expect(isUrgent(new Date(Date.now() + 10 * H))).toBe(false);
  });
});

describe("whenLabel", () => {
  it("labels today with the time and no date", () => {
    const today = new Date();
    today.setHours(19, 0, 0, 0);
    const label = whenLabel(today.toISOString());
    expect(label).toMatch(/Today/);
    expect(label).toMatch(/19[:.]00/);
  });
  it("labels other days compactly (weekday + date + time, no 'at')", () => {
    const d = new Date();
    d.setDate(d.getDate() + 8);
    d.setHours(15, 0, 0, 0);
    const label = whenLabel(d.toISOString());
    expect(label).not.toMatch(/Today|Tomorrow/);
    expect(label).toContain("·");
    expect(label).toMatch(/15[:.]00/);
  });
});

describe("reward ladders", () => {
  const ladders = { activityTier, rescuerTier, recruiterTier, matchmakerTier };
  for (const [name, fn] of Object.entries(ladders)) {
    it(`${name}: null below 1, first tier at 1`, () => {
      expect(fn(0)).toBeNull();
      const first = fn(1);
      expect(first).not.toBeNull();
      expect(first!.level).toBe(1);
    });

    it(`${name}: level never decreases and 'next' stays ahead`, () => {
      let lastLevel = 0;
      for (let count = 1; count <= 500; count++) {
        const t = fn(count)!;
        expect(t.level).toBeGreaterThanOrEqual(lastLevel);
        lastLevel = t.level;
        // you've reached your current tier's threshold...
        expect(count).toBeGreaterThanOrEqual(t.at);
        // ...and the next tier (if any) is still above your current count
        if (t.next !== null) expect(t.next).toBeGreaterThan(count);
        else expect(t.nextName).toBeNull();
      }
    });
  }
});

describe("weeklyStreak", () => {
  // Build an ISO timestamp inside the Monday-based week `weeksAgo` weeks back.
  function weekStart(weeksAgo: number): string {
    const x = new Date();
    x.setHours(12, 0, 0, 0);
    const dow = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - dow - weeksAgo * 7);
    return x.toISOString();
  }
  it("no games -> zero", () => {
    expect(weeklyStreak([])).toEqual({ weeks: 0, playedThisWeek: false });
  });
  it("a game this week -> streak 1, playedThisWeek true", () => {
    const r = weeklyStreak([weekStart(0)]);
    expect(r.playedThisWeek).toBe(true);
    expect(r.weeks).toBe(1);
  });
  it("counts consecutive weeks", () => {
    expect(weeklyStreak([weekStart(0), weekStart(1), weekStart(2)]).weeks).toBe(3);
  });
  it("forgives a single gap week (freeze)", () => {
    expect(weeklyStreak([weekStart(0), weekStart(2)]).weeks).toBe(2);
  });
  it("stops after two consecutive gaps", () => {
    expect(weeklyStreak([weekStart(0), weekStart(3)]).weeks).toBe(1);
  });
});
