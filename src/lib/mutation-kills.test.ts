// @vitest-environment jsdom
// Mutation-hardening layer 1: exact-value pins for BRAND DATA plus frozen-clock
// boundary tests, so Stryker's literal/operator mutants can't survive.
//
// The data tables live in top-level initializers, which only execute when the
// module is first imported. Each pin test therefore does the FIRST import of
// its module DYNAMICALLY, inside the test body — that attributes the
// initializer's coverage to the pin test itself, so Stryker re-runs exactly
// this test (in a fresh module registry) for every table mutant and the
// literal comparison kills it. Top-level static imports would instead mark
// those mutants "static" and unkillable. Do not "clean up" the imports.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Courtship = typeof import("./courtship");
const courtship = () => import("./courtship");

afterEach(() => { vi.useRealTimers(); });

describe("brand data tables are pinned exactly", () => {
  it("LEVELS / VIBES / PLAY_TIMES / FORMATS / CITIES / SPORTS / GOALS / EXPERIENCES / MATCHI (first import lands here)", async () => {
    const M: Courtship = await courtship();
    expect(M.LEVELS).toEqual([
      { n: 1, name: "Beginner", color: "#22c55e" },
      { n: 2, name: "Improver", color: "#84cc16" },
      { n: 3, name: "Intermediate", color: "#eab308" },
      { n: 4, name: "Advanced", color: "#f97316" },
      { n: 5, name: "Competition", color: "#ef4444" },
    ]);
    expect(M.VIBES).toEqual([
      { value: "chill", emoji: "😌", label: "Chill" },
      { value: "friendly", emoji: "🤝", label: "Friendly" },
      { value: "sweat", emoji: "🔥", label: "Sweat" },
    ]);
    expect(M.PLAY_TIMES).toEqual([
      "Weekday mornings", "Weekday lunch", "Weekday evenings",
      "Weekend mornings", "Weekend afternoons",
    ]);
    expect(M.FORMATS).toEqual(["singles", "doubles"]);
    expect(M.CITIES).toEqual(["Uppsala", "Stockholm", "Miami"]);
    expect(M.SPORTS).toEqual(["tennis", "padel", "badminton"]);
    expect(M.GOALS).toEqual(["partners", "fitness", "improve", "compete", "social", "events", "coach"]);
    expect(M.EXPERIENCES).toEqual(["new", "1_3", "3_10", "10_plus"]);
    expect(M.MATCHI_BY_LEVEL).toEqual({ 1: "1–2", 2: "3–4", 3: "5–6", 4: "7–8", 5: "9–10" });
    expect(M.SOS_FORMATS).toEqual([
      { value: "singles", label: "Singles" },
      { value: "doubles_need1", label: "Doubles — need 1" },
      { value: "doubles_need2", label: "Doubles — need 2" },
      { value: "doubles_need3", label: "Doubles — need 3" },
    ]);
    expect(M.COURT_TYPES).toEqual(["indoor", "outdoor"]);
    expect(M.DURATIONS).toEqual([60, 90, 120]);
    expect(M.COURT_DAY_START).toBe(7);
    expect(M.COURT_DAY_END).toBe(22);
    expect(M.URGENCY_WINDOW_HOURS).toBe(6);
    expect(M.LANG_FALLBACK).toBe("en");
    expect(M.DEFAULT_GRANULARITY_MINUTES).toBe(60);
    expect(M.BOOKING_GRANULARITY_MINUTES.Uppsala).toBe(60);
    expect(M.BOOKING_GRANULARITY_MINUTES.Stockholm).toBe(30);
    // monogram palette: exact deterministic pair per seed + full palette sweep
    expect(M.monogramColors("Anna")).toEqual(["#FF5747", "#FFF6E8"]);
    expect(M.monogramColors("Bo")).toEqual(["#C9EE3F", "#2B2118"]);
    expect(M.monogramColors("Cleo")).toEqual(["#2B2118", "#C9EE3F"]);
    const pairs = new Set<string>();
    for (let i = 0; i < 64; i++) pairs.add(JSON.stringify(M.monogramColors("seed" + i)));
    expect([...pairs].sort()).toEqual([
      ["#2B2118", "#C9EE3F"], ["#8C5A33", "#FFF6E8"], ["#C9EE3F", "#2B2118"], ["#FF5747", "#FFF6E8"],
    ].map((p) => JSON.stringify(p)).sort());
  });

  it("all four rank ladders, names and thresholds exactly", async () => {
    const M: Courtship = await courtship();
    expect(M.RANK_LADDERS.activity.map((t) => [t.name, t.at])).toEqual([
      ["Rookie", 1], ["Regular", 10], ["Local", 25], ["Veteran", 50],
      ["Courtmaster", 100], ["Champion", 200], ["GOAT", 400],
    ]);
    expect(M.RANK_LADDERS.rescuer.map((t) => [t.name, t.at])).toEqual([
      ["Set Saver", 1], ["Match Medic", 3], ["Court Hero", 10], ["Rescue Ace", 30], ["Living Legend", 100],
    ]);
    expect(M.RANK_LADDERS.recruiter.map((t) => [t.name, t.at])).toEqual([
      ["Wingman", 1], ["Connector", 3], ["Influencer", 7], ["Kingmaker", 12], ["Legend", 25],
    ]);
    expect(M.RANK_LADDERS.matchmaker.map((t) => [t.name, t.at])).toEqual([
      ["Host", 1], ["Organizer", 4], ["Ringleader", 10], ["Maestro", 20], ["Impresario", 40],
    ]);
    expect(M.RANK_LADDERS.activity.map((t) => t.emoji)).toEqual(["🎾", "🟢", "🔥", "⭐", "👑", "🏅", "🐐"]);
    expect(M.RANK_LADDERS.rescuer.map((t) => t.emoji)).toEqual(["🎾", "🚑", "🦸", "🎯", "🏆"]);
    expect(M.RANK_LADDERS.recruiter.map((t) => t.emoji)).toEqual(["🤝", "🔗", "📣", "👑", "🌟"]);
    expect(M.RANK_LADDERS.matchmaker.map((t) => t.emoji)).toEqual(["🎪", "📅", "📣", "🎩", "🌟"]);
  });

  it("COURT_STATUSES values and localized labels exactly (label + tone)", async () => {
    const M: Courtship = await courtship();
    expect(M.COURT_STATUSES.map((s) => s.value)).toEqual(["booked_paid", "booked", "will_book", "public"]);
    expect(M.courtStatusMeta("booked_paid", "en")).toEqual({ label: "💸 Court booked & paid", tone: "green" });
    expect(M.courtStatusMeta("booked", "en")).toEqual({ label: "✓ Court booked", tone: "green" });
    expect(M.courtStatusMeta("will_book", "en")).toEqual({ label: "🤝 We'll book together", tone: "neutral" });
    expect(M.courtStatusMeta("public", "en")).toEqual({ label: "🏞 Public court", tone: "neutral" });
    expect(M.courtStatusMeta("booked_paid", "sv")).toEqual({ label: "💸 Banan bokad & betald", tone: "green" });
    expect(M.courtStatusMeta("booked", "sv")).toEqual({ label: "✓ Banan bokad", tone: "green" });
    expect(M.courtStatusMeta("will_book", "sv")).toEqual({ label: "🤝 Vi bokar ihop", tone: "neutral" });
    expect(M.courtStatusMeta("public", "sv")).toEqual({ label: "🏞 Allmän bana", tone: "neutral" });
    // default lang is EN
    expect(M.courtStatusMeta("booked")).toEqual({ label: "✓ Court booked", tone: "green" });
  });

  it("WhatsApp greetings carry the exact brand copy", async () => {
    const M: Courtship = await courtship();
    expect(decodeURIComponent(M.whatsappLink("+46", "Anna").split("text=")[1]))
      .toBe("Hey Anna! Found you on Courtship 🎾 Up for a hit?");
    expect(decodeURIComponent(M.whatsappLinkSos("+46", "Bo", "USIF", "18:00").split("text=")[1]))
      .toBe("Hey Bo! You're a hero 🚑 See you at USIF at 18:00 — I'll bring balls 🎾");
  });

  it("FALLBACK_AREAS pinned exactly (first import of areas lands here)", async () => {
    const { FALLBACK_AREAS } = await import("./areas");
    expect(FALLBACK_AREAS).toEqual({
      Stockholm: [
        "Lidingö", "Täby", "Danderyd", "Sollentuna", "Upplands Väsby", "Vallentuna",
        "Solna/Sundbyberg", "Bromma", "Kungsholmen", "Vasastan/City", "Östermalm",
        "Södermalm", "Nacka", "Enskede/Kärrtorp", "Farsta", "Huddinge",
      ],
      Uppsala: [
        "Centrum", "Luthagen", "Fyrishov", "Gränby", "Kåbo/Studenternas",
        "Gottsunda", "Sävja", "Stenhagen",
      ],
    });
  });
});

describe("frozen-clock boundaries", () => {
  const FROZEN = new Date("2026-08-19T12:00:00.000Z");
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FROZEN); });

  it("isUrgent flips exactly AT the window (<= not <)", async () => {
    const M: Courtship = await courtship();
    const exact = new Date(FROZEN.getTime() + M.URGENCY_WINDOW_HOURS * 3600e3);
    expect(M.isUrgent(exact)).toBe(true);                        // kills <= → <
    expect(M.isUrgent(new Date(exact.getTime() + 1))).toBe(false); // kills <= → <=+ε drift
  });

  it("timeAgo bucket edges are exact", async () => {
    const M: Courtship = await courtship();
    const at = (sec: number) => new Date(FROZEN.getTime() - sec * 1000).toISOString();
    expect(M.timeAgo(at(59))).toBe("59s ago");
    expect(M.timeAgo(at(60))).toBe("1m ago");
    expect(M.timeAgo(at(3599))).toBe("59m ago");
    expect(M.timeAgo(at(3600))).toBe("1h ago");
    expect(M.timeAgo(at(86399))).toBe("23h ago");
    expect(M.timeAgo(at(86400))).toBe("1d ago");
  });
  it("timeUntil bucket edges are exact", async () => {
    const M: Courtship = await courtship();
    const at = (sec: number) => new Date(FROZEN.getTime() + sec * 1000).toISOString();
    expect(M.timeUntil(at(-1))).toBe("now");
    expect(M.timeUntil(at(0))).toBe("in 1m");       // Math.max(1, …) floor
    expect(M.timeUntil(at(3599))).toBe("in 59m");
    expect(M.timeUntil(at(3600))).toBe("in 1h");
    expect(M.timeUntil(at(86400))).toBe("in 1d");
  });

  it("today's slots: exact lead-time ceiling at a sharp hour", async () => {
    const M: Courtship = await courtship();
    const now = new Date(FROZEN); now.setHours(12, 0, 0, 0);
    // 12:00 + 60min lead = 13:00 → ceil lands exactly on 13:00, not 14:00
    expect(M.generateSlots("Uppsala", now, now)[0]).toBe("13:00");
  });
  it("snapToSlot: the .5 midpoint rounds up in nearest mode", async () => {
    const M: Courtship = await courtship();
    const d = new Date(FROZEN); d.setHours(12, 30, 0, 0);
    expect(M.snapToSlot(d, "Uppsala").getHours()).toBe(13);
  });
  it("weeklyStreak counts multi-week runs with the freeze exactly once", async () => {
    const M: Courtship = await courtship();
    const w = (n: number) => new Date(FROZEN.getTime() - n * 7 * 86400e3).toISOString();
    expect(M.weeklyStreak([w(0), w(1), w(2)]).weeks).toBe(3);
    expect(M.weeklyStreak([w(0), w(2)]).weeks).toBe(2);           // one gap forgiven
    expect(M.weeklyStreak([w(0), w(2), w(4)]).weeks).toBe(2);     // freeze used once, second gap stops
    // the freeze must NOT bridge a gap when nothing was counted yet:
    // played only 2 weeks ago → this week empty, last week empty → streak is 0
    expect(M.weeklyStreak([w(2)])).toEqual({ weeks: 0, playedThisWeek: false });
  });
  it("weeklyStreak buckets MIXED weekdays into Monday-anchored weeks", async () => {
    const M: Courtship = await courtship();
    // FROZEN is Wednesday 2026-08-19. Same-week Monday + Sunday must land in ONE
    // bucket, and the previous week's Monday chains the streak to exactly 2.
    // (All-Wednesday fixtures can't see a broken Monday anchor — this can.)
    expect(M.weeklyStreak([
      "2026-08-17T10:00:00.000Z", // Monday, this week
      "2026-08-23T10:00:00.000Z", // Sunday, SAME week
      "2026-08-10T10:00:00.000Z", // Monday, previous week
    ])).toEqual({ weeks: 2, playedThisWeek: true });
    // Sunday-only this week still counts as this week (edge of the bucket)
    expect(M.weeklyStreak(["2026-08-23T10:00:00.000Z"])).toEqual({ weeks: 1, playedThisWeek: true });
  });
});
