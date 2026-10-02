// @vitest-environment jsdom
// Fills courtship.ts to 100% line+branch coverage on top of courtship.test.ts
// (which owns the ladder/streak/slot basics). Every helper the UI leans on has
// its edge cases pinned here so a refactor can't silently change behavior.
import { describe, it, expect, afterEach } from "vitest";
import {
  LEVELS, VIBES, levelMeta, vibeEmoji, whatsappLink, whatsappLinkSos,
  monogramColors, initialOf, toE164, sportMeta, cityGranularity,
  generateSlots, snapToSlot, durationLabel, courtTypeMeta, courtStatusMeta,
  COURT_STATUSES, COURT_TYPES, DURATIONS, isUrgent, URGENCY_WINDOW_HOURS,
  spotsNeeded, whenLabel, hourRange, tierNameKey, RANK_LADDERS, waErrorKey,
  MATCHI_BY_LEVEL, GOALS, EXPERIENCES, SPORTS, CITIES,
  COURT_DAY_START, COURT_DAY_END, DEFAULT_GRANULARITY_MINUTES,
  defaultPostDate, SLOT_LEAD_MIN,
} from "./courtship";

afterEach(() => { localStorage.clear(); });

describe("levelMeta / vibeEmoji", () => {
  it("returns the exact level and falls back to L3 for unknown", () => {
    expect(levelMeta(1).name).toBe("Beginner");
    expect(levelMeta(5).color).toBe(LEVELS[4].color);
    expect(levelMeta(99)).toBe(LEVELS[2]);
    expect(levelMeta(0)).toBe(LEVELS[2]);
  });
  it("maps vibes and falls back to the ball", () => {
    for (const v of VIBES) expect(vibeEmoji(v.value)).toBe(v.emoji);
    expect(vibeEmoji("nope")).toBe("🎾");
  });
});

describe("WhatsApp links", () => {
  it("strips non-digits and URL-encodes the greeting", () => {
    const url = whatsappLink("+46 (70) 123-45.67", "Anna");
    expect(url.startsWith("https://wa.me/46701234567?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Hey Anna!"));
  });
  it("sos variant carries court and time", () => {
    const url = whatsappLinkSos("+4670", "Bo", "USIF", "18:00");
    expect(url).toContain("wa.me/4670");
    expect(decodeURIComponent(url)).toContain("USIF");
    expect(decodeURIComponent(url)).toContain("18:00");
  });
});

describe("monogram / initials", () => {
  it("is deterministic and always inside the palette", () => {
    const a1 = monogramColors("oksana");
    const a2 = monogramColors("oksana");
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(2);
    // long seeds force the 32-bit overflow (negative hash) branch
    const long = monogramColors("x".repeat(64));
    expect(long[0]).toMatch(/^#/);
    expect(monogramColors("")).toHaveLength(2);
  });
  it("initialOf uppercases, trims and survives empties", () => {
    expect(initialOf("anna")).toBe("A");
    expect(initialOf("  bo")).toBe("B");
    expect(initialOf("")).toBe("?");
    expect(initialOf(undefined as unknown as string)).toBe("?");
  });
});

describe("toE164", () => {
  it("covers every normalization branch", () => {
    expect(toE164("")).toBe("");
    expect(toE164("   ")).toBe("");
    expect(toE164("+46 70-123")).toBe("+4670123");
    expect(toE164("070 123 45 67")).toBe("+46701234567");
    expect(toE164("0070")).toBe("+4670");        // leading zeros all dropped
    expect(toE164("70123", "+380")).toBe("+38070123");
  });
});

describe("sportMeta / constants", () => {
  it("maps sports and defaults to tennis", () => {
    expect(sportMeta("padel").emoji).toBe("🏓");
    expect(sportMeta("badminton").key).toBe("sport.badminton");
    expect(sportMeta("tennis").key).toBe("sport.tennis");
    expect(sportMeta(null).key).toBe("sport.tennis");
    expect(sportMeta(undefined).emoji).toBe("🎾");
  });
  it("data constants stay coherent", () => {
    expect(SPORTS).toContain("tennis");
    expect(CITIES.length).toBeGreaterThan(0);
    expect(GOALS).toContain("partners");
    expect(EXPERIENCES).toContain("new");
    expect(Object.keys(MATCHI_BY_LEVEL)).toHaveLength(5);
    expect(DURATIONS).toEqual([60, 90, 120]);
    expect(COURT_TYPES).toEqual(["indoor", "outdoor"]);
  });
});

describe("slots", () => {
  it("respects city granularity and day bounds", () => {
    expect(cityGranularity("Uppsala")).toBe(60);
    expect(cityGranularity("Nowhere")).toBe(DEFAULT_GRANULARITY_MINUTES);
    const upps = generateSlots("Uppsala");
    expect(upps[0]).toBe(`${String(COURT_DAY_START).padStart(2, "0")}:00`);
    expect(upps[upps.length - 1]).toBe(`${COURT_DAY_END}:00`);
    expect(upps).toHaveLength(COURT_DAY_END - COURT_DAY_START + 1);
    const sthm = generateSlots("Stockholm");
    expect(sthm).toContain("07:30"); // 30-min city
    expect(sthm).not.toContain("22:30"); // nothing past closing
  });
  it("for today only offers slots ≥1h ahead, rounded up to the step", () => {
    const now = new Date(); now.setHours(12, 10, 0, 0);
    const slots = generateSlots("Uppsala", now, now);
    expect(slots[0]).toBe("14:00"); // 13:10 → ceil to next 60-min step
    const s30 = generateSlots("Stockholm", now, now);
    expect(s30[0]).toBe("13:30");
  });
  it("future date ignores the lead-time rule", () => {
    const now = new Date(); now.setHours(21, 0, 0, 0);
    const tomorrow = new Date(now.getTime() + 86400000);
    expect(generateSlots("Uppsala", tomorrow, now)[0]).toBe("07:00");
  });
});

describe("snapToSlot", () => {
  const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  it("rounds nearest / up and clamps to the playable day", () => {
    expect(snapToSlot(at(12, 29), "Uppsala").getHours()).toBe(12);
    expect(snapToSlot(at(12, 31), "Uppsala").getHours()).toBe(13);
    const up = snapToSlot(at(12, 1), "Uppsala", "up");
    expect(up.getHours()).toBe(13);
    expect(snapToSlot(at(3, 0), "Uppsala").getHours()).toBe(COURT_DAY_START);
    expect(snapToSlot(at(23, 45), "Uppsala").getHours()).toBe(COURT_DAY_END);
    // 30-min city keeps half-hours
    expect(snapToSlot(at(12, 40), "Stockholm").getMinutes()).toBe(30);
  });
});

describe("labels", () => {
  it("durationLabel covers presets and the generic fallback", () => {
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1.5h");
    expect(durationLabel(120)).toBe("2h");
    expect(durationLabel(180)).toBe("3h");
  });
  it("courtTypeMeta localizes and degrades bad values to outdoor", () => {
    expect(courtTypeMeta("indoor").label).toBe("Indoor");
    expect(courtTypeMeta("indoor", "sv").label).toBe("Inne");
    expect(courtTypeMeta("weird", "sv").label).toBe("Ute");
    expect(courtTypeMeta(null).label).toBe("Outdoor");
  });
  it("courtStatusMeta covers every status in both languages", () => {
    for (const s of COURT_STATUSES) {
      expect(courtStatusMeta(s.value, "en").label.length).toBeGreaterThan(0);
      expect(courtStatusMeta(s.value, "sv").label.length).toBeGreaterThan(0);
    }
    expect(courtStatusMeta("booked").tone).toBe("green");
    expect(courtStatusMeta("public").tone).toBe("neutral");
  });
});

describe("urgency & spots", () => {
  it("flips exactly at the window edge, accepts Date and string", () => {
    const inside = new Date(Date.now() + (URGENCY_WINDOW_HOURS - 0.1) * 3600e3);
    const outside = new Date(Date.now() + (URGENCY_WINDOW_HOURS + 0.1) * 3600e3);
    expect(isUrgent(inside)).toBe(true);
    expect(isUrgent(outside)).toBe(false);
    expect(isUrgent(inside.toISOString())).toBe(true);
  });
  it("spotsNeeded maps formats with singles fallback", () => {
    expect(spotsNeeded("singles")).toBe(1);
    expect(spotsNeeded("doubles_need1")).toBe(1);
    expect(spotsNeeded("doubles_need2")).toBe(2);
    expect(spotsNeeded("doubles_need3")).toBe(3);
    expect(spotsNeeded("whatever")).toBe(1);
  });
});

describe("whenLabel / hourRange", () => {
  it("says Today/Tomorrow in EN and SV (from stored lang) and formats far dates", () => {
    const today = new Date(); today.setHours(18, 30, 0, 0);
    expect(whenLabel(today.toISOString())).toMatch(/^Today /);
    const tmr = new Date(today.getTime() + 86400000);
    expect(whenLabel(tmr.toISOString())).toMatch(/^Tomorrow /);
    localStorage.setItem("courtship.lang", "sv");
    expect(whenLabel(today.toISOString())).toMatch(/^Idag /);
    expect(whenLabel(tmr.toISOString())).toMatch(/^Imorgon /);
    localStorage.setItem("courtship.lang", "en");
    const far = new Date(today.getTime() + 5 * 86400000);
    expect(whenLabel(far.toISOString())).toContain("·");
  });
  it("hourRange joins two times", () => {
    const a = new Date(); a.setHours(18, 0, 0, 0);
    const b = new Date(); b.setHours(20, 0, 0, 0);
    const r = hourRange(a, b);
    expect(r).toContain("18");
    expect(r).toContain("20");
  });
});

describe("rank plumbing", () => {
  it("tierNameKey builds dictionary keys", () => {
    expect(tierNameKey("activity", 3)).toBe("tier.activity.3");
    expect(tierNameKey("matchmaker", 5)).toBe("tier.matchmaker.5");
  });
  it("RANK_LADDERS are contiguous 1..N with ascending thresholds", () => {
    for (const [track, ladder] of Object.entries(RANK_LADDERS)) {
      ladder.forEach((tier, i) => {
        expect(tier.level).toBe(i + 1);
        if (i > 0) expect(tier.at).toBeGreaterThan(ladder[i - 1].at);
        expect(tier.emoji.length).toBeGreaterThan(0);
        expect(track.length).toBeGreaterThan(0);
      });
    }
  });
});

describe("waErrorKey", () => {
  it("maps the two known codes and everything else to failed", () => {
    expect(waErrorKey("no_number for user")).toBe("wa.no_number");
    expect(waErrorKey("Forbidden: not buddies")).toBe("wa.locked");
    expect(waErrorKey("boom")).toBe("wa.failed");
    expect(waErrorKey(undefined)).toBe("wa.failed");
  });
});

describe("time distance + timezone", () => {
  it("timeAgo covers s/m/h/d", async () => {
    const { timeAgo } = await import("./courtship");
    const now = Date.now();
    expect(timeAgo(new Date(now - 30e3).toISOString())).toMatch(/^\d+s ago$/);
    expect(timeAgo(new Date(now - 5.5 * 60e3).toISOString())).toBe("5m ago");
    expect(timeAgo(new Date(now - 3.5 * 3600e3).toISOString())).toBe("3h ago");
    expect(timeAgo(new Date(now - 2.5 * 86400e3).toISOString())).toBe("2d ago");
  });
  it("timeUntil covers now/m/h/d", async () => {
    const { timeUntil } = await import("./courtship");
    const now = Date.now();
    expect(timeUntil(new Date(now - 1000).toISOString())).toBe("now");
    expect(timeUntil(new Date(now + 100e3).toISOString())).toBe("in 1m");
    expect(timeUntil(new Date(now + 5.5 * 3600e3).toISOString())).toBe("in 5h");
    expect(timeUntil(new Date(now + 3.5 * 86400e3).toISOString())).toBe("in 3d");
  });
  it("cityTimeZone maps Miami and defaults to Stockholm", async () => {
    const { cityTimeZone } = await import("./courtship");
    expect(cityTimeZone("Miami")).toBe("America/New_York");
    expect(cityTimeZone("Uppsala")).toBe("Europe/Stockholm");
    expect(cityTimeZone(null)).toBe("Europe/Stockholm");
    expect(cityTimeZone("  Miami  ")).toBe("America/New_York");
  });
});

describe("straggler arms", () => {
  it("whenLabel: empty stored lang falls back to en", () => {
    localStorage.setItem("courtship.lang", "");
    const today = new Date(); today.setHours(9, 0, 0, 0);
    expect(whenLabel(today.toISOString())).toMatch(/^Today /);
  });
});

describe("defaultPostDate — the day the post wizard opens on", () => {
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 17, 250);

  it("is today at local midnight while today still has a bookable slot", () => {
    const d = defaultPostDate(at(2026, 10, 2, 14, 5));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 2]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it("the last 22:00 start is still offered at exactly 21:00 → today (boundary inclusive)", () => {
    const now = at(2026, 10, 2, COURT_DAY_END - SLOT_LEAD_MIN / 60, 0);
    expect(defaultPostDate(now).getDate()).toBe(2);
    // and the wheel agrees: one slot left for today
    expect(generateSlots("Uppsala", defaultPostDate(now), now)).toEqual(["22:00"]);
  });

  it("one minute later today has no slot → tomorrow at local midnight", () => {
    const now = at(2026, 10, 2, 21, 1);
    expect(generateSlots("Uppsala", now, now)).toEqual([]);
    const d = defaultPostDate(now);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 3]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it("23:30 on the last day of a month rolls into the next month", () => {
    const d = defaultPostDate(at(2026, 10, 31, 23, 30));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 1]);
  });

  it("defaults `now` to the clock", () => {
    const d = defaultPostDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    expect(d.getTime() - today.getTime()).toBeGreaterThanOrEqual(0);
    expect(d.getTime() - today.getTime()).toBeLessThanOrEqual(24 * 3600e3);
    expect(d.getHours()).toBe(0);
  });
});
