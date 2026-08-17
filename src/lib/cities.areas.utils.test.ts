// Data-driven pickers: DB rows win, static fallbacks keep the UI alive when a
// table isn't migrated, caches dedupe the fetch. Plus the cn() class merger.
import { describe, it, expect, beforeEach, vi } from "vitest";

const state: { rows: unknown[] | null; throwErr: boolean; calls: number } = { rows: null, throwErr: false, calls: 0 };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const exec = () => {
          state.calls++;
          if (state.throwErr) return Promise.reject(new Error("no table"));
          return Promise.resolve({ data: state.rows });
        };
        // cities: .eq().order() — areas: .order().order()
        return {
          eq: () => ({ order: () => exec() }),
          order: () => ({ order: () => exec() }),
        };
      },
    }),
  },
}));

beforeEach(() => {
  state.rows = null;
  state.throwErr = false;
  state.calls = 0;
  vi.resetModules(); // each test gets a fresh module-level cache
});

describe("fetchCities", () => {
  it("uses DB rows, seeds granularity and caches", async () => {
    state.rows = [{ name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 }, { name: "Miami", timezone: "America/New_York", granularity_min: 30 }];
    const { fetchCities } = await import("./cities");
    const { BOOKING_GRANULARITY_MINUTES } = await import("./courtship");
    const first = await fetchCities();
    expect(first.map((c) => c.name)).toEqual(["Uppsala", "Miami"]);
    expect(BOOKING_GRANULARITY_MINUTES.Miami).toBe(30);
    await fetchCities();
    expect(state.calls).toBe(1); // cached
  });
  it("empty table → static fallback; thrown query → static fallback", async () => {
    state.rows = [];
    let mod = await import("./cities");
    expect((await mod.fetchCities()).map((c) => c.name)).toContain("Uppsala");
    vi.resetModules();
    state.throwErr = true;
    mod = await import("./cities");
    const fb = await mod.fetchCities();
    expect(fb.length).toBeGreaterThan(0);
    expect(fb[0].timezone).toBe("Europe/Stockholm");
  });
  it("concurrent callers share one in-flight fetch", async () => {
    state.rows = [{ name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 }];
    const { fetchCities } = await import("./cities");
    const [a, b] = await Promise.all([fetchCities(), fetchCities()]);
    expect(a).toEqual(b);
    expect(state.calls).toBe(1);
  });
});

describe("fetchCityAreas", () => {
  it("groups DB rows by city and caches", async () => {
    state.rows = [
      { city: "Uppsala", area: "Centrum", sort: 1 },
      { city: "Uppsala", area: "Luthagen", sort: 2 },
      { city: "Stockholm", area: "Nacka", sort: 1 },
    ];
    const { fetchCityAreas } = await import("./areas");
    const m = await fetchCityAreas();
    expect(m.Uppsala).toEqual(["Centrum", "Luthagen"]);
    expect(m.Stockholm).toEqual(["Nacka"]);
    await fetchCityAreas();
    expect(state.calls).toBe(1);
  });
  it("empty/broken table → FALLBACK_AREAS", async () => {
    state.rows = [];
    let mod = await import("./areas");
    expect((await mod.fetchCityAreas()).Stockholm).toContain("Lidingö");
    vi.resetModules();
    state.throwErr = true;
    mod = await import("./areas");
    expect((await mod.fetchCityAreas()).Uppsala).toContain("Centrum");
  });
});

describe("cn", () => {
  it("merges conditional classes with tailwind dedupe", async () => {
    const { cn } = await import("./utils");
    expect(cn("p-2", false && "hidden", "p-4")).toBe("p-4");
    expect(cn("text-sm", ["font-bold", { underline: true, hidden: false }])).toBe("text-sm font-bold underline");
  });
});

describe("null-data and inflight dedupe stragglers", () => {
  it("cities: null data → fallback", async () => {
    state.rows = null;
    const { fetchCities } = await import("./cities");
    expect((await fetchCities()).length).toBeGreaterThan(0);
  });
  it("areas: null data → fallback; concurrent callers share one flight", async () => {
    state.rows = null;
    let mod = await import("./areas");
    expect((await mod.fetchCityAreas()).Uppsala).toBeTruthy();
    vi.resetModules();
    state.rows = [{ city: "Uppsala", area: "Centrum", sort: 1 }];
    mod = await import("./areas");
    const [a, b] = await Promise.all([mod.fetchCityAreas(), mod.fetchCityAreas()]);
    expect(a).toEqual(b);
  });
});
