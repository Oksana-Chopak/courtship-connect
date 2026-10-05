import { describe, it, expect } from "vitest";
import { findSameGame, type GameRow } from "./games";

const ME = "me";
const row = (over: Partial<GameRow>): GameRow => ({
  id: "g1", player_a: ME, player_b: "ann", confirmed_a: false, confirmed_b: false,
  reported_noshow: null, played_at: "2026-10-04T18:00:00.000Z", sos_id: "s1", ...over,
});

describe("findSameGame — a manual log merges into the unconfirmed app game", () => {
  it("finds the pending game with the same opponent near that time (either seat)", () => {
    expect(findSameGame([row({})], ME, "ann", "2026-10-04T19:30:00.000Z")?.id).toBe("g1");
    const seatB = row({ id: "g2", player_a: "ann", player_b: ME });
    expect(findSameGame([seatB], ME, "ann", "2026-10-05T10:00:00.000Z")?.id).toBe("g2");
  });

  it("ignores other opponents and games outside the ±26h window", () => {
    expect(findSameGame([row({})], ME, "bob", "2026-10-04T18:00:00.000Z")).toBeNull();
    expect(findSameGame([row({})], ME, "ann", "2026-10-06T18:00:00.000Z")).toBeNull();
    expect(findSameGame([row({})], ME, "ann", "2026-10-02T18:00:00.000Z")).toBeNull();
    expect(findSameGame([], ME, "ann", "2026-10-04T18:00:00.000Z")).toBeNull();
  });

  it("the window edge is inclusive and configurable", () => {
    const exactly26h = "2026-10-05T20:00:00.000Z";
    expect(findSameGame([row({})], ME, "ann", exactly26h)?.id).toBe("g1");
    expect(findSameGame([row({})], ME, "ann", exactly26h, 3600e3)).toBeNull();
  });

  it("returns the first match in the given order", () => {
    const rows = [row({ id: "older", played_at: "2026-10-04T10:00:00.000Z" }), row({ id: "newer" })];
    expect(findSameGame(rows, ME, "ann", "2026-10-04T18:00:00.000Z")?.id).toBe("older");
  });
});
