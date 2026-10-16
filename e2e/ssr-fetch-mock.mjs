// Preloaded into the e2e nitro server (`node --import`), so the SERVER-side
// loaders of /e/<id> and /g/<id> get data during SSR — the page.route() mock
// only sees the browser. Without this, SSR always rendered the "gone" state and
// the hydration of the real page (dates, times) was never exercised: React
// #418 reached production (2026-10-16) because UTC server text ≠ Stockholm
// browser text. Only *.supabase.co is intercepted; everything else passes.
const realFetch = globalThis.fetch;
const inH = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });

const EVENT = {
  id: "e-1", host_id: "p-2", title: "Sunday Americano", starts_at: "2030-06-15T16:00:00Z" /* 18:00 in Stockholm */, city: "Uppsala",
  location: "USIF Tenniscenter", format: "americano", description: "Open play, all levels.", contact: null,
  price_sek: 100, status: "approved", created_at: inH(-24), capacity: 16, swish_number: null, spots_taken: 4,
  level_min: 1, level_max: 5, duration_min: 120, sport: "tennis",
};
const GAME = {
  id: "g-open", caller_id: "p-2", play_at: "2030-06-16T15:30:00Z" /* 17:30 in Stockholm */, play_until: null, court_id: "c-utk", format: "singles",
  level_min: 2, level_max: 4, status: "active", kind: "open", court_type: "indoor", court_type_any: false,
  court_name: "UTK-hallen", court_city: "Uppsala", host_name: "Johan", host_photo: null, sport: "tennis",
};
const WINDOW_GAME = { ...GAME, id: "g-window", play_at: "2030-06-17T14:00:00Z", play_until: "2030-06-17T17:00:00Z" /* 16–19 in Stockholm */ };

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/\.supabase\.co\//.test(url)) return realFetch(input, init);
  if (url.includes("/rest/v1/event_requests") && url.includes("e-1")) return json(EVENT);
  if (url.includes("/rest/v1/rpc/public_game")) {
    const body = String(init?.body ?? "");
    if (body.includes("g-window")) return json([WINDOW_GAME]);
    if (body.includes("g-open")) return json([GAME]);
    return json([]);
  }
  if (url.includes("/rest/v1/")) return json(url.includes("event_requests") ? null : []);
  return json({});
};
