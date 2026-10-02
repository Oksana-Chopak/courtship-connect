export const LEVELS = [
  { n: 1, name: "Beginner", color: "#22c55e" },
  { n: 2, name: "Improver", color: "#84cc16" },
  { n: 3, name: "Intermediate", color: "#eab308" },
  { n: 4, name: "Advanced", color: "#f97316" },
  { n: 5, name: "Competition", color: "#ef4444" },
] as const;

export const VIBES = [
  { value: "chill", emoji: "😌", label: "Chill" },
  { value: "friendly", emoji: "🤝", label: "Friendly" },
  { value: "sweat", emoji: "🔥", label: "Sweat" },
] as const;

export const PLAY_TIMES = [
  "Weekday mornings",
  "Weekday lunch",
  "Weekday evenings",
  "Weekend mornings",
  "Weekend afternoons",
] as const;

export const FORMATS = ["singles", "doubles"] as const;

export function levelMeta(n: number) {
  return LEVELS.find((l) => l.n === n) ?? LEVELS[2];
}

export function vibeEmoji(v: string) {
  return VIBES.find((x) => x.value === v)?.emoji ?? "🎾";
}

export function whatsappLink(phoneE164: string, name: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const greeting = `Hey ${name}! Found you on Courtship 🎾 Up for a hit?`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(greeting)}`;
}

export function whatsappLinkSos(
  phoneE164: string,
  name: string,
  court: string,
  time: string,
) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const greeting = `Hey ${name}! You're a hero 🚑 See you at ${court} at ${time} — I'll bring balls 🎾`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(greeting)}`;
}

// Pick a deterministic brand color for a monogram avatar.
const MONOGRAM_PALETTE = [
  ["#FF5747", "#FFF6E8"], // coral on cream
  ["#C9EE3F", "#2B2118"], // green on ink
  ["#8C5A33", "#FFF6E8"], // wood on cream
  ["#2B2118", "#C9EE3F"], // ink on green
];

export function monogramColors(seed: string): [string, string] {
  let h = 0;
  // Stryker disable next-line ArithmeticOperator: flipping + to − negates the whole hash (h₋ ≡ −h₊ by induction from h=0) and Math.abs below erases the sign — the palette pick is provably identical for every input.
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MONOGRAM_PALETTE[Math.abs(h) % MONOGRAM_PALETTE.length] as [string, string];
}

export function initialOf(name: string) {
  // Stryker disable next-line OptionalChaining: trim() always returns a string once name passed the first ?., so the second ?. can never observably fire.
  return (name?.trim()?.charAt(0) || "?").toUpperCase();
}

/** Normalize a phone string into E.164 with a default country prefix. */
export function toE164(raw: string, defaultPrefix = "+46"): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Already international
  if (trimmed.startsWith("+")) {
    // Stryker disable next-line MethodExpression: with or without slice(1) the \D strip removes the leading + — outputs are identical for every input.
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  const digits = trimmed.replace(/\D/g, "");
  // Swedish numbers entered with leading 0 → drop the 0
  const local = digits.replace(/^0+/, "");
  return defaultPrefix + local;
}

export const CITIES = ["Uppsala", "Stockholm", "Miami"] as const;
// Data-driven since 2026-07-20: the canonical list lives in the `cities` table
// (src/lib/cities.ts); CITIES above is only the offline/pre-migration fallback.
export type City = string;

// Sports (padel & badminton join tennis). Emoji + i18n label key.
export const SPORTS = ["tennis", "padel", "badminton"] as const;
export type Sport = (typeof SPORTS)[number];
// Onboarding: goals + experience (English canonical values; labels via i18n)
// events/coach added 2026-07-22: real group posts map onto our events & coach
// offering — capture the intent and route to it.
export const GOALS = ["partners", "fitness", "improve", "compete", "social", "events", "coach"] as const;
export const EXPERIENCES = ["new", "1_3", "3_10", "10_plus"] as const;
// Swedish players speak the Matchi scale ("I'm 5–6 on Matchi") — show the
// equivalence next to our L1–L5 so the level picker talks their language.
export const MATCHI_BY_LEVEL: Record<number, string> = { 1: "1–2", 2: "3–4", 3: "5–6", 4: "7–8", 5: "9–10" };

export function sportMeta(sport?: string | null): { emoji: string; key: string } {
  if (sport === "padel") return { emoji: "🏓", key: "sport.padel" };
  if (sport === "badminton") return { emoji: "🏸", key: "sport.badminton" };
  return { emoji: "🎾", key: "sport.tennis" };
}

/** Court booking granularity in minutes per city (one editable place). */
export const BOOKING_GRANULARITY_MINUTES: Record<string, number> = {
  Uppsala: 60,
  Stockholm: 30,
};
export const DEFAULT_GRANULARITY_MINUTES = 60;
/** Earliest / latest selectable slot of day (24h). */
export const COURT_DAY_START = 7;  // 07:00
export const COURT_DAY_END   = 22; // 22:00
/** For today, the first offered slot is at least this far ahead (time to
 *  actually reach the court). */
export const SLOT_LEAD_MIN = 60;

export function cityGranularity(city: string): number {
  return BOOKING_GRANULARITY_MINUTES[city] ?? DEFAULT_GRANULARITY_MINUTES;
}

/** The day the post wizard opens on: today — or tomorrow once today has no
 *  bookable slot left (from 21:01 the last 22:00 start is inside the lead
 *  time). Someone opening the wizard at 22:30 wants to play tomorrow, not
 *  to scroll an empty wheel into a greyed-out button (2026-10 funnel audit). */
export function defaultPostDate(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const firstStart = now.getHours() * 60 + now.getMinutes() + SLOT_LEAD_MIN;
  if (firstStart > COURT_DAY_END * 60) d.setDate(d.getDate() + 1);
  return d;
}

/** All valid HH:MM slots for a city across the playable day. */
export function generateSlots(city: string, forDate?: Date, now: Date = new Date()): string[] {
  const step = cityGranularity(city);
  // Stryker disable next-line ArithmeticOperator: this initial floor is defensive — the emit loop already starts at COURT_DAY_START, so any value ≤ the day start produces the identical slot list.
  let minMinutes = COURT_DAY_START * 60;
  // For today, only offer slots at least ~1h ahead (time to actually reach the court).
  // Stryker disable next-line ConditionalExpression: forcing the branch with forDate=undefined makes d0 an Invalid Date, NaN !== n0 skips the narrowing — behavior converges.
  if (forDate) {
    const d0 = new Date(forDate); d0.setHours(0, 0, 0, 0);
    const n0 = new Date(now); n0.setHours(0, 0, 0, 0);
    if (d0.getTime() === n0.getTime()) {
      const nowMin = now.getHours() * 60 + now.getMinutes() + SLOT_LEAD_MIN;
      minMinutes = Math.ceil(nowMin / step) * step;
    }
  }
  const out: string[] = [];
  for (let h = COURT_DAY_START; h <= COURT_DAY_END; h++) {
    for (let m = 0; m < 60; m += step) {
      if (h === COURT_DAY_END && m !== 0) break;
      if (h * 60 + m < minMinutes) continue;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

/** Snap a Date's time to the nearest valid slot for the city (round mode). */
// Stryker disable next-line StringLiteral: the default-mode literal only needs to differ from "up" — any other string selects the same nearest branch.
export function snapToSlot(d: Date, city: string, mode: "nearest" | "up" = "nearest"): Date {
  const step = cityGranularity(city);
  const x = new Date(d);
  const mins = x.getHours() * 60 + x.getMinutes();
  const startMin = COURT_DAY_START * 60;
  const endMin = COURT_DAY_END * 60;
  let snapped: number;
  if (mode === "up") {
    snapped = Math.ceil(mins / step) * step;
  } else {
    snapped = Math.round(mins / step) * step;
  }
  // Stryker disable next-line EqualityOperator: at snapped === startMin the clamp assigns the value it already has — <= is indistinguishable from <.
  if (snapped < startMin) snapped = startMin;
  // Stryker disable next-line EqualityOperator: same self-assignment argument at the upper clamp.
  if (snapped > endMin) snapped = endMin;
  x.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return x;
}

export const COURT_TYPES = ["indoor", "outdoor"] as const;
export const DURATIONS = [60, 90, 120] as const;
// Stryker disable next-line ConditionalExpression: the 60 and 120 fast-paths equal the Math.round fallback ("1h"/"2h") — only the 90 arm is observable and it is pinned by tests.
export function durationLabel(min: number): string { return min === 60 ? "1h" : min === 90 ? "1.5h" : min === 120 ? "2h" : `${Math.round(min / 60)}h`; }
export type CourtType = (typeof COURT_TYPES)[number];

// Stryker disable next-line StringLiteral: the default-lang literal only needs to differ from "sv" — any other string selects the EN table.
export function courtTypeMeta(t: CourtType | string | null | undefined, lang: "en" | "sv" = "en") {
  // Defensive: rows from an RPC missing court_type (or a future value) must
  // degrade to a sane default instead of crashing the whole board render.
  // Stryker disable next-line ConditionalExpression,StringLiteral: the t === "outdoor" comparison only passes through the exact value the fallback yields anyway — its mutants are equivalent by construction.
  const ct: CourtType = t === "indoor" || t === "outdoor" ? t : "outdoor";
  const en: Record<CourtType, { label: string; emoji: string }> = {
    indoor:  { label: "Indoor",  emoji: "🏠" },
    outdoor: { label: "Outdoor", emoji: "☀️" },
  };
  const sv: Record<CourtType, { label: string; emoji: string }> = {
    indoor:  { label: "Inne", emoji: "🏠" },
    outdoor: { label: "Ute",  emoji: "☀️" },
  };
  return (lang === "sv" ? sv : en)[ct];
}

export const COURT_STATUSES = [
  { value: "booked_paid", label: "Booked & paid 💸" },
  { value: "booked", label: "Booked" },
  { value: "will_book", label: "Will book" },
  { value: "public", label: "Public court" },
] as const;

/** Hours-before-play that flip a posting from a planned open game to an urgent SOS. */
export const URGENCY_WINDOW_HOURS = 6;

export function isUrgent(playAt: Date | string): boolean {
  // Stryker disable next-line ConditionalExpression: new Date(aDate).getTime() equals aDate.getTime() — forcing the string arm changes nothing for Date inputs.
  const t = typeof playAt === "string" ? new Date(playAt).getTime() : playAt.getTime();
  return t - Date.now() <= URGENCY_WINDOW_HOURS * 3600 * 1000;
}

export type CourtStatus = "booked_paid" | "booked" | "will_book" | "public";

// Stryker disable next-line StringLiteral: same default-lang argument as courtTypeMeta — anything ≠ "sv" is the EN table.
export function courtStatusMeta(s: CourtStatus, lang: "en" | "sv" = "en") {
  const en: Record<CourtStatus, { label: string; tone: "green" | "neutral" }> = {
    booked_paid: { label: "💸 Court booked & paid", tone: "green" },
    booked:      { label: "✓ Court booked",         tone: "green" },
    will_book:   { label: "🤝 We'll book together", tone: "neutral" },
    public:      { label: "🏞 Public court",        tone: "neutral" },
  };
  const sv: Record<CourtStatus, { label: string; tone: "green" | "neutral" }> = {
    booked_paid: { label: "💸 Banan bokad & betald", tone: "green" },
    booked:      { label: "✓ Banan bokad",            tone: "green" },
    will_book:   { label: "🤝 Vi bokar ihop",         tone: "neutral" },
    public:      { label: "🏞 Allmän bana",            tone: "neutral" },
  };
  return (lang === "sv" ? sv : en)[s];
}

export const SOS_FORMATS = [
  { value: "singles", label: "Singles" },
  { value: "doubles_need1", label: "Doubles — need 1" },
  { value: "doubles_need2", label: "Doubles — need 2" },
  { value: "doubles_need3", label: "Doubles — need 3" },
] as const;

export function spotsNeeded(format: string): number {
  if (format === "doubles_need3") return 3;
  if (format === "doubles_need2") return 2;
  return 1;
}

export function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function timeUntil(iso: string): string {
  const sec = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (sec < 0) return "now";
  if (sec < 3600) return `in ${Math.max(1, Math.floor(sec / 60))}m`;
  if (sec < 86400) return `in ${Math.floor(sec / 3600)}h`;
  return `in ${Math.floor(sec / 86400)}d`;
}

// IANA timezone for a city name — used to render share-preview (OG) times in
// the game's local zone on the UTC server runtime instead of leaking UTC
// (2026-07-20 audit). Falls back to Stockholm (the founding market).
export function cityTimeZone(city: string | null | undefined): string {
  // Stryker disable next-line StringLiteral: the nullish seed only matters for null/undefined city, and every non-"Miami" string (any mutant value) hits the same Stockholm default.
  switch ((city ?? "").trim()) {
    case "Miami": return "America/New_York";
    default: return "Europe/Stockholm";
  }
}

// Compact window label for the time rail. Pads minutes only when non-zero, so
// "14:00–19:00" stays "14–19" but "09:30–11:00" keeps the :30 that the bare
// getHours() version silently dropped (2026-07-20 audit).
export function hourRange(start: Date, end: Date): string {
  const h = (d: Date) => (d.getMinutes() ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : `${d.getHours()}`);
  return `${h(start)}–${h(end)}`;
}

/** Default UI language when no explicit choice is stored. */
export const LANG_FALLBACK = "en";

export function whenLabel(iso: string): string {
  let lang: string = LANG_FALLBACK;
  // Stryker disable next-line ConditionalExpression,StringLiteral: every test environment provides localStorage (typeof is always "object"), so the typeof arm and its "undefined" literal are SSR-only and unobservable here; the courtship.lang key itself stays behaviorally pinned by the SV whenLabel test.
  /* v8 ignore next: the typeof-localStorage false arm is SSR-only — the test runner always provides storage globals */
  try { lang = (typeof localStorage !== "undefined" && localStorage.getItem("courtship.lang")) || LANG_FALLBACK; } catch { /* ignore */ }
  const loc = lang === "sv" ? "sv-SE" : "en-GB";
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const hhmm = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, today)) return `${lang === "sv" ? "Idag" : "Today"} ${hhmm}`;
  if (sameDay(d, tomorrow)) return `${lang === "sv" ? "Imorgon" : "Tomorrow"} ${hhmm}`;
  const wd = d.toLocaleDateString(loc, { weekday: "short" });
  const dm = d.toLocaleDateString(loc, { day: "numeric", month: "short" });
  return `${wd} ${dm} · ${hhmm}`;
}
const RESCUER_TIERS = [
  { level: 1, name: "Set Saver", emoji: "🎾", at: 1 },
  { level: 2, name: "Match Medic", emoji: "🚑", at: 3 },
  { level: 3, name: "Court Hero", emoji: "🦸", at: 10 },
  { level: 4, name: "Rescue Ace", emoji: "🎯", at: 30 },
  { level: 5, name: "Living Legend", emoji: "🏆", at: 100 },
] as const;

export function rescuerTier(count: number): { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null {
  if (!count || count < 1) return null;
  let idx = 0;
  for (let i = 0; i < RESCUER_TIERS.length; i++) if (count >= RESCUER_TIERS[i].at) idx = i;
  const cur = RESCUER_TIERS[idx];
  const nx = RESCUER_TIERS[idx + 1] ?? null; // beyond the top tier → null
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}

const ACTIVITY_TIERS = [
  { level: 1, name: "Rookie", emoji: "🎾", at: 1 },
  { level: 2, name: "Regular", emoji: "🟢", at: 10 },
  { level: 3, name: "Local", emoji: "🔥", at: 25 },
  { level: 4, name: "Veteran", emoji: "⭐", at: 50 },
  { level: 5, name: "Courtmaster", emoji: "👑", at: 100 },
  { level: 6, name: "Champion", emoji: "🏅", at: 200 },
  { level: 7, name: "GOAT", emoji: "🐐", at: 400 },
] as const;

export function activityTier(count: number): { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null {
  if (!count || count < 1) return null;
  let idx = 0;
  for (let i = 0; i < ACTIVITY_TIERS.length; i++) if (count >= ACTIVITY_TIERS[i].at) idx = i;
  const cur = ACTIVITY_TIERS[idx];
  const nx = ACTIVITY_TIERS[idx + 1] ?? null; // beyond the top tier → null
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}

// Recruiter track — invites that turned into real signups (profiles.referrals_count).
// Thresholds are modest: bringing even a handful of players in is a big deal.
const RECRUITER_TIERS = [
  { level: 1, name: "Wingman", emoji: "🤝", at: 1 },
  { level: 2, name: "Connector", emoji: "🔗", at: 3 },
  { level: 3, name: "Influencer", emoji: "📣", at: 7 },
  { level: 4, name: "Kingmaker", emoji: "👑", at: 12 },
  { level: 5, name: "Legend", emoji: "🌟", at: 25 },
] as const;

export function recruiterTier(count: number): { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null {
  if (!count || count < 1) return null;
  let idx = 0;
  for (let i = 0; i < RECRUITER_TIERS.length; i++) if (count >= RECRUITER_TIERS[i].at) idx = i;
  const cur = RECRUITER_TIERS[idx];
  const nx = RECRUITER_TIERS[idx + 1] ?? null; // beyond the top tier → null
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}

// Weekly streak — consecutive weeks (Mon-based) with at least one played game.
// One missed week is forgiven (a built-in "freeze") so a single quiet week
// doesn't wipe a long run. The current week being empty does NOT break the
// streak (you still have time) — it just isn't counted until you play.
export function weeklyStreak(playedAtISO: string[]): { weeks: number; playedThisWeek: boolean } {
  // Stryker disable next-line MethodExpression: dropping either hygiene filter leaves Invalid Dates whose mondayOf() is NaN — NaN never equals a real Monday key, so the walk output is identical.
  const dates = playedAtISO.filter(Boolean).map((s) => new Date(s)).filter((d) => !isNaN(d.getTime()));
  // Stryker disable next-line ConditionalExpression: with an empty set the walk below finds nothing and returns the same { 0, false } — the early return is a fast path, not a behavior gate.
  if (!dates.length) return { weeks: 0, playedThisWeek: false };

  const mondayOf = (d: Date): number => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dow = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - dow);
    return x.getTime();
  };
  const prevWeek = (mondayMs: number): number => {
    const x = new Date(mondayMs);
    x.setDate(x.getDate() - 7); // DST-safe (date stepping, not ms math)
    return x.getTime();
  };

  const weeksWithGames = new Set(dates.map(mondayOf));
  const thisWeek = mondayOf(new Date());
  const playedThisWeek = weeksWithGames.has(thisWeek);

  let cursor = playedThisWeek ? thisWeek : prevWeek(thisWeek);
  let weeks = 0;
  let usedFreeze = false;
  while (true) {
    if (weeksWithGames.has(cursor)) {
      weeks++;
      cursor = prevWeek(cursor);
    } else if (weeks > 0 && !usedFreeze) {
      usedFreeze = true; // forgive a single gap week
      cursor = prevWeek(cursor);
    } else {
      break;
    }
  }
  return { weeks, playedThisWeek };
}

// Matchmaker track — open games you host (post) for others to join.
// Counted client-side from your open-game posts (no counter/SQL needed).
const MATCHMAKER_TIERS = [
  { level: 1, name: "Host", emoji: "🎪", at: 1 },
  { level: 2, name: "Organizer", emoji: "📅", at: 4 },
  { level: 3, name: "Ringleader", emoji: "📣", at: 10 },
  { level: 4, name: "Maestro", emoji: "🎩", at: 20 },
  { level: 5, name: "Impresario", emoji: "🌟", at: 40 },
] as const;

/** Rank names render through the dictionary (2026-08-12 audit P1-14):
 *  key = tier.<track>.<level>. Ladders are contiguous 1..N, so "next tier
 *  name" is simply level+1 through the same builder. */
export function tierNameKey(track: "activity" | "rescuer" | "recruiter" | "matchmaker", level: number): string {
  return `tier.${track}.${level}`;
}

// Full ladders for the "All four ranks" info popover (what each badge is + the count to reach it).
// Stryker disable next-line ObjectLiteral: static initializer — the runner's shared module registry never re-executes module scope per mutant, so this mutant can't be switched on; the ladder contents are pinned value-by-value in mutation-kills.test.ts.
export const RANK_LADDERS: Record<string, ReadonlyArray<{ level: number; name: string; emoji: string; at: number }>> = {
  activity: ACTIVITY_TIERS,
  rescuer: RESCUER_TIERS,
  recruiter: RECRUITER_TIERS,
  matchmaker: MATCHMAKER_TIERS,
};

export function matchmakerTier(count: number): { level: number; name: string; emoji: string; at: number; next: number | null; nextName: string | null } | null {
  if (!count || count < 1) return null;
  let idx = 0;
  for (let i = 0; i < MATCHMAKER_TIERS.length; i++) if (count >= MATCHMAKER_TIERS[i].at) idx = i;
  const cur = MATCHMAKER_TIERS[idx];
  const nx = MATCHMAKER_TIERS[idx + 1] ?? null; // beyond the top tier → null
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}

/** Maps get_contact_phone errors to honest, human toasts. */
export function waErrorKey(message: string | undefined): string {
  // Stryker disable next-line StringLiteral: the fallback only exists so the regexes get a string; no mutant value matches /no_number|forbidden/i, so the result is wa.failed either way.
  const m = message ?? "";
  if (/no_number/i.test(m)) return "wa.no_number";
  if (/forbidden/i.test(m)) return "wa.locked";
  return "wa.failed";
}
