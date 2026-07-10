# ASILUM production foundation

How the real system fits together (July 10, 2026). Governed by CONSTITUTION.md:
UI locked, no fake integrations, no scraping, env-vars only.

## Database

Supabase Postgres via `DATABASE_URL` (session pooler URI — the direct host is
IPv6-only). `lib/db/index.js` auto-creates the brain tables and falls back to
an in-memory store when no database is configured, so a keyless dev run never
crashes. `lib/db/production.js` holds CRUD for the production tables.

Schema files (idempotent, apply with `node --experimental-default-type=module
scripts/apply-schema.mjs <file>`):

- `supabase/schema.sql` — MVP: user_profiles, designers, saved_items
  (= saved_products), articles, product_sources + RLS.
- `supabase/schema-v2.sql` — production: extends **items (= products)** with
  source/availability/moderation fields, adds product_images, product_tags,
  search_mappings, search_logs, source_connections, source_sync_logs,
  product_availability_checks, stylist_outfits, purchase_tickets,
  editorial_posts, mood_board_uploads.
- `supabase/schema-alpha.sql` — staged, NOT applied.

Constitution table mapping: products = items, mood_boards = boards,
mood_board_items = board_items, saved_products = saved_items.

Seeding: `scripts/seed-supabase.mjs` (catalog → items),
`scripts/seed-mappings.mjs` (search mappings + product_tags backfill).

## Products & fetching

Every read path (`/api/feed|discover|search|related|outfits|orders`) pulls
`listItems(1000)` from the database first; `lib/ingest/catalog.json` (915
synthetic pieces, source_name `seed`) only backfills ids the database lacks —
emergency development fallback, not the system.

## Source adapters (`lib/ingest/adapters/`)

Common interface (`types.js`): `getSourceName, enabled, searchProducts,
fetchProductById, checkAvailability, normalizeSourceProduct, syncProducts`.

- **ebay** — LIVE implementation (official Browse API) once
  `EBAY_CLIENT_ID/SECRET` are set (`EBAY_ENV=PRODUCTION` for real listings).
- **depop, grailed, ssense, therealreal, shopify** — honest disabled
  placeholders. Each `enabled()` reports exactly which key/partnership it
  needs (also in `.env.example`). They return empty results, never scrape
  (`lib/ingest/sources.js` additionally blocklists those hosts), never fake.

`normalize.js` converts any raw source product into the ASILUM shape and
derives typed tags; `sync.js` runs enabled adapters → upserts items → writes
product_images + product_tags → logs to source_sync_logs. Trigger via
`/api/admin` `sync.run` (no cron yet — see lib/background-jobs stubs).

Availability: `checkAvailability` per adapter; results land in
product_availability_checks and reflect onto `items.availability_status` /
`is_available` (vocabulary: available, sold, removed, price_changed,
source_unavailable, unknown). Sold/removed items sink in search and are
excluded from stylist looks.

## Search engine v1 (`lib/search/`)

Flow: query → `interpretSearchQuery` (intent: brand / "like designer" /
text + mapping expansion) → `rankSearchResults` → `logSearch`.

Ranking order of force: exact product name > full title > brand/designer >
garment-category alignment (a "jeans" query surfaces bottoms — this is what
keeps "bootcut" specific instead of every flare) > product_tags layer >
aesthetic vector > related terms > era > availability penalty > Mood Board
Brain nudge (only when the toggle is on) > AI confidence placeholder (0).
Each result carries `confidenceScore`, `matchReason`, `matchedTags`.

Search mappings: `search_mappings` table, curated seed in
`lib/search/mappings-seed.js` (also the no-database fallback). Admin can
add/edit via `/api/admin`. Searches log to `search_logs` (user, query,
interpreted tags, result count) — ASILUM gets smarter through behavior.

Autocomplete: `/api/suggest` (3–10 suggestions, prefix + levenshtein fuzzy,
"like <designer>" companions) rendered in the shell search panel and the
Discover search box.

## Mood Board → personalization

Every training action writes a real `mood_board_uploads` record: image uploads
are honestly `analyzed_by: "filename"` (no vision model exists yet — the
record structure is ready for one), train-text is `analyzed_by: "manual"`.
The brain profile it feeds flows into feed ranking (as before) and now into
search ranking via the **Use Mood Board Brain** toggle on /board
(localStorage `asilum-brain-off`; callers send `&brain=1|0`). Off = general
results, on = slight personalization. Saved products (favorites/boards/bag)
already train the same profile via /api/interaction.

## Stylist

`/api/outfits` builds looks from the database pool (tag/color/silhouette/fit
logic in lib/brain/stylist.js — no AI), skips unavailable products, and now
persists SAVE OUTFIT looks to `stylist_outfits` (items, genre, match score).

## Editorial

`editorial_posts` (user/asilum/article kinds, tags + designer/product refs,
moderation fields) via `/api/editorial`. The home composer posts to it
alongside the localStorage social layer. Articles remain original summaries +
external links only (copyright rule).

## Purchase tickets (third-party purchase assistant)

ASILUM does NOT fulfill: the original marketplace confirms, ships, tracks,
and handles returns. Flow: BUY → POST `/api/tickets` (creates
`purchase_tickets` row, checks availability through the source adapter) →
disclaimer popup (exact wording in `lib/tickets.js`, version-stamped) →
REQUIRED consent checkbox → PATCH consent → `checkout_started` and the source
site opens for the user to complete checkout. Statuses: requested →
checking_availability → available/unavailable → awaiting_user_consent →
awaiting_payment_or_checkout → checkout_started → checkout_completed_on_source
/ canceled / failed / completed. No card data, no external-site passwords,
no automated checkout beyond the handoff. Tickets render on /orders.

## Admin (`/api/admin`)

Bearer `ADMIN_TOKEN` (16+ chars; unset = 503 disabled). Read areas: overview
counts, tags, mappings, sync-logs, search-logs, tickets, adapters. Write
actions: tag.add/delete/merge, mapping.upsert/delete, product.moderate
(visible/hidden/flagged), sync.run. Public UI intentionally not built — the
locked design stays untouched; an admin page can mount on these later.

## AI readiness

No paid AI calls anywhere. Seams (all default to local logic, all honest via
lib/ai/contract.js): `lib/ai/search-adapter.js` (`AI_SEARCH_ENABLED`),
`lib/vision` (moodboard image analysis contract), `lib/embeddings` (v0 tag
cosine live, v1 gated), `lib/recommendations`. A future model reads:
product_tags, search_mappings, mood_board_uploads, search_logs,
stylist_outfits, user_events — all persisted now.

## Production-ready today vs waiting on access

READY: Postgres persistence, 915-product seed inventory (clearly labeled),
search + mappings + suggestions + logs, ticket flow + disclaimer, moodboard
records + brain toggle, stylist persistence, editorial posts, admin API,
adapter framework with availability checking.

WAITING ON OFFICIAL ACCESS: eBay keys (adapter ready), Depop/Grailed
partnerships, SSENSE/TheRealReal affiliate feeds, per-store Shopify tokens,
any vision/embedding provider, Pinterest OAuth, Stripe (checkout is
out-of-scope by constitution).
