import { activityTier, rescuerTier } from "@/lib/courtship";

// Phase 1 of the rewards system: the "celebration moment".
// We never trust a single action to tell us a counter moved (games_played only
// ticks once BOTH players confirm). Instead we keep a small baseline in
// localStorage and, on every board load, diff the live lifetime counters
// against it. Any increase → a celebration; a tier crossing → a level-up.
// First run ever just records the baseline (no retroactive confetti).

const PROGRESS_KEY = "courtship.progress";

export type Celebration = {
  kind: "game" | "rescue";
  count: number;
  leveledUp: boolean;
  tierName: string;
  tierEmoji: string;
  toNext: number | null;
  nextName: string | null;
};

type Progress = { games: number; rescues: number };

function readProgress(): Progress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.games === "number" && typeof p?.rescues === "number") return p;
    return null;
  } catch {
    return null;
  }
}

function writeProgress(p: Progress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / private mode */
  }
}

function celebrationFor(kind: "game" | "rescue", before: number, after: number): Celebration {
  const tBefore = kind === "game" ? activityTier(before) : rescuerTier(before);
  const tAfter = kind === "game" ? activityTier(after) : rescuerTier(after);
  const leveledUp = !!tAfter && (!tBefore || tAfter.level > tBefore.level);
  return {
    kind,
    count: after,
    leveledUp,
    tierName: tAfter?.name ?? "",
    tierEmoji: tAfter?.emoji ?? "🎾",
    toNext: tAfter?.next != null ? tAfter.next - after : null,
    nextName: tAfter?.nextName ?? null,
  };
}

/**
 * Compare the current lifetime counters to the last-seen baseline.
 * - First call ever (no baseline): record silently, return null.
 * - A counter went up: return a Celebration (games take priority over rescues).
 * - Nothing changed: return null.
 * Always advances the baseline so a celebration fires exactly once.
 */
export function checkCelebration(games: number, rescues: number): Celebration | null {
  const prev = readProgress();
  const curr: Progress = { games: games ?? 0, rescues: rescues ?? 0 };
  writeProgress(curr);
  if (!prev) return null; // baseline only — no retroactive celebration
  if (curr.games > prev.games) return celebrationFor("game", prev.games, curr.games);
  if (curr.rescues > prev.rescues) return celebrationFor("rescue", prev.rescues, curr.rescues);
  return null;
}
