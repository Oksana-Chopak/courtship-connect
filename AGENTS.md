
## Build

- Root `deno.json` sets `nodeModulesDir: none` so `deno check` on `supabase/functions` resolves `npm:` deps (web-push) from Deno's own cache; `auto` made Deno re-link bun's node_modules and fail with "File exists (os error 17)".
- `package-lock.json` is committed on purpose (2026-10-16). CI installs with `npm install`; without a lock npm 10 re-resolves the whole tree and crashed on a transitive peer set ("Cannot read properties of null (reading 'edgesOut')"). Keep the file; after changing `package.json`, regenerate it with `npx npm@12 install --package-lock-only --allow-remote=all` (Lovable itself builds from `bun.lock`).
