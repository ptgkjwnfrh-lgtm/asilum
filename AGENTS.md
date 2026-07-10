# ASILUM — instructions for coding agents

You are working on ASILUM, a fashion marketplace/search platform with a
learning recommendation brain. **Before doing anything, read
`CONSTITUTION.md`** — it is binding. `docs/PRODUCTION.md` maps the production
system (database, source adapters, search engine, tickets).

## Hard rules (from the constitution)

- **The UI is LOCKED.** Never redesign, simplify, or genericize any page.
  The magazine look (Grailed-white, Helvetica black, red #e5342b stars,
  hairlines, masonry) stays. Touch UI code only to connect functionality or
  fix errors, reusing existing CSS classes.
- **Never commit or push to `main` directly.** Branch per change-set; PRs
  get reviewed before merge. PRs may stack — check the PR body for a base
  that must merge first.
- **No fake integrations.** No pretend partnerships (SSENSE/Grailed/Depop/
  Farfetch…), no fake OAuth, no simulated data presented as real, no
  scraping (lib/ingest/sources.js blocklists those hosts). Features without
  real access are disabled and say so (`soon` class, disabledAdapter()).
- **No fake AI.** Placeholders return through lib/ai/contract.js
  (notImplemented/mockMarked/real). No paid AI API calls.
- **Secrets via env vars only** (`.env.example` is the catalog). Never
  hardcode keys, never expose server keys client-side, never store card
  data or external-site passwords.
- `npm run build` must pass before any PR. Every page must load with no
  runtime errors on an empty database and with no env vars set.

## Architecture pointers

- Persistence: lib/db/index.js (brain tables, auto-created) +
  lib/db/production.js (production tables) — Postgres via DATABASE_URL
  (Supabase), in-memory fallback otherwise. Schema files in supabase/
  (schema.sql, schema-v2.sql applied; schema-alpha.sql STAGED, not applied).
- products = items, mood_boards = boards, mood_board_items = board_items,
  saved_products = saved_items.
- Recommendation brain: lib/brain/ (the "Alpha Learning Bridge" — extend,
  never replace). Search engine: lib/search/. Source adapters:
  lib/ingest/adapters/. Purchase tickets: consent-gated, ASILUM never
  fulfills orders.
- lib/brain/memory.js and other client-imported modules must NOT import
  brain/index.js or the catalog lands in the client bundle.

## Review focus

When reviewing PRs, prioritize: correctness of ranking/status-transition
logic, RLS/auth boundaries, honest failure modes (nothing crashing without
keys/db), constitution compliance (especially UI preservation and no-faking),
and duplicate/parallel implementations that should reuse existing modules.
