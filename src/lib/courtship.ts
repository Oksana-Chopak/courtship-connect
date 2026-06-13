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

export const CITIES = ["Uppsala", "Stockholm"] as const;
export type City = (typeof CITIES)[number];

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
export type CourtType = (typeof COURT_TYPES)[number];

export function courtTypeMeta(t: CourtType, lang: "en" | "sv" = "en") {
  const en: Record<CourtType, { label: string; emoji: string }> = {
    indoor:  { label: "Indoor",  emoji: "🏠" },
    outdoor: { label: "Outdoor", emoji: "☀️" },
  };
  const sv: Record<CourtType, { label: string; emoji: string }> = {
    indoor:  { label: "Inne", emoji: "🏠" },
    outdoor: { label: "Ute",  emoji: "☀️" },
  };
  return (lang === "sv" ? sv : en)[t];
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
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const hhmm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, today)) return `Today ${hhmm}`;
  if (sameDay(d, tomorrow)) return `Tomorrow ${hhmm}`;
  return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}