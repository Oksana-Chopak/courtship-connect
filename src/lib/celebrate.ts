import { activityTier, rescuerTier, recruiterTier, matchmakerTier } from "@/lib/courtship";

// Phase 1 of the rewards system: the "celebration moment".
// We never trust a single action to tell us a counter moved (games_played only
// ticks once BOTH players confirm). Instead we keep a small baseline in
// localStorage and, on every board load, diff the live lifetime counters
// against it. Any increase → a celebration; a tier crossing → a level-up.
// First run ever just records the baseline (no retroactive confetti).
// Tracks three counters: games played, rescues, and recruits (referrals).

const PROGRESS_KEY = "courtship.progress";

export type Celebration = {
  kind: "game" | "rescue" | "recruit" | "host" | "joined";
  count: number;
  leveledUp: boolean;
  tierName: string;
  tierEmoji: string;
  toNext: number | null;
  nextName: string | null;
};

type Progress = { games: number; rescues: number; referrals: number; hosted: number };

function readProgress(): Partial<Progress> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // referrals is optional for backward-compat with the first Phase-1 baseline.
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

function tierOf(kind: Celebration["kind"], n: number) {
  return kind === "game" ? activityTier(n) : kind === "rescue" ? rescuerTier(n) : kind === "recruit" ? recruiterTier(n) : matchmakerTier(n);
}

function celebrationFor(kind: Celebration["kind"], before: number, after: number): Celebration {
  const tBefore = tierOf(kind, before);
  const tAfter = tierOf(kind, after);
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
 * - A counter went up: return a Celebration (games > rescues > recruits priority).
 * - Nothing changed: return null.
 * Always advances the baseline so a celebration fires exactly once.
 */
export function checkCelebration(games: number, rescues: number, referrals: number, hosted: number): Celebration | null {
  const prevRaw = readProgress();
  const curr: Progress = { games: games ?? 0, rescues: rescues ?? 0, referrals: referrals ?? 0, hosted: hosted ?? 0 };
  writeProgress(curr);
  if (!prevRaw) return null; // baseline only — no retroactive celebration
  const prev: Progress = {
    games: prevRaw.games ?? 0,
    rescues: prevRaw.rescues ?? 0,
    // missing referrals (old baseline) → treat as current so we never fire a false recruit celebration
    referrals: typeof prevRaw.referrals === "number" ? prevRaw.referrals : curr.referrals,
    // missing hosted (older baseline) → treat as current so we never fire a false host celebration
    hosted: typeof prevRaw.hosted === "number" ? prevRaw.hosted : curr.hosted,
  };
  if (curr.games > prev.games) return celebrationFor("game", prev.games, curr.games);
  if (curr.rescues > prev.rescues) return celebrationFor("rescue", prev.rescues, curr.rescues);
  if (curr.referrals > prev.referrals) return celebrationFor("recruit", prev.referrals, curr.referrals);
  if (curr.hosted > prev.hosted) return celebrationFor("host", prev.hosted, curr.hosted);
  return null;
}
