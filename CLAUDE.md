# CLAUDE.md — Courtship / TennisBuddy

Read this before touching anything. It encodes decisions and bugs that already cost real time.

---

## 1. What this is

Courtship (brand: **TennisBuddy**, live at **court-ship.com**) is a mobile-first PWA for finding tennis
partners: post a game, get it filled, rescue a cancelled match ("SOS"), swipe on players (Court Crush),
buddies, events, kudos/leaderboards. In open beta with a real community (Uppsala + Stockholm, ~80-person
WhatsApp group; Miami seeded as a data-driven city).

**Owner: Oxy (Oksana).** She is the product owner and operator, not an engineer.

- **Speak Ukrainian with her.** Code, comments and commit messages stay in English.
- **Her entire toolchain is: Lovable chat + this terminal.** No Supabase dashboard, no cloud consoles.
  Never propose a step she cannot physically execute — mentally dry-run every instruction first.
- Explain in product terms, not implementation terms.

Project documents (audits, roadmaps, SQL batches, legal docs, content plans) live **one level up** from
this repo, in the connected project folder. Read them when you need history.

---

## 2. Stack

TanStack Start (React 19 + Vite 7 + TypeScript) · TanStack Router (file-based) + TanStack Query ·
Tailwind v4 + shadcn/Radix · Supabase via **Lovable Cloud** (Postgres + RLS + SECURITY DEFINER RPCs) ·
Deno edge functions · Web Push (VAPID) · vitest.

Hosting and deploys are **Lovable's**. Oxy presses **Publish** there; there is no separate CI/CD deploy.

---

## 3. Commands

```bash
npm run verify   # THE GATE: tsc --noEmit + eslint react-hooks/rules-of-hooks + vitest. Must be green.
npm test         # vitest only
npm run dev      # local dev server
npm run build    # vite build — also regenerates src/routeTree.gen.ts
```

`npm run verify` is what CI runs (`.github/workflows/ci.yml`) and what gates every commit here.
**Never commit or advise a deploy on red.**

**Install trap:** Lovable uses bun (`bun.lock`). A bad transitive `@typescript-eslint/scope-manager`
has broken plain `npm install` before. If it breaks: `npm install --ignore-scripts`, or temporarily strip
eslint/prettier/typescript-eslint/globals/@eslint/js from devDependencies, install, verify, then
`git checkout package.json` before committing. Never commit that stripped package.json.

---

## 4. Git — main moves under you

**Lovable commits to `main` on its own** (every time Oxy pastes SQL or edits in Lovable, it auto-commits).

- **Always `git fetch` + `git pull --rebase` immediately before pushing.** Not at the start of the session — right before the push.
- Small, reviewable commits with descriptive messages (see history for the house style: what changed and *why*, in one line).
- **New or renamed routes:** run `npm run build` to regenerate `src/routeTree.gen.ts` and commit it. Forgetting this ships a broken router.
- Don't hand-edit `src/routeTree.gen.ts`.
- Read the log before advising anything — main may have moved since the last session.

---

## 5. Database — the part that bites

### Migrations do NOT auto-apply
Lovable does **not** run migrations committed via git. A file in `supabase/migrations/` changes nothing in production.

Every schema change must ALSO be delivered as a consolidated, **idempotent** `APPLY_<name>.sql` in the
project folder (one level up), which Oxy pastes into Lovable chat: *"Run this SQL on my Supabase database."*

- End every batch with a **VERIFY block** — a `SELECT` returning all-true booleans. The sandbox has no
  network to prod, so that output is the only ground truth that it landed.
- **Deploy order when code + SQL both change: SQL FIRST, then Publish.** New client + old schema = broken users.

### Never put secrets in pasted SQL
Pasted SQL is **auto-committed to this PUBLIC repo** as a migration. Generate secrets *in* the database
(`gen_random_bytes` → `public.internal_config`, RLS deny-all) and reveal them with a final `SELECT`
(query output is not committed); Oxy copies the value into Lovable → Cloud → Secrets.
Also: Lovable's SQL runner **blocks reading `vault.decrypted_secrets`** — never design a flow that
requires reading a secret back.

### HARD RULE — `sos_requests` is RPC-only
Migration `20260619143841` dropped the UPDATE policy and revoked UPDATE from `authenticated`.
The client may **INSERT and SELECT** only. Every mutation goes through a SECURITY DEFINER RPC:
`edit_sos`, `cancel_game`, `flare_my_game`, `widen_my_game`, claim/apply/pick, `confirm_game`, `log_game`…

The few `.from("sos_requests").update(...)` calls still in the code are **legacy pre-SQL fallbacks**,
guarded by `/does not exist|schema cache|PGRST202/` after the RPC fails. Do not add new ones.
A silent broken flare already shipped this way once.

### Resilient-call pattern
Because code can deploy before SQL, client calls retry gracefully: call the RPC with the new argument,
and on a `does not exist / schema cache` error retry without it — then **tell the user** what was dropped
(e.g. `sos.window_not_saved`). Keep this pattern when adding columns or RPC arguments.

### Edge functions
`supabase/functions/`: `sos-notify`, `notify-users`, `email-notify`, `email-broadcast`.
Lovable deploys them on Publish. They are triggered by **client invoke** (`supabase.functions.invoke`),
not DB webhooks — deliberately, because there is no dashboard access. Service worker and push work in
**production only** (preview unregisters the SW).

---

## 6. Routing

File-based TanStack Router. `src/routes/README.md` has the full table. Two hard-won rules:

- **Any `foo.tsx` that has dot-nested children (`foo.$id.tsx`) MUST render `<Outlet/>`.** Otherwise the
  child renders nothing — this made every player profile unreachable in production (`players.tsx`).
  The fix pattern: parent becomes a layout with `<Outlet/>`, the list moves to `foo.index.tsx`.
- No `src/pages/`, no Next.js/Remix layout conventions. The only root layout is `__root.tsx`.

---

## 7. i18n — enforced by a test

`src/lib/i18n.tsx` holds two flat dictionaries, `en` and `sv`. Every literal key passed to `t()` anywhere
in `src/` must exist in **both**, and the two key sets must be identical. `src/lib/i18n.keys.test.ts`
fails the build otherwise. Users have seen raw keys on screen before — that's why the guard exists.
Run `npm run verify` after any string change.

---

## 8. UI/UX laws (Oxy's, corrected more than once — treat as non-negotiable)

- **One primary action per screen. 1–2 accents maximum.** The accent styles (`cbtn-coral` / `cbtn-green`)
  are reserved for THE primary action. Everything else is quiet.
- **Two-click rule: nothing sits deeper than the second click.** Row visible → tap 1 expands in place → tap 2 acts.
- **Every setting gets its own visible row** with label + current value, scannable without opening anything.
  Never dump heterogeneous settings into one anonymous "Details" container — that's hiding, not prioritizing.
- **Don't spend user attention on decisions automation already makes.** State the consequence next to the
  CTA instead of asking permission (e.g. a game starting within 6h goes out as SOS automatically — no checkbox).
- **Destructive or rare actions get no accent** — muted text link or low opacity. Never coral.
- **Never phrase artificial limits.** Copy says "no limit", not "up to N".
- **Feature flags** (`src/lib/flags.ts`) keep unlaunched features off the UI instead of cluttering it.
- Design discipline is applied **as each screen is built**, never deferred to a "polish pass" — deferring causes rework.

---

## 9. Definition of done

Oxy's bar, stated explicitly: **zero bugs, zero dead-end or broken user flows, zero design and usability errors.**

A fix cycle is done when the fixes are in **and a full regression re-test has passed** — not when the code
is pushed. Re-test the whole app, not just the screens you touched. She expects team-style work:
plan → design argued → implement → check against the design laws → adversarially verify.

---

## 10. Legal and privacy constraints

The app is EU-regulated and Oxy is the data controller as a private person. This is the project's biggest risk surface.

- App is **18+** (attestation checkbox, **no date of birth collected** — data minimization).
- `/privacy` and `/terms` are **v1.0, EN canonical**, mirrored as markdown in the project folder.
  On any **material** change to those documents, bump `TERMS_VERSION` in `src/lib/legal.ts` — that forces
  every user to re-confirm via `ConsentGate`. A contact-address swap is not material.
- Contact email everywhere: **oksana.chopak@gmail.com**.
- **Never add third-party scripts, fonts, analytics or CDNs** without consent screening. Fonts are
  self-hosted on purpose.
- Any new feature touching personal data → check it against the `/privacy` text and update both the page
  and the markdown mirror.
- `profiles.public_preview` (default true) gates what logged-out visitors see via `public_players` /
  `public_board` / `top_*`. Any view rewrite must preserve that filter **and** re-grant the functions —
  a Lovable-generated migration silently emptied the leaderboards by forgetting the grants.
- **DPIA required before geo/radius matching (Iteration 2). AI Act art. 50 applies before any AI feature.**

---

## 11. Secrets

`.env` contains **public** values only (Supabase URL + anon/publishable key, `VITE_VAPID_PUBLIC_KEY`).
Server-side secrets (VAPID private key, notify secret, Resend keys) live in **Lovable → Cloud → Secrets**
and are injected into edge functions. Never commit a private key, service-role key or token — this repo is public.

---

## 12. Map of the code

```
src/routes/                 file-based routes; _authenticated/ = signed-in shell
src/components/             app components (GameWizard, AttentionStrip, ProfileWizard, PushControls…)
src/components/ui/          shadcn primitives
src/lib/                    domain logic: sos, games, buddies, events, cities, areas, push, share,
                            i18n, flags, legal, guest, draftGame, whatsapp, calendar
src/integrations/supabase/  generated client + types (do not hand-edit types.ts)
supabase/migrations/        history only — see §5, they do not auto-apply
supabase/functions/         Deno edge functions
scripts/verify.sh           the gate
```

---

## 13. Current state and open items

- **Shipped and live:** SOS + game planning, buddies, events + approval, kudos/leaderboards, WhatsApp
  handoff, Google Calendar, Lucky Serve, Court Crush swipe deck (scored matching), data-driven cities and
  districts, open signup with optional invite codes, the full legal/GDPR pack, web push for SOS.
- **Next (roadmap):** Iteration 2 geo/radius (PostGIS + DPIA first) · Iteration 4 retention (Ghost Meter v2,
  honest leaderboards, Wrapped) · freemium monetization decided but unbuilt · padel as a data dimension, later.
- **Known nits still owed:** native `<input type=time>` on the board card looks janky — replace with slot
  chips; `admin_dashboard` still hardcodes `ARRAY['Uppsala','Stockholm']` for by-city stats;
  `log_game` auto-confirms the opponent, so the pending-confirm flow is dead code pending a product decision.
- `my_invite_uses` is not in migrations (Lovable may have added it directly) — don't rely on it.

---

## 14. Before you finish a turn

1. `npm run verify` green.
2. If the change touches routes → `routeTree.gen.ts` regenerated and committed.
3. If the change touches schema → an idempotent `APPLY_*.sql` with a VERIFY block exists in the project
   folder, and you told Oxy the deploy order (SQL first, then Publish).
4. If the change touches strings → both dictionaries updated.
5. If the change touches a screen → count the accents (1) and the clicks to every action (≤2).
6. `git fetch && git pull --rebase` before pushing.
7. Tell Oxy — in Ukrainian — what she needs to do, in steps she can actually perform.
