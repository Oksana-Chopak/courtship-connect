// The court's clock (React #418 on /e and /g, 2026-10-16): the same instant must
// print the same text on the UTC server, in a Stockholm browser and anywhere
// else — and always in the court's own zone. Run under any TZ: results are fixed.
import { describe, it, expect } from "vitest";
import { courtClock, courtHourRange } from "./courtship";

const EVT = "2030-06-15T16:00:00Z"; // Sat 15 Jun, 18:00 in Stockholm (CEST)

describe("courtClock", () => {
  it("prints the court's local time and date, not the machine's", () => {
    const c = courtClock(EVT, "Uppsala", "en-GB", new Date("2030-06-01T08:00:00Z"));
    expect(c).toEqual({ rel: null, weekday: "Sat", dateStr: "15 Jun", time: "18:00" });
  });

  it("today/tomorrow follow the court's calendar, not UTC's", () => {
    // 00:30 on the 15th in Stockholm is still the 14th in UTC
    expect(courtClock(EVT, "Uppsala", "en-GB", new Date("2030-06-14T22:30:00Z")).rel).toBe("today");
    // 23:30 on the 14th in Stockholm
    expect(courtClock(EVT, "Uppsala", "en-GB", new Date("2030-06-14T21:30:00Z")).rel).toBe("tmrw");
    expect(courtClock(EVT, "Uppsala", "en-GB", new Date("2030-06-13T21:30:00Z")).rel).toBeNull();
  });

  it("tomorrow survives a 23-hour DST day (calendar arithmetic, not +24h)", () => {
    // Stockholm springs forward on 2030-03-31; 23:30 on the 30th → the event at
    // 23:30 on the 31st is tomorrow (a naive +24h would land on 1 April)
    expect(courtClock("2030-03-31T21:30:00Z", "Uppsala", "en-GB", new Date("2030-03-30T22:30:00Z")).rel).toBe("tmrw");
  });

  it("uses the city's own zone (Miami) and defaults to Stockholm", () => {
    expect(courtClock(EVT, "Miami", "en-GB", new Date("2030-06-01T00:00:00Z")).time).toBe("12:00");
    expect(courtClock(EVT, null, "en-GB", new Date("2030-06-01T00:00:00Z")).time).toBe("18:00");
  });

  it("Swedish labels, without the abbreviation dot", () => {
    const c = courtClock("2030-10-17T16:00:00Z", "Stockholm", "sv-SE", new Date("2030-10-01T00:00:00Z"));
    expect(c.time).toBe("18:00");
    expect(c.dateStr).toBe("17 okt");
    expect(c.weekday).toMatch(/^tors/);
  });

  it("defaults `now` to the present", () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(courtClock(soon, "Uppsala", "en-GB").rel).not.toBe(undefined);
  });
});

describe("courtHourRange", () => {
  it("whole hours drop the minutes, others keep them — on the court's clock", () => {
    expect(courtHourRange("2030-06-17T14:00:00Z", "2030-06-17T17:00:00Z", "Uppsala")).toBe("16–19");
    expect(courtHourRange("2030-06-17T07:30:00Z", "2030-06-17T09:00:00Z", "Stockholm")).toBe("9:30–11");
    expect(courtHourRange("2030-06-17T14:00:00Z", "2030-06-17T17:15:00Z", "Miami")).toBe("10–13:15");
  });
});
