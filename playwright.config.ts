import { defineConfig, devices } from "@playwright/test";

// E2E smoke of the guest funnel against the PRODUCTION build: the app is built
// with NITRO_PRESET=node-server (vite.e2e.config.ts) and served by the built
// nitro server; Supabase is mocked at the network layer inside each spec.
// Host is pinned to 127.0.0.1 — this sandbox has no IPv6 (:: fails EAFNOSUPPORT).
// Run: npm run test:e2e (builds first), or `npx playwright test` if .output is fresh.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Pixel 7"], // phone-first PWA — test on a phone viewport (Chromium: the only browser in this sandbox)
    // The landing/board CTAs carry an infinite .cs-pulse heartbeat; the app
    // honors prefers-reduced-motion (a11y), so tests run that variant — it also
    // keeps Playwright's "element is stable" check deterministic.
    contextOptions: { reducedMotion: "reduce" },
    // The sandbox ships one pinned Chromium at this path; point Playwright at it
    // instead of downloading a matching build (network-restricted environment).
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: "HOST=127.0.0.1 PORT=4173 node .output/server/index.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
