// @vitest-environment jsdom
// The two data-driven picker hooks: start on static fallbacks, swap in DB rows.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const state: { cities: unknown[] | null; areas: unknown[] | null } = { cities: null, areas: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: state.cities }) }),          // cities path
        order: () => ({ order: () => Promise.resolve({ data: state.areas }) }),        // areas path
      }),
    }),
  },
}));

beforeEach(() => {
  state.cities = null;
  state.areas = null;
  vi.resetModules();
});

describe("useCityNames", () => {
  it("starts with the static list and swaps in DB cities", async () => {
    state.cities = [
      { name: "Uppsala", timezone: "Europe/Stockholm", granularity_min: 60 },
      { name: "Miami", timezone: "America/New_York", granularity_min: 30 },
    ];
    const { useCityNames } = await import("./cities");
    const { result } = renderHook(() => useCityNames());
    expect(result.current).toContain("Uppsala"); // fallback immediately
    await waitFor(() => expect(result.current).toEqual(["Uppsala", "Miami"]));
  });
  it("keeps the fallback when the table is empty", async () => {
    state.cities = [];
    const { useCityNames } = await import("./cities");
    const { result, unmount } = renderHook(() => useCityNames());
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
    unmount(); // exercises the cancelled-cleanup branch
  });
});

describe("useCityAreas", () => {
  it("starts with FALLBACK_AREAS and swaps in DB rows", async () => {
    state.areas = [{ city: "Uppsala", area: "Centrum", sort: 1 }];
    const { useCityAreas, FALLBACK_AREAS } = await import("./areas");
    const { result } = renderHook(() => useCityAreas());
    expect(result.current).toEqual(FALLBACK_AREAS);
    await waitFor(() => expect(result.current.Uppsala).toEqual(["Centrum"]));
  });
});
