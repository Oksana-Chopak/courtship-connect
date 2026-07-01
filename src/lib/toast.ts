import { toast as base } from "sonner";
import { SUPPORT_WA } from "./oops";

function isSv(): boolean {
  try {
    return localStorage.getItem("courtship.lang") === "sv";
  } catch {
    return false;
  }
}

// Every error toast gets a one-tap route to support (WhatsApp) so a problem is
// never a dead-end. Callers can still pass their own `action` to override.
function supportAction() {
  const num = SUPPORT_WA.replace(/[^\d]/g, "");
  if (!num) return undefined;
  const sv = isSv();
  const text = sv
    ? "Hej Courtship-teamet 🎾 Jag behöver hjälp:"
    : "Hi Courtship team 🎾 I need a hand:";
  return {
    label: sv ? "💬 Skriv till oss" : "💬 Message support",
    onClick: () => {
      try {
        window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * App-wide toast. Successes/info/warnings auto-dismiss after ~10s; errors stay
 * until dismissed and always offer a one-tap "Message support" action. Anything
 * a caller passes in `opts` (duration, action, …) overrides these defaults.
 * Drop-in replacement for sonner's `toast`.
 */
const toast = Object.assign(
  (...args: Parameters<typeof base>) => base(...args),
  base,
  {
    success: (msg: Parameters<typeof base.success>[0], opts?: Parameters<typeof base.success>[1]) =>
      base.success(msg, { duration: 10000, ...opts }),
    info: (msg: Parameters<typeof base.info>[0], opts?: Parameters<typeof base.info>[1]) =>
      base.info(msg, { duration: 10000, ...opts }),
    warning: (msg: Parameters<typeof base.warning>[0], opts?: Parameters<typeof base.warning>[1]) =>
      base.warning(msg, { duration: 10000, ...opts }),
    message: (msg: Parameters<typeof base.message>[0], opts?: Parameters<typeof base.message>[1]) =>
      base.message(msg, { duration: 10000, ...opts }),
    error: (msg: Parameters<typeof base.error>[0], opts?: Parameters<typeof base.error>[1]) =>
      base.error(msg, { duration: Infinity, action: supportAction(), ...opts }),
  },
) as typeof base;

export { toast };
