// E2E-ONLY build config. Same app as vite.config.ts, but buildable for a LOCAL
// node server (NITRO_PRESET=node-server), which is what Playwright runs against:
//  - drops Lovable's mcpPlugin (editor bridge only, not app code)
//  - externalizes "cloudflare:workers": Lovable's generated /mcp + /.well-known
//    routes pull @lovable.dev/mcp-js, whose cors chunk lazily imports that
//    Cloudflare-only module; on the node preset it must stay unresolved. The
//    import is behind a runtime platform check, so it never executes on node —
//    and none of the e2e scenarios touch /mcp anyway.
// Used by: npm run test:e2e (see package.json). Never used for production.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // same SSR error-wrapper entry as the real build
    server: { entry: "server" },
  },
  vite: {
    build: { rollupOptions: { external: ["cloudflare:workers"] } },
  },
});
