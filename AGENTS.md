
## Build

- Root `deno.json` sets `nodeModulesDir: none` so `deno check` on `supabase/functions` resolves `npm:` deps (web-push) from Deno's own cache; `auto` made Deno re-link bun's node_modules and fail with "File exists (os error 17)".
