// "Add to Google Calendar" links — pure URL building, no OAuth.
import { describe, it, expect } from "vitest";
import { googleCalendarUrl } from "./calendar";

describe("googleCalendarUrl", () => {
  const startISO = "2026-08-20T16:00:00.000Z";

  it("builds the template URL with UTC dates and a default 90-min end", () => {
    const url = googleCalendarUrl({ title: "🎾 Tennis", startISO });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("🎾 Tennis");
    expect(u.searchParams.get("dates")).toBe("20260820T160000Z/20260820T173000Z");
    expect(u.searchParams.get("details")).toBeNull();
    expect(u.searchParams.get("location")).toBeNull();
  });

  it("honours custom duration, details and location", () => {
    const url = googleCalendarUrl({
      title: "Match", startISO, durationMin: 120,
      details: "Bring balls & water", location: "USIF, Uppsala",
    });
    const u = new URL(url);
    expect(u.searchParams.get("dates")).toBe("20260820T160000Z/20260820T180000Z");
    expect(u.searchParams.get("details")).toBe("Bring balls & water");
    expect(u.searchParams.get("location")).toBe("USIF, Uppsala");
  });
});
