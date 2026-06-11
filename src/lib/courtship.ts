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