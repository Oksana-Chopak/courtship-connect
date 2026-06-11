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

export const COURTS = [
  "Fyrishov",
  "UTK (Uppsala Tennisklubb)",
  "Studenternas",
  "Stadsträdgården Court",
  "Gränby Court",
  "Sunnersta Court",
  "Luthagen Court",
] as const;