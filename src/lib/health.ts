// Health — "what broke, what works", visible to Oxy at once (2026-10-06).
//
// Two halves:
//   1. Capture. Every error a player meets — an uncaught exception, a rejected
//      promise, a toast from oops(), the root error boundary — is written to
//      public.client_errors through the report_client_error RPC (rate-limited,
//      deduped, never blocks the UI). Guests included (user_id null).
//   2. Checks. The Admin "Health" card runs live probes from the admin's own
//      browser (can the app reach every edge function? do the RPCs answer?)
//      and reads server facts (admin_health) + the last 24h of client errors
//      (admin_client_errors). Each row is ✅ or ❌ with a plain-words reason.
import { supabase } from "@/integrations/supabase/client";

export type ErrorKind = "error" | "promise" | "shown" | "boundary" | "rpc" | "function";

const MAX_PER_MINUTE = 10;
const DEDUPE_MS = 60_000;

/** Pure guard: at most MAX_PER_MINUTE reports a minute, and the same
 *  message+where only once a minute. Testable without a browser. */
export class ReportGate {
  private stamps: number[] = [];
  private last = new Map<string, number>();
  constructor(private readonly now: () => number = () => Date.now()) {}
  allow(key: string): boolean {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < 60_000);
    if (this.stamps.length >= MAX_PER_MINUTE) return false;
    const prev = this.last.get(key);
    if (prev != null && t - prev < DEDUPE_MS) return false;
    this.stamps.push(t);
    this.last.set(key, t);
    return true;
  }
}

/** One line a human can read, from whatever was thrown. */
export function describeError(raw: unknown): string {
  if (raw == null) return "unknown error";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message || raw.name || "Error";
  const m = (raw as any)?.message ?? (raw as any)?.error_description ?? (raw as any)?.error;
  if (typeof m === "string" && m) return m;
  try { return JSON.stringify(raw).slice(0, 300); } catch { return String(raw); }
}

/** Noise we never report: extension injections, aborted navigations, offline. */
export function isNoise(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("resizeobserver loop") ||
    m.includes("script error") ||
    m.includes("load failed") && m.includes("abort") ||
    m.includes("the operation was aborted") ||
    m.includes("aborterror") ||
    m.includes("network request failed") && typeof navigator !== "undefined" && navigator.onLine === false ||
    m.includes("chrome-extension://") ||
    m.includes("moz-extension://")
  );
}

const gate = new ReportGate();

/** Fire-and-forget. Never throws, never awaits anything the UI waits for. */
export function reportClientError(kind: ErrorKind, raw: unknown, details?: string): void {
  try {
    if (typeof window === "undefined") return;
    const message = describeError(raw).slice(0, 500);
    if (!message || isNoise(message)) return;
    const where = `${window.location.pathname}${window.location.search}`.slice(0, 120);
    if (!gate.allow(`${kind}|${message}|${where}`)) return;
    const stack = raw instanceof Error && raw.stack ? raw.stack.split("\n").slice(0, 6).join("\n") : "";
    const det = [details ?? "", stack].filter(Boolean).join("\n").slice(0, 2000) || null;
    void (supabase as any)
      .rpc("report_client_error", { _kind: kind, _message: message, _where: where, _details: det, _ua: navigator.userAgent.slice(0, 200) })
      .then(() => undefined, () => undefined);
  } catch {
    /* reporting must never hurt */
  }
}

let installed = false;
/** Global capture — call once from the root component. Idempotent. */
export function installErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    reportClientError("error", e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined);
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportClientError("promise", e.reason);
  });
}

// ── Live checks for the Admin card ──────────────────────────────────────────

export type Check = { id: string; ok: boolean; detail: string };

export const EDGE_FUNCTIONS = ["sos-notify", "notify-users", "email-notify", "email-broadcast", "lifecycle-emails"] as const;

function functionsBase(): string {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  return `${url ?? "https://ycsidxtrizgycfumkrnq.supabase.co"}/functions/v1`;
}

/** Safe no-op payloads: each function answers these without doing anything.
 *  lifecycle-emails MUST get dry:true — an empty body is a real daily run. */
const PROBE_BODY: Record<string, unknown> = {
  "sos-notify": {}, "notify-users": {}, "email-notify": {}, "email-broadcast": {}, "lifecycle-emails": { dry: true },
};

/** Can THIS browser call the function the way the app does?
 *  Step 1 — a "simple" request (no auth header, no preflight): the gateway
 *  answers 404 for a function that is not deployed.
 *  Step 2 — supabase.functions.invoke, i.e. with the Authorization header and
 *  JSON: the browser sends a CORS preflight first; if the function does not
 *  answer it, the call never leaves the browser (FunctionsFetchError —
 *  "Failed to send a request to the Edge Function"). */
export async function checkEdgeFunction(name: string): Promise<Check> {
  try {
    const r = await fetch(`${functionsBase()}/${name}`, { method: "POST", body: "{}" });
    if (r.status === 404) return { id: name, ok: false, detail: "not deployed — ask Lovable to deploy it" };
  } catch (e) {
    return { id: name, ok: false, detail: `unreachable: ${describeError(e)}` };
  }
  try {
    const { error } = await (supabase as any).functions.invoke(name, { body: PROBE_BODY[name] ?? {} });
    if (!error) return { id: name, ok: true, detail: "reachable from the app" };
    const n = String(error?.name ?? "");
    if (n === "FunctionsFetchError") return { id: name, ok: false, detail: "deployed, but the app can't call it (CORS preflight fails)" };
    const status = Number(error?.context?.status ?? 0);
    // an HTTP answer means the call went through — 401/403 for a non-admin is still "reachable"
    return { id: name, ok: true, detail: `reachable (answered ${status || n || "with an error"})` };
  } catch (e) {
    return { id: name, ok: false, detail: `blocked: ${describeError(e)}` };
  }
}

export async function runLiveChecks(): Promise<Check[]> {
  const out: Check[] = [];
  // 1. the API answers (public RPC, no auth needed)
  try {
    const t0 = Date.now();
    const { error } = await (supabase as any).rpc("public_board");
    out.push(error ? { id: "api", ok: false, detail: error.message } : { id: "api", ok: true, detail: `answers in ${Date.now() - t0} ms` });
  } catch (e) { out.push({ id: "api", ok: false, detail: describeError(e) }); }
  // 2. my session
  try {
    const { data } = await supabase.auth.getSession();
    out.push(data.session ? { id: "session", ok: true, detail: "signed in" } : { id: "session", ok: false, detail: "no session in this browser" });
  } catch (e) { out.push({ id: "session", ok: false, detail: describeError(e) }); }
  // 3. every edge function, from this browser
  for (const fn of EDGE_FUNCTIONS) out.push(await checkEdgeFunction(fn));
  // 4. push in this browser
  try {
    const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
    const sw = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    // informational unless something is actually broken (denied, or no service worker where one should be)
    out.push({ id: "push_here", ok: perm !== "denied" && (perm !== "granted" || !!sw), detail: `permission ${perm}, service worker ${sw ? "registered" : "missing"}` });
  } catch (e) { out.push({ id: "push_here", ok: false, detail: describeError(e) }); }
  return out;
}
