
## Build

- Root `deno.json` sets `nodeModulesDir: auto` so `deno check` on `supabase/functions` resolves `npm:` deps (web-push) even when node_modules was installed by bun.
