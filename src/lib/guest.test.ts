// Guest peek mappers: the public board/players rows must map defensively —
// missing optional fields degrade to safe defaults, RPC failures to [].
import { describe, it, expect, beforeEach, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

import { joinSearch, fetchPublicBoard, fetchPublicPlayers } from "./guest";

beforeEach(() => rpcMock.mockReset());

describe("joinSearch", () => {
  it("always signs up and preserves the destination", () => {
    expect(joinSearch("/sos/1?apply=1")).toEqual({ mode: "signup", next: "/sos/1?apply=1" });
    expect(joinSearch()).toEqual({ mode: "signup", next: undefined });
  });
});

describe("fetchPublicBoard", () => {
  it("maps rows with honest defaults for optional fields", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        id: "s1", kind: "sos", play_at: "2026-08-20T16:00:00Z", created_at: "2026-08-19T10:00:00Z",
        format: "singles", level_min: 2, level_max: 4, spots_needed: 1, spots_filled: 0,
        court_name: "USIF", court_city: "Uppsala", court_type: "indoor", court_status: "booked",
        caller_id: "u1", caller_name: "Anna",
      }],
    });
    const rows = await fetchPublicBoard();
    expect(rpcMock).toHaveBeenCalledWith("public_board");
    expect(rows).toHaveLength(1);
    const r = rows[0] as Record<string, unknown>;
    expect(r).toMatchObject({
      id: "s1", status: "active", court_id: null, sport: "tennis",
      play_until: null, court_type_any: false, caller_photo_url: null,
      note: null, is_buddy: false, claimed_by: null,
    });
  });
  it("passes through window/any/photo/sport when the RPC provides them", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ id: "s2", kind: "open", play_at: "x", created_at: "y", format: "doubles_need3",
        level_min: 1, level_max: 5, spots_needed: 3, spots_filled: 1, court_name: "UTK",
        court_city: "Uppsala", court_type: "outdoor", court_status: "public", caller_id: "u2",
        caller_name: "Bo", caller_photo: "p.jpg", sport: "padel", play_until: "z", court_type_any: true }],
    });
    const r = (await fetchPublicBoard())[0] as Record<string, unknown>;
    expect(r.caller_photo_url).toBe("p.jpg");
    expect(r.sport).toBe("padel");
    expect(r.play_until).toBe("z");
    expect(r.court_type_any).toBe(true);
  });
  it("null data → [], thrown RPC → []", async () => {
    rpcMock.mockResolvedValueOnce({ data: null });
    expect(await fetchPublicBoard()).toEqual([]);
    rpcMock.mockRejectedValueOnce(new Error("net"));
    expect(await fetchPublicBoard()).toEqual([]);
  });
});

describe("fetchPublicPlayers", () => {
  it("maps sample players with defaults", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: "p1", name: "Cleo" }] });
    const rows = await fetchPublicPlayers();
    expect(rpcMock).toHaveBeenCalledWith("public_players", { _limit: 30 });
    expect(rows[0]).toMatchObject({
      id: "p1", name: "Cleo", last_name: null, photo_url: null, level: 3,
      formats: [], play_times: [], vibe: "friendly", buddy_optin: "no",
      rescues_count: 0, games_played: 0, member_tier: null,
    });
  });
  it("keeps provided level/vibe/stats", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: "p2", name: "Dag", level: 5, vibe: "chill", rescues_count: 7, games_played: 12, photo_url: "x.jpg", home_city: "Stockholm" }] });
    const r = (await fetchPublicPlayers())[0];
    expect(r).toMatchObject({ level: 5, vibe: "chill", rescues_count: 7, games_played: 12, photo_url: "x.jpg", home_city: "Stockholm" });
  });
  it("null data → [], thrown RPC → []", async () => {
    rpcMock.mockResolvedValueOnce({ data: null });
    expect(await fetchPublicPlayers()).toEqual([]);
    rpcMock.mockRejectedValueOnce(new Error("net"));
    expect(await fetchPublicPlayers()).toEqual([]);
  });
});
