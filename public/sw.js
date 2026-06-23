// Minimal app-shell SW for installed PWA + Web Push for "Save My Set".
// HTML uses NetworkFirst (never serve stale shell), static assets stay default.
const CACHE = "courtship-shell-v2";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("courtship-")).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || new Response("Offline", { status: 503 }))),
    );
  }
});

// ── Web Push: an SOS reaches a rescuer even with the app closed.
// Payload (JSON) sent by the sos-notify edge function:
//   { title, body, url: "/sos/<id>", tag: "sos-<id>" }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Courtship 🎾";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "courtship",
    renotify: true,
    data: { url: data.url || "/board" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap the notification → focus an open tab (and route it) or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/board";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            try { client.navigate(target); } catch (_e) { /* cross-doc nav guard */ }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
