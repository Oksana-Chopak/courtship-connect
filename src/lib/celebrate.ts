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
  /** dictionary routing (audit P1-14): tier.<track>.<level> */
  track: "activity" | "rescuer" | "recruiter" | "matchmaker" | null;
  tierLevel: number | null;
  nextLevel: number | null;
};

type Progress = { games: number; rescues: number; referrals: number; hosted: number };

function readProgress(): Partial<Progress> | null {
  // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — under jsdom window always exists, and in node the window access below throws into the catch, which returns the same null.
  /* v8 ignore next: SSR guard — the test runner always provides storage globals */
  if (typeof window === "undefined") return null;
  // Stryker disable BlockStatement: emptying the try or catch makes readProgress return undefined instead of null — indistinguishable through the !prevRaw check.
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    // Stryker disable next-line ConditionalExpression: JSON.parse(null) parses to null and the shape check below rejects it — removing the guard converges to the same null.
    if (!raw) return null;
    const p = JSON.parse(raw);
    // referrals is optional for backward-compat with the first Phase-1 baseline.
    // Stryker disable next-line OptionalChaining: p is object-or-null here; property access on null throws into the catch, which returns the same null.
    if (typeof p?.games === "number" && typeof p?.rescues === "number") return p;
    return null;
  } catch {
    return null;
  }
  // Stryker restore BlockStatement
}

function writeProgress(p: Progress) {
  // Stryker disable next-line ConditionalExpression,StringLiteral: same SSR-guard convergence as readProgress — the try/catch below absorbs the no-window case.
  /* v8 ignore next: SSR guard — the test runner always provides storage globals */
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
  const track = kind === "game" ? "activity" as const : kind === "rescue" ? "rescuer" as const : kind === "recruit" ? "recruiter" as const : "matchmaker" as const;
  return {
    kind,
    count: after,
    leveledUp,
    // Stryker disable next-line OptionalChaining,StringLiteral,LogicalOperator: tAfter is never null — celebrationFor only runs on an increase, so tierOf(≥1) always returns a tier; this arm is unreachable defense.
    /* v8 ignore next 2: defensive — every track's first tier starts at count 1,
       and celebrationFor only runs on an increase, so tAfter is never null */
    tierName: tAfter?.name ?? "",
    // Stryker disable next-line OptionalChaining,StringLiteral,LogicalOperator: same unreachable tAfter-null defense as tierName above.
    /* v8 ignore next: same defensive tAfter-null arm */
    tierEmoji: tAfter?.emoji ?? "🎾",
    // Stryker disable next-line OptionalChaining: same unreachable tAfter-null defense as tierName above.
    toNext: tAfter?.next != null ? tAfter.next - after : null,
    // Stryker disable next-line OptionalChaining,LogicalOperator: same unreachable tAfter-null defense as tierName above.
    /* v8 ignore next: tAfter-null defensive arm (see above) */
    nextName: tAfter?.nextName ?? null,
    /* v8 ignore next 2: same defensive tAfter-null arms as above */
    track: tAfter ? track : null,
    // Stryker disable next-line OptionalChaining,LogicalOperator: same unreachable tAfter-null defense as tierName above.
    /* v8 ignore next: tAfter-null defensive arm (see above) */
    tierLevel: tAfter?.level ?? null,
    /* v8 ignore next: the tAfter-null arm is defensive (see above); the maxed-tier arm IS tested */
    nextLevel: tAfter && tAfter.next != null ? tAfter.level + 1 : null,
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
    /* v8 ignore next 2: readProgress already proved these are numbers */
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
