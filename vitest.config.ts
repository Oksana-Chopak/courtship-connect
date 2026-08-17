import { defineConfig } from "vitest/config";
import path from "node:path";

// Test config (extended 2026-08-14 for the release test pyramid):
// - "@" alias so lib modules that import @/integrations/... resolve under the
//   runner (the supabase client itself is vi.mock'ed in unit tests, never dialed;
//   vite.config.ts still isn't loaded — its Start/nitro plugins break vitest).
// - v8 coverage over the logic layer, json-summary for the 100% gate script
//   (scripts/coverage-gate.mjs) that verify.sh enforces.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node", // per-file jsdom via // @vitest-environment docblocks
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["src/lib/**"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/i18n.tsx",          // guarded by i18n.keys.test.ts (usage + parity)
        "src/lib/mcp/**",            // Lovable agent-MCP scaffolding
        "src/lib/email-templates/**",
      ],
    },
  },
});
