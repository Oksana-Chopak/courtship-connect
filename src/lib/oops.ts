import { toast } from "sonner";

// OPTIONAL: set this to your support WhatsApp number (e.g. "+46701234567") to give
// users a one-tap "Message us" button on errors. Leave empty to fall back to
// "Copy details" (copies the error so the user can paste it with a screenshot).
export const SUPPORT_WA: string = "+46700266274";

type Copy = {
  titles: string[];
  body: string;
  msgUs: string;
  copy: string;
  copied: string;
  prefill: (d: string) => string;
};

const COPY: Record<"en" | "sv", Copy> = {
  en: {
    titles: [
      "Let! That one didn't land 🎾",
      "Net cord — give it another go 🎾",
      "Ooft, straight into the net 🎾",
      "Double fault on our side — not yours 🎾",
    ],
    body: "No worries — try again. If it keeps happening, send us a screenshot and we'll fix it fast.",
    msgUs: "Message us 🎾",
    copy: "Copy details",
    copied: "Copied — send it to us with a screenshot 🎾",
    prefill: (d) => `Hi Courtship team 🎾 I hit a snag:\n${d}\n(screenshot attached)`,
  },
  sv: {
    titles: [
      "Nät! Den gick inte igenom 🎾",
      "Nätsnärt — försök igen 🎾",
      "Hoppsan, rakt ut i nätet 🎾",
      "Dubbelfel på vår sida — inte din 🎾",
    ],
    body: "Ingen fara — försök igen. Om det fortsätter, skicka en skärmdump så fixar vi det snabbt.",
    msgUs: "Skriv till oss 🎾",
    copy: "Kopiera felinfo",
    copied: "Kopierat — skicka till oss med en skärmdump 🎾",
    prefill: (d) => `Hej Courtship-teamet 🎾 Jag stötte på ett problem:\n${d}\n(skärmdump bifogad)`,
  },
};

function lang(): "en" | "sv" {
  try {
    return localStorage.getItem("courtship.lang") === "sv" ? "sv" : "en";
  } catch {
    return "en";
  }
}

function detail(raw: unknown): string {
  if (!raw) return "something went wrong";
  if (typeof raw === "string") return raw;
  const m = (raw as any)?.message;
  return typeof m === "string" && m ? m : "something went wrong";
}

/**
 * Friendly, on-brand error toast: gently reassures, keeps the brand voice, and
 * always gives the user a next step (try again / reach us with a screenshot).
 * Never leak raw technical errors to users — route them through here instead.
 */
export function oops(raw?: unknown) {
  const c = COPY[lang()];
  const title = c.titles[Math.floor(Math.random() * c.titles.length)];
  const d = detail(raw);
  const waLink = SUPPORT_WA
    ? `https://wa.me/${SUPPORT_WA.replace(/[^\d]/g, "")}?text=${encodeURIComponent(c.prefill(d))}`
    : null;
  const rawDetail = d && d.length > 4 ? d.slice(0, 160) : "";
  toast.error(title, {
    description: rawDetail ? `${c.body}\n\n⚙️ ${rawDetail}` : c.body,
    duration: 12000,
    action: {
      label: waLink ? c.msgUs : c.copy,
      onClick: () => {
        if (waLink) {
          try {
            window.open(waLink, "_blank");
          } catch {
            /* ignore */
          }
        } else {
          navigator.clipboard
            ?.writeText(`Courtship issue: ${d}`)
            .then(() => toast.success(c.copied))
            .catch(() => {});
        }
      },
    },
  });
}
