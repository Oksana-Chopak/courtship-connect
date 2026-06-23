import { supabase } from "@/integrations/supabase/client";

// Public VAPID key is safe to ship to the client. Configure in env:
//   VITE_VAPID_PUBLIC_KEY=<base64url public key>
const VAPID_PUBLIC_KEY = (import.meta.env as any).VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Resolve the active SW registration without hanging in envs that have none
// (the app intentionally unregisters the SW in preview/dev — push is prod-only).
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((res) => setTimeout(() => res(null), 3000)),
    ]);
  } catch {
    return null;
  }
}

export type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await getRegistration();
  if (!reg) return "unsubscribed";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

async function persist(sub: PushSubscription): Promise<{ ok: boolean; reason?: string }> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey("auth"));
  if (!endpoint || !p256dh || !auth) return { ok: false, reason: "bad_subscription" };
  const { error } = await (supabase as any).rpc("save_push_subscription", {
    _endpoint: endpoint,
    _p256dh: p256dh,
    _auth: auth,
    _ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
  if (error) return { ok: false, reason: error.message ?? "save_failed" };
  return { ok: true };
}

// Ask permission (if needed) and create + store a subscription. Drives the opt-in CTA.
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no_vapid_key" };
  let perm: NotificationPermission = Notification.permission;
  if (perm === "default") {
    try { perm = await Notification.requestPermission(); } catch { return { ok: false, reason: "permission_error" }; }
  }
  if (perm !== "granted") return { ok: false, reason: perm };
  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no_sw" };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "subscribe_error" };
    }
  }
  return persist(sub);
}

// Silent resilience: if already granted, make sure a fresh subscription is stored.
// Safe to call on every load — no-ops unless permission is already granted.
export async function ensurePushSubscribed(): Promise<void> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== "granted") return;
  const reg = await getRegistration();
  if (!reg) return;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await persist(sub);
  } catch {
    /* best-effort */
  }
}

// Ask the backend to fan this SOS out to eligible rescuers. Fire-and-forget:
// the SOS is already live on the board, so a push hiccup must never block the
// user. Replaces a Supabase dashboard webhook — works purely via Lovable.
export async function notifySos(sosId: string): Promise<void> {
  try {
    await (supabase as any).functions.invoke("sos-notify", { body: { sos_id: sosId } });
  } catch {
    /* best-effort */
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* ignore */ }
  try { await (supabase as any).rpc("delete_push_subscription", { _endpoint: endpoint }); } catch { /* ignore */ }
}
