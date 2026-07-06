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
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MONOGRAM_PALETTE[Math.abs(h) % MONOGRAM_PALETTE.length] as [string, string];
}

export function initialOf(name: string) {
  return (name?.trim()?.charAt(0) || "?").toUpperCase();
}

/** Normalize a phone string into E.164 with a default country prefix. */
export function toE164(raw: string, defaultPrefix = "+46"): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Already international
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  const digits = trimmed.replace(/\D/g, "");
  // Swedish numbers entered with leading 0 → drop the 0
  const local = digits.replace(/^0+/, "");
  return defaultPrefix + local;
}

export const CITIES = ["Uppsala", "Stockholm", "Miami"] as const;
export type City = (typeof CITIES)[number];

// Sports (padel & badminton join tennis). Emoji + i18n label key.
export const SPORTS = ["tennis", "padel", "badminton"] as const;
export type Sport = (typeof SPORTS)[number];
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

export function cityGranularity(city: string): number {
  return BOOKING_GRANULARITY_MINUTES[city] ?? DEFAULT_GRANULARITY_MINUTES;
}

/** All valid HH:MM slots for a city across the playable day. */
export function generateSlots(city: string, forDate?: Date, now: Date = new Date()): string[] {
  const step = cityGranularity(city);
  let minMinutes = COURT_DAY_START * 60;
  // For today, only offer slots at least ~1h ahead (time to actually reach the court).
  if (forDate) {
    const d0 = new Date(forDate); d0.setHours(0, 0, 0, 0);
    const n0 = new Date(now); n0.setHours(0, 0, 0, 0);
    if (d0.getTime() === n0.getTime()) {
      const LEAD_MIN = 60;
      const nowMin = now.getHours() * 60 + now.getMinutes() + LEAD_MIN;
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
  if (snapped < startMin) snapped = startMin;
  if (snapped > endMin) snapped = endMin;
  x.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return x;
}

export const COURT_TYPES = ["indoor", "outdoor"] as const;
export const DURATIONS = [60, 90, 120] as const;
export function durationLabel(min: number): string { return min === 60 ? "1h" : min === 90 ? "1.5h" : min === 120 ? "2h" : `${Math.round(min / 60)}h`; }
export type CourtType = (typeof COURT_TYPES)[number];

export function courtTypeMeta(t: CourtType | string | null | undefined, lang: "en" | "sv" = "en") {
  // Defensive: rows from an RPC missing court_type (or a future value) must
  // degrade to a sane default instead of crashing the whole board render.
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
  const t = typeof playAt === "string" ? new Date(playAt).getTime() : playAt.getTime();
  return t - Date.now() <= URGENCY_WINDOW_HOURS * 3600 * 1000;
}

export type CourtStatus = "booked_paid" | "booked" | "will_book" | "public";

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

export function whenLabel(iso: string): string {
  let lang = "en";
  try { lang = (typeof localStorage !== "undefined" && localStorage.getItem("courtship.lang")) || "en"; } catch { /* ignore */ }
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
  const nx = idx < RESCUER_TIERS.length - 1 ? RESCUER_TIERS[idx + 1] : null;
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
  const nx = idx < ACTIVITY_TIERS.length - 1 ? ACTIVITY_TIERS[idx + 1] : null;
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
  const nx = idx < RECRUITER_TIERS.length - 1 ? RECRUITER_TIERS[idx + 1] : null;
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}

// Weekly streak — consecutive weeks (Mon-based) with at least one played game.
// One missed week is forgiven (a built-in "freeze") so a single quiet week
// doesn't wipe a long run. The current week being empty does NOT break the
// streak (you still have time) — it just isn't counted until you play.
export function weeklyStreak(playedAtISO: string[]): { weeks: number; playedThisWeek: boolean } {
  const dates = playedAtISO.filter(Boolean).map((s) => new Date(s)).filter((d) => !isNaN(d.getTime()));
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

// Full ladders for the "All four ranks" info popover (what each badge is + the count to reach it).
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
  const nx = idx < MATCHMAKER_TIERS.length - 1 ? MATCHMAKER_TIERS[idx + 1] : null;
  return { level: cur.level, name: cur.name, emoji: cur.emoji, at: cur.at, next: nx ? nx.at : null, nextName: nx ? nx.name : null };
}
