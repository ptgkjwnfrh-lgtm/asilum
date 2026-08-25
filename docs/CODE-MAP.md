# CODE MAP — where everything lives

**Audience: the incoming CTO.** This is the first document to read. It answers
one question — *"I need to change X; which file do I open?"* — and it is
generated from the tree's own file headers rather than written from memory, so
it describes the code that exists rather than the code someone remembers.

Regenerate it with `npm run docs:codemap` after any structural change. A map
that drifts is worse than no map: `docs/ARCHITECTURE-MAP.md` sat claiming
"schema v12" for five weeks while production ran v48, and the first person to
trust it would have been wrong about the entire persistence layer.

---

## The 60-second orientation

ASILUM is a Next.js 14 app (App Router, plain JavaScript — no TypeScript
toolchain) with Postgres via Supabase, and an in-memory fallback so it runs
with no database at all.

Four layers, and almost every change lives in exactly one of them:

| Layer | Directory | What it owns |
| --- | --- | --- |
| **Surface** | `app/` (pages, `app/components/`) | What a person sees. Server components by default; `"use client"` marks the interactive ones. |
| **Request plane** | `app/api/*/route.js` | Every HTTP entry point. Auth, rate limits, and validation happen here — never deeper. |
| **Engine** | `lib/` | All the thinking: ranking, search, tagging, the Asterisk system. Pure modules, unit-testable, no HTTP. |
| **Persistence** | `lib/db/` | The only place SQL is written. Everything above it calls functions, never queries. |

**The rule that keeps this honest:** dependencies point *downward only*.
`lib/` must never import from `app/`. If you find yourself wanting to, the
logic belongs in `lib/` and the route should call it.

### The five things worth understanding before the rest

1. **The six-bridge brain** (`lib/brain/`) ranks the feed: alpha (content
   match), beta (dominant trait), gamma (co-engagement graph), delta
   (popularity), epsilon (exploration), and ad. Start at `lib/brain/index.js`.
2. **ASTERISK** (`lib/asterisk/`) is the reading and memory layer — it is
   deterministic by product law, not an LLM agent. `docs/adr/ADR-007` draws its
   tool boundary.
3. **Identity is two-tier**: an HMAC device cookie (`u-<uuid>`) or a verified
   Supabase session (`sb-<uuid>`). `ADR-002` is binding here and has been
   violated before — read it before touching accounts.
4. **Migrations are append-only and numbered**: `supabase/schema-v<N>-*.sql`,
   applied in order by `scripts/apply-schema.mjs`. Production is at **v48**.
5. **Interactions commit in ONE transaction** — profile, interaction, event,
   edges, and popularity together, or not at all. See `commitInteractionBatch`.

---

## Where to start for a given task

| I want to… | Open |
| --- | --- |
| Change how the feed ranks | `lib/brain/index.js`, then `lib/brain/bridges.js` |
| Change what search understands | `lib/search/index.js`, `lib/search/denseQuery.js` |
| Add or rename a tag facet | `lib/tagging/vocabulary.js` — **the single register**, plus a new migration |
| Change a page's look | `app/<route>/page.js` and `app/globals.css` |
| Add an HTTP endpoint | a new `app/api/<name>/route.js`, calling into `lib/` |
| Touch the database | `lib/db/` **only** — plus a new numbered migration |
| Understand a past decision | `docs/adr/` first, then `docs/OWNER-DECISIONS.md` |
| Know what is deliberately not built | `CONSTITUTION.md` §"Do NOT build yet" |

---

## Reading the tables below

- **Lines** is the file's real length. **⚠️** marks files over 1,200 lines —
  these are the ones a newcomer will struggle with, and they are listed in
  `docs/DEBT-REGISTER.md` with a split plan.
- **What it is** quotes the file's own header comment. Where it says
  *no header*, the file has none — that is a tracked gap, not an omission here.

---

## `lib/` — the engine

All the thinking. Pure modules: no HTTP, no React, unit-testable in isolation.
Nothing here may import from `app/`.


### `lib/`
*22 files, 3,599 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `orders.js` | 481 | The checkout engine (risk campaign §2, phase L2). SERVER-ONLY. |
| `social.js` | 472 | Client-safe social + marketplace scaffolding: source labels, mock users and editorial stories, the community post store (local state until a posts |
| `client.js` | 445 | Browser-side helpers: per-device identity, JSON POST, and deterministic SVG placeholder thumbnails so the moodboard is visual even for items whose |
| `products.js` | 376 | Canonical product resolution. Mutation routes accept only an item id and rebuild the snapshot from server-owned inventory before learning or saving. |
| `dm.js` | 210 | Direct messages — the isomorphic half. No database, no server-only imports, so the shell and the API agree on the vocabulary. |
| `uilab.js` | 201 | DESIGN CONSOLE registry + persistence (client-safe). |
| `analytics.js` | 177 | The /stats dashboards (owner directive, HANDOVER-2026-08-14 backlog 5). SERVER ONLY — reads the database directly. |
| `vault.js` | 155 | The buyer vault (owner ruling 20 Aug 2026): name, address, and saved-card REFERENCES — Stripe customer/payment-method ids plus brand/last4 display |
| `identity.js` | 135 | WHO THE CALLER IS. The root of trust for the whole app. |
| `accounts.js` | 133 | WHAT KIND OF ACCOUNT THIS IS, and — more importantly — the single table that says what each kind can reach. Isomorphic: no database, no imports with a |
| `dm-desk.js` | 129 | The mail desk's decisions, as functions. |
| `hotlist.js` | 126 | The hotlist program's laws in one home (P2–P4, owner build order 20 Aug 2026; ruling record docs/hotlist-program-spec-2026-08-20.md). SERVER-ONLY. |
| `url.js` | 104 | Shared URL guard for anything rendered as a link or persisted from a source. ASILUM never needs executable/data URLs, private-network destinations, or |
| `age.js` | 80 | The age gate. Isomorphic: the signup sheet and the server compute the same answer from the same function, because two implementations of "how old is |
| `nav.js` | 68 | The seven destinations, as DATA. Extracted from the shell so the swap a business sees can be tested without mounting React — a nav rule asserted by |
| `notify.js` | 62 | Operator notification for paid orders (risk campaign F29/F74: an order nobody notices is a customer failed). SERVER-ONLY. |
| `site.js` | 57 | THE canonical origin, in one place. |
| `consent.js` | 54 | D4's law (ruled 20 Aug 2026; spec docs/d4-consent-spec-2026-08-20.md): UNANSWERED = UNOBSERVED. The state rides an HttpOnly cookie the server |
| `supabase.js` | 42 | Supabase auth client factory. The app must run fully without Supabase (constitution: nothing fake, no crashes on missing keys), so: |
| `purchasable.js` | 35 | THE checkout honesty gate, extracted to a pure, dependency-light module so lib/products.js can stamp the public |
| `business.js` | 32 | the business-account law (owner order, Aug 13), client-safe: shared validation for the passport → business upgrade. |
| `tickets.js` | 25 | Shared purchase-ticket constants (client-safe — no db imports). ASILUM is a third-party purchase ASSISTANT: it never fulfills, ships, |

### `lib/ai/`
*13 files, 1,640 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `trendKnowledge.js` | 266 | Dated fashion-context snapshot for the stylist. Trend knowledge is an exploration signal, never a rewrite of a user's taste profile. Every entry |
| `stylistReasoningEngine.js` | 244 | Stylist intelligence service — separated from the UI entirely. Today: REAL tag-based logic reusing the live outfit engine (lib/brain/ |
| `validate.js` | 205 | Model output is UNTRUSTED input — same posture as client payloads. Validators check shape, normalize and dedupe tags, strip anything the |
| `promptVersions.js` | 172 | Versioned prompt templates for the future mini-GPT. NO model is called today — these exist so the day a provider is wired, prompts are already |
| `adapter.js` | 158 | THE seam where a real model plugs in. Server-only (logs to the database). |
| `styleProfile.js` | 146 | User style profile: the distilled taste document that Mood Board Brain, Search, Discover, and the Stylist all read. Rebuilt from REAL signals: |
| `moodBoardAnalyzer.js` | 128 | Mood Board intelligence service. Server-only. Route: model if enabled (through the adapter) → local rules otherwise. |
| `search-adapter.js` | 75 | the AI seam for search. |
| `localFashionInterpreter.js` | 74 | The REAL rule-based fallback that runs while no model is connected. Interprets a mood-board item from what we can actually read today: |
| `index.js` | 61 | ASILUM ALPHA LEARNING BRAIN — facade and status map. |
| `config.js` | 56 | AI feature gating. DISABLED BY DEFAULT — the app must run fully, and honestly, with none of these set. Server-only values (AI_API_KEY) are read |
| `types.js` | 30 | Shared JSDoc typedefs for the AI foundation (this project is plain JS — these are the "TypeScript types" of the house style, enforced at runtime |
| `contract.js` | 25 | Shared helpers that keep the Alpha Brain foundation HONEST. Every placeholder in lib/* returns through one of these, so nothing can |

### `lib/asterisk/`
*17 files, 2,370 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `orchestrator.js` | 392 | Asterisk AI — universal interpretation orchestrator (handoff Feature A, Phase 1). Deterministic, layered, and honest: |
| `explain.js` | 221 | Asterisk AI — the explanation system. Every recommendation can answer "why am I seeing this?" with reasons built ONLY from real, named signals: |
| `research.js` | 207 | Asterisk AI — research-ingestion pipeline (docs/ASTERISK-AI.md §9, P2 v1). The controlled path from web research to culture records — and the only |
| `houses.js` | 193 | where the houses are from. |
| `tagAudit.js` | 167 | Asterisk AI — the secondary audit of every tagged product. Dual tagging: Base Tags (items fields + product_tags: retailer/seller/admin) |
| `confidence.js` | 145 | Asterisk AI — separated, honest confidence (handoff Feature A rules). Four independent values, NEVER averaged into one impressive number: |
| `culture.js` | 142 | Asterisk AI — curated cultural knowledge v1 (films, music, cities, decades). These are EDITORIAL STYLE READINGS, not factual claims: no designer credits, |
| `memory.js` | 140 | the Asterisk memory READ FACADE (ADR-001, v2). One versioned contract that Home, Discover, Stylist, Moodboard, Profile, |
| `cultureSchema.js` | 138 | One schema boundary for both staged proposals and checked-in research. Keeping normalization here prevents the database gate and module loader |
| `unknownQueries.js` | 104 | Asterisk AI — unknown-query aggregation (handoff Feature A, Phase 1). An unresolved or research-flagged query becomes a normalized, demand- |
| `ontology.js` | 100 | Asterisk AI — canonical fashion ontology v1 (the shared fashion language). Every tag has ONE defined meaning: a canonical id ("<type>.<slug>"), a |
| `facts.js` | 98 | Asterisk AI — learned-fact pipeline. External research / model output lands here as STAGED claims with sources and scores; it NEVER writes directly to |
| `trends.js` | 91 | Asterisk AI — trend lifecycle intelligence (docs/ASTERISK-AI.md §4, P4 v1). THE single source of truth for trend claims, reconciling the two layers |
| `margin.js` | 70 | THE MARGIN ASTERISK IS ALLOWED TO ASSUME WITHIN. |
| `queryRouter.js` | 61 | Asterisk AI — query classification + entity resolution v1. A search box entry may be a brand, a garment, an aesthetic, a film, a |
| `interpretationSchema.js` | 60 | Asterisk AI — the versioned interpretation contract (handoff Feature A). One shape every consumer (search, drawer, rails, eval harness) can pin. |
| `correctionSignals.js` | 41 | Shared correction semantics for every recommendation surface. Persistence aggregates explicit feedback; consumers apply the same weights |

### `lib/asterisk/culture/`
*6 files, 1,842 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `catalog-expansion.js` | 677 | PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles every part IN ORDER and is the only module anything else imports. |
| `catalog-hiphop.js` | 377 | PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles every part IN ORDER and is the only module anything else imports. |
| `catalog-aesthetics.js` | 300 | PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles every part IN ORDER and is the only module anything else imports. |
| `catalog-figures.js` | 248 | PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles every part IN ORDER and is the only module anything else imports. |
| `catalog-core.js` | 206 | PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles every part IN ORDER and is the only module anything else imports. |
| `provenance.js` | 34 | WHERE A READING CAME FROM. |

### `lib/background-jobs/`
*1 file, 33 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 33 | Learning-job registry. There is NO job runner in this stack yet (no queue, no cron) — so these are contracts only, and every run() says so honestly. |

### `lib/brain/`
*17 files, 4,190 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 666 | The orchestrator. Ties tags + lexicon + knowledge base + bridges into a single "brain" that can resolve any token (word, designer, era, mood, or |
| `replay.js` | 504 | offline replay harness (r15, bot world r22). |
| `kb.js` | 484 | ASiLUM brain — KNOWLEDGE BASE: the 'zenith of fashion knowledge' layer. Maps designers, genres/aesthetics, eras — and (asterisk-boost r1) style |
| `bridges.js` | 480 | ASiLUM brain — THE SIX BRIDGES. Each bridge scores a catalog item for a user from a different angle, then |
| `lexicon.js` | 368 | ASiLUM brain — LEXICON: maps non-clothing signals to aesthetic tag vectors. This is what lets the moodboard 'think' — turning a color, a music genre, a |
| `sizing.js` | 309 | Asilum "size brain" — a normalization layer that maps any labeled size (mens / womens / luxury numeric) onto a common "fits like US __" scale, |
| `popularity.js` | 276 | the popularity bridge's counters (Aug 6, 2026). |
| `stylist.js` | 176 | THE STYLIST — a branch of the brain that assembles full outfits. Consumes the same flat tag vectors as every bridge, plus category, era and |
| `noise.js` | 173 | noise-floor estimators for the measurement batteries (r26, audit #26). |
| `tuning.js` | 153 | bounded bridge self-tuning (r16). |
| `measurements.js` | 145 | a person's body, in four shapes. |
| `distribution.js` | 103 | distributional-health metrics (r23, audit #12). |
| `memory.js` | 93 | FORGETTING, made visible. learn() applies per-interaction decay — but a profile untouched for a week should fade on the clock, not only when the |
| `edges.js` | 84 | co-engagement graph corroboration (Aug 6, 2026). |
| `tags.js` | 66 | ASiLUM brain — canonical aesthetic tags + affinity matrix. The 10 fixed tags every product and every user vector is expressed in. |
| `taste-class.js` | 58 | ASTERISK's one-word read of a taste profile. Client-safe, imports nothing. Each class scores the bearer's REAL |
| `attribution.js` | 52 | examined-impression attribution (r19). |

### `lib/brands/`
*3 files, 323 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `cases.js` | 134 | brand verification & impersonation cases (Feature G groundwork). The Shopify/OAuth half of Feature G is externally gated; this |
| `shopify.js` | 104 | Consented Shopify import for a VERIFIED business (owner directive, 18 Aug): the designer gave us their myshopify domain in their own |
| `verify.js` | 85 | Domain-control proof for business verification (Feature G's missing evidence collector). SERVER-ONLY. |

### `lib/connectors/`
*1 file, 48 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 48 | External account connector registry. RULES (constitution + user spec): opt-in and permission-based only, real OAuth only, env vars only, no |

### `lib/craving/`
*1 file, 79 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 79 | Transient craving context. This is deliberately separate from the durable taste profile: what someone needs tonight should steer this feed without |

### `lib/db/`
*9 files, 8,644 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `production.js` | 4461 ⚠️ | CRUD for the production-foundation tables (supabase/schema-v2.sql): product_tags, product_images, search_mappings, search_logs, purchase_tickets, |
| `dm.js` | 1747 ⚠️ | The mail desk's store (schema v40). SERVER-ONLY. |
| `index.js` | 1724 ⚠️ | Persistence layer. Uses Postgres (Neon/Supabase) when DATABASE_URL is set, otherwise falls back to an in-memory store so the app runs locally and in |
| `orders.js` | 270 | Order persistence: `order_events` is the append-only truth, `orders` the projection (schema-v31). SERVER-ONLY. Both stores enforce the same laws: |
| `accountKinds.js` | 171 | account_kinds + account_kind_events (schema v37). SERVER-ONLY. |
| `accountAges.js` | 77 | account_ages (schema v39). SERVER-ONLY. |
| `imageFingerprints.js` | 75 | Storage + collision scan for image fingerprints (schema-v33). SERVER-ONLY. The scan reads all rows (capped) and compares in JS — hamming distance has |
| `types.js` | 69 | Entity typedefs for the Alpha Learning Brain (JSDoc — this project is plain JS; no TS toolchain added). The LIVE store is lib/db/index.js |
| `booths.js` | 50 | booth_visits — THE separate attribution channel (owner's words, §6/P2): a reader reached a booth via THE WIRE's hotlist. Append-only; the 15% |

### `lib/discover/`
*3 files, 258 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `rails.js` | 174 | cultural Discover rails (handoff Feature D). The registry (discover_rails, v16) says WHICH rails exist and in what |
| `tagRank.js` | 58 | Affinity-aware ranking for Asterisk interpretation tags (?tags=a\|b\|c). |
| `recency.js` | 26 | "newest" means creation time (release blocker 0A-1). publicProduct keeps timestamps server-side by design, so discovery surfaces |

### `lib/embeddings/`
*2 files, 208 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 137 | Vector contracts for the Alpha Learning Brain. |
| `provider.js` | 71 | the v1 provider adapter (asterisk-boost r4). Plain fetch against an embeddings REST API; NO new runtime dependencies |

### `lib/events/`
*1 file, 107 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 107 | Canonical user-event vocabulary for the Alpha Learning Brain. Pure module (no I/O) — safe to import from client or server. |

### `lib/fashion-taxonomy/`
*1 file, 42 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 42 | The shared fashion vocabulary for the Alpha Learning Brain. AESTHETIC_TAGS re-exports the LIVE tag space the Alpha Learning Bridge |

### `lib/feed/`
*1 file, 40 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 40 | Feed system foundation. The LIVE product feed is /api/feed (Alpha Learning Bridge): zoned core/discovery/reach, seen-item rotation, 2-per-brand cap, |

### `lib/images/`
*1 file, 85 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `fingerprint.js` | 85 | Deterministic perceptual image fingerprints (dHash) for stolen-image screening — gap 3 of the anti-impersonation directive (18 Aug). |

### `lib/ingest/`
*6 files, 564 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `ebay.js` | 170 | eBay source adapter — the OFFICIAL Browse API path (never scraping). Server-side only: reads EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_ENV from |
| `colorEvidence.js` | 163 | Conservative product-color verification. A color becomes a product tag only when the merchant explicitly states it and the actual listing images |
| `sources.js` | 93 | Ingestion adapters. IMPORTANT POLICY: this layer only pulls from sources that PERMIT programmatic access. It never scrapes hotlink-protected or |
| `intake.js` | 71 | Validation for OPERATOR-SUPPLIED real inventory (risk campaign phase L1). The checkout engine's own honesty gate (refusalReason) is the validator — |
| `catalog.js` | 49 | Asilum seed catalog — 915 listings, stored as JSON (catalog.json) so the server parses data instead of executing a half-megabyte JS literal. |
| `inferTags.js` | 18 | ONE text-to-taste bridge for every ingestion path. |

### `lib/ingest/adapters/`
*6 files, 596 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `normalize.js` | 196 | The single normalizer every adapter funnels through: raw source data in, ASILUM NormalizedProduct out. After this point the app does not care |
| `woocommerceAdapter.js` | 134 | WooCommerce Store API adapter. The Store API is officially documented and unauthenticated, but ASILUM still requires explicit merchant approval before |
| `ebayAdapter.js` | 103 | The one adapter with a real implementation today: eBay's OFFICIAL Browse API (lib/ingest/ebay.js). Enabled only when EBAY_CLIENT_ID/SECRET are set. |
| `types.js` | 69 | Source adapter contract (JSDoc — this codebase is plain JS; lib/db/types.js set the precedent). Every marketplace adapter implements the same interface |
| `sync.js` | 59 | syncProducts(): run every ENABLED adapter, normalize, upsert into the products table (items), write product_images + typed product_tags, and log |
| `index.js` | 35 | The adapter registry. One import site for every marketplace source. |

### `lib/mock-data/`
*1 file, 16 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 16 | Single index of EVERY mock in the app, so demo data can never masquerade as real (constitution). This module points at existing mocks rather than |

### `lib/music-mapping/`
*1 file, 77 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 77 | Music-to-Fashion Brain: music taste as an aesthetic signal. The mapping table below is CURATED MOCK DATA (marked as such in every |

### `lib/payments/`
*1 file, 201 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `stripe.js` | 201 | Thin Stripe REST client: fetch + form encoding + node crypto, no SDK (stack law: no new runtime dependencies). SERVER-ONLY — never import from client |

### `lib/profile/`
*2 files, 261 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `rooms.js` | 239 | MySpace-inspired profile rooms (handoff Feature E). A room is a signed-in user's OWN corner of the magazine: a claimed handle, |
| `handles.js` | 22 | The handle vocabulary — pure constants, no imports, no db, no window. |

### `lib/recommendations/`
*1 file, 63 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 63 | Recommendation service facade — ONE place that names every recommender the Alpha Learning Brain will offer, delegating to live Alpha Learning Bridge |

### `lib/search/`
*17 files, 4,168 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 1932 ⚠️ | ASILUM Search Engine v1 — real, database-backed, tag-expanded, ranked. SERVER-ONLY (imports lib/db). Rule/tag-based logic decides every rack. A |
| `era.js` | 365 | era comprehension for the search engine (Aug 21). |
| `negation.js` | 218 | the engine stops serving the thing you excluded. |
| `denseQuery.js` | 193 | Dense-layer query understanding for the search engine (Day 26). |
| `size.js` | 184 | the size the reader asked for (Aug 21). |
| `mappings-seed.js` | 171 | Curated search mappings — the cultural lexicon that turns human phrases into tags and related terms. Seeded into the search_mappings table (idempotent |
| `typo.js` | 168 | literal-engine typo bridge (r12). |
| `designers.js` | 153 | the people, not just the houses (Aug 21). |
| `origin.js` | 135 | origin comprehension for the search engine (Aug 21). |
| `suggest.js` | 135 | Autocomplete + misspelling correction. Basic fuzzy matching on purpose (constitution: don't overcomplicate; no AI here). SERVER-ONLY via the pool. |
| `eraAnchors.js` | 100 | era-anchor extraction for cultural reads (Aug 5). |
| `wordScope.js` | 96 | "the word is here, just not there" (Aug 21). |
| `passportAssumption.js` | 89 | the influenced-assumption clause (r10). |
| `superlative.js` | 87 | "cheapest" is a sort, not a word (Aug 22). |
| `vocab.js` | 53 | stem-indexed token lookup (r11). |
| `ontology.js` | 49 | Fashionpedia-informed garment vocabulary (r13). |
| `text.js` | 40 | the one place text is folded for matching. |

### `lib/security/`
*5 files, 639 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `request.js` | 166 | WHO IS ASKING, and how much they may ask for. |
| `rateLimit.js` | 164 | Fixed-window quotas backed by Postgres, with a bounded in-memory fallback for keyless development. Subjects are hashed so the quota table stores no user id. |
| `json.js` | 140 | READING A REQUEST BODY FROM A BROWSER, safely. |
| `http.js` | 97 | READING A RESPONSE FROM SOMEWHERE ELSE, safely. |
| `multipart.js` | 72 | Bounded multipart reader for upload routes. Request.formData() buffers the entire body, so consume the stream under an explicit cap before parsing. |

### `lib/steward/`
*2 files, 494 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `checks.js` | 404 | what the Asterisk watches when nobody is looking. |
| `index.js` | 90 | the Asterisk steward: one pass over the live machine. |

### `lib/tagging/`
*1 file, 170 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `dense.js` | 170 | Dense per-piece tagging — 20-30 typed tags per item, every one derived from a REAL product field. Nothing here invents attributes: a material tag exists |

### `lib/taste-graph/`
*1 file, 141 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 141 | TikTok-inspired layer: cross-user feed intelligence. Learn not only from one user's actions but from what SIMILAR users save, buy, skip, favorite, |

### `lib/vision/`
*3 files, 641 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `palette.js` | 277 | Palette v0 — the moodboard's first REAL sight. Pure color statistics over image pixels: dominant swatches, brightness/saturation, and a curated |
| `embed.js` | 273 | IMAGE EMBEDDING v0 (r27). The first thing in this system that turns pixels into a VECTOR rather than into words. |
| `index.js` | 91 | Image understanding contracts: Mood Board Intelligence + Fit Pic Analyzer. LIVE today: palette v0 (./palette.js) — real color statistics from pixels, |

### `lib/visual-personalization/`
*1 file, 50 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `index.js` | 50 | Pinterest-inspired layer: taste as a VISUAL WORLD, learned from what users save, organize, and return to — boards first, clicks second. |

### `lib/wardrobe/`
*4 files, 424 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `photos.js` | 238 | private Storage for wardrobe photos (Phase 3b). SERVER-ONLY. Objects live in the PRIVATE Supabase Storage bucket |
| `index.js` | 172 | the ownership model (handoff Feature C, Phase 3a). A wardrobe row exists ONLY because the user said so: manual add, a catalog |
| `photo-contract.js` | 8 | Client/server shared garment-photo limits. Keep this module dependency-free so browser code never pulls the server-only Storage or Postgres layers into |
| `purchase.js` | 6 | Client-safe ownership rule: an owned anchor participates in styling but is never translated back into purchase intent by a bulk bag action. |

### `lib/wire/`
*1 file, 110 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `refs.js` | 110 | Hashtags and @mentions on the wire (owner directive, HANDOVER-2026-08-14 backlog 3). Pure text in, structure out — no DOM, |

---

## `app/api/` — the request plane

Every HTTP entry point. Authentication, rate limiting and input validation
belong HERE and not deeper — a route is the boundary where an untrusted
request becomes trusted arguments.


### `app/api/account/age/`
*1 file, 92 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 92 | Records the self-declared birth date behind OWNER DECISION #2 (13+). |

### `app/api/account/kind/`
*1 file, 97 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 97 | GET  → this account's kind + the capabilities it opens. POST → choose a kind. Chosen once at signup; changing it afterwards is an |

### `app/api/admin/`
*1 file, 598 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 598 | Admin/moderation backend — no public UI yet (deliberate: the public design is locked; a full admin page can mount on these functions later). |

### `app/api/asterisk/memory/`
*1 file, 68 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 68 | GET  ?user=<uid> → the versioned Asterisk memory contract (ADR-001 v2): what you told us / what we inferred / what Asterisk learned / |

### `app/api/auth/`
*1 file, 144 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 144 | GET issues a server-signed anonymous device identity in an HttpOnly cookie. POST adopts that verified device identity into the Supabase account proven by |

### `app/api/boards/`
*1 file, 171 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 171 | Pinterest-style moodboards. GET    /api/boards?user=<id>      -> the user's boards (with items) |

### `app/api/booth-visit/`
*1 file, 34 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 34 | POST { user?, sourceName } — the attribution channel's ONLY writer (P2). A reader clicked a booth on THE WIRE's hotlist; the visit is recorded so |

### `app/api/business/`
*1 file, 155 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 155 | the passport → business upgrade (owner law, Aug 13). A brand VERIFIES itself: it submits its brand name, its |

### `app/api/checkout/`
*1 file, 114 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 114 | POST { user?, itemId }  → open a Stripe-hosted checkout for a REAL item (demo archive records refuse with 409 — the same |

### `app/api/connect/`
*1 file, 49 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 49 | POST /api/connect  { user, platform } Account linking. Real platform OAuth adapters plug in here (eBay Browse, |

### `app/api/consent/`
*1 file, 61 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 61 | the consent moment's server half (D4). GET reads the state (null = unanswered = unobserved, enforced at every |

### `app/api/discover/`
*1 file, 131 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 131 | GET /api/discover?q=&source=&tag=&category=&sort=new&offset=&limit=&user=&brain= The full site inventory — ranked through the user's Passport only when |

### `app/api/discover/rails/`
*1 file, 61 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 61 | cultural Discover rails (Feature D). GET  ?user=  → every enabled rail from the registry, content resolved live |

### `app/api/dm/`
*1 file, 486 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 486 | The mail desk. One route, op-dispatched. |

### `app/api/ebay/`
*1 file, 61 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 61 | GET /api/ebay?q=<query>&limit=<n> Live listings from the OFFICIAL eBay Browse API, normalized to the catalog |

### `app/api/editorial/`
*1 file, 255 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 255 | Editorial as hyperlinked articles + user/ASILUM posts (editorial_posts). Not a heavy magazine backend: title/excerpt/image/link/tags/author, able to |

### `app/api/editorial/engage/`
*1 file, 74 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 74 | LIKES + SAVES on transmissions (owner directive, HANDOVER-2026-08-14 backlog 2). Person-deduped counters in the popularity style: the |

### `app/api/feed/`
*1 file, 295 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 295 | GET /api/feed?user=<id>&epsilon=<0\|1>&q=<prompt>&board=<boardId> Returns a ranked feed. With Asterisk guidance active it uses the Passport |

### `app/api/follow/`
*1 file, 71 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 71 | POST /api/follow { user, boardId, follow: true\|false } Following a moodboard makes its taste a standing influence on your feed — |

### `app/api/impersonation/`
*1 file, 66 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 66 | the public door to Feature G's impersonation track (gap 1, 18 Aug). |

### `app/api/impressions/`
*1 file, 90 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 90 | POST /api/impressions — the examined-slot beacon (r19). Body: { user, serveId, examined: [itemId, ...] } |

### `app/api/ingest/`
*1 file, 47 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 47 | POST /api/ingest Authorization: Bearer <INGEST_TOKEN> Body: { merchantFeedUrl?, officialApiUrl? } |

### `app/api/interaction/`
*1 file, 185 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 185 | POST /api/interaction Body: { user, item: {id, tags}, action, dwellMs } or  { user, events: [{ item, action, dwellMs }, ...] }  (batched dwell) |

### `app/api/interpret/`
*1 file, 168 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 168 | GET  /api/interpret?q=&user= — Asterisk AI's reading of a search query. Legacy fields (entity/interpretations/personalized) are preserved; the |

### `app/api/measurements/`
*1 file, 68 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 68 | GET / PUT / DELETE — the reader's own body measurements. |

### `app/api/moodboard/`
*1 file, 161 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 161 | The Mood Board as a database feeder. Every training action becomes a real mood_board_uploads record the future vision/AI layer can re-analyze. |

### `app/api/orders/`
*1 file, 48 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 48 | GET /api/orders?user=<id> — real purchase tickets live elsewhere; this endpoint returns bag intent history, newest first, joined to items. |

### `app/api/outfits/`
*1 file, 309 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 309 | POST /api/outfits { kind:"generate",user,anchor?,full?,fit?,aiConsent? } Legacy GET supports non-sensitive deep links but intentionally ignores fit. |

### `app/api/privacy/`
*1 file, 120 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 120 | DELETE /api/privacy — erase user-linked personalization data AND the buyer vault (name/address/saved-card references — the right to be |

### `app/api/profile/`
*1 file, 41 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 41 | GET /api/profile?user=<id> — read-only view of the learned profile, used by the brain visualization (vizState runs client-side on this payload). |

### `app/api/profile/room/`
*1 file, 202 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 202 | MySpace-inspired profile rooms (Feature E). GET  ?handle=<claimed>  → the PUBLIC room: published + moderation-visible |

### `app/api/purchase-info/`
*1 file, 57 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 57 | SETTINGS' door to the buyer vault (the other lawful door is the first purchase, in the ticket-fee route; the |

### `app/api/related/`
*1 file, 38 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 38 | GET /api/related?item=<id>&limit=<n> Pinterest-style "more like this": co-engagement graph neighbors first |

### `app/api/reset/`
*1 file, 30 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 30 | POST /api/reset { user } FULL AMNESIA: wipes the learned taste profile (long + session vectors, |

### `app/api/search/`
*1 file, 94 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 94 | GET /api/search?q=<text>&user=<id>&brain=<0\|1> ASILUM Search Engine v1 (lib/search): database-backed, mapping-expanded, |

### `app/api/similar/`
*1 file, 47 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 47 | GET /api/similar?user=<id>&limit=<n> TikTok-inspired cross-user layer, live: taste neighbors (profile cosine) |

### `app/api/stats/`
*1 file, 79 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 79 | GET /api/stats — aggregate health metrics for the brain: interaction volume by action, user/board/graph sizes, and the most-engaged items. Read by the |

### `app/api/stripe/webhook/`
*1 file, 55 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 55 | Stripe → ASILUM. The signature IS the authentication: HMAC over the RAW body with STRIPE_WEBHOOK_SECRET (constant-time, ±5 min). Unkeyed deploys |

### `app/api/style-profile/`
*1 file, 44 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 44 | GET  ?user= → the user's style profile (rebuilt transparently when stale). POST { user } → force a rebuild now. |

### `app/api/stylist/`
*1 file, 87 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 87 | The AI-ready stylist service endpoint (UI-independent; /stylist page and /api/outfits keep working unchanged). |

### `app/api/suggest/`
*1 file, 46 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 46 | GET /api/suggest?q=<partial> — search autocomplete: 3–10 suggestions when possible (corrected spellings, related fashion terms, designers, and |

### `app/api/ticket-fee/`
*1 file, 167 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 167 | The §6 referral lane's money door. ASILUM charges the founders fee ALONE; the real purchase — payment, tax, shipping — completes on the source. The |

### `app/api/tickets/`
*1 file, 192 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 192 | The third-party purchase-assistant ticket flow. ASILUM never fulfills: the original marketplace/seller confirms, ships, tracks, and services. |

### `app/api/train/`
*1 file, 57 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 57 | POST /api/train Body: { user, prompt } Cold-starts or reshapes a user's profile from a free-text prompt / moodboard |

### `app/api/wardrobe/`
*1 file, 108 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 108 | the ownership surface (Feature C, Phase 3a). GET    ?user=&status=active\|retired\|all → your wardrobe (private, always). |

### `app/api/wardrobe/photo/`
*1 file, 151 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 151 | garment photo upload (Feature C, Phase 3b). POST multipart/form-data: user, id (your wardrobe item), consent (the exact |

### `app/api/why/`
*1 file, 69 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `route.js` | 69 | Asterisk AI explanation + correction endpoint. GET  ?item=<id>&user=<uid> → honest "why am I seeing this" (identity-gated; |

---

## `app/` — the surface

Pages and components. Server components by default; `"use client"` marks the
interactive ones. UI is governed by `CONSTITUTION.md` — read it before redesigning.


### `app/`
*7 files, 2,240 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 1059 | CATALOG (home). Straight clothing (owner order, Aug 12; POST folded into THE WIRE at /hotlist by the Aug 13 overhaul — all user posts live there now): |
| `shell.js` | 702 | The magazine shell around every page: one fixed top header — wordmark at full size, the always-moving ticker, big search/bag/sign-in — with the |
| `opengraph-image.js` | 228 | the social card, GENERATED, not committed. |
| `not-found.js` | 109 | the 404 plate: a dead record, printed like an editorial page instead of an apology. Owner-directed (21 Aug), references supplied: |
| `layout.js` | 81 | Root layout: every page renders inside the magazine shell. |
| `robots.js` | 38 | served at /robots.txt (Next.js metadata route). NOTE on /piece/<id>: deliberately NOT listed below. It ships a meta |
| `sitemap.js` | 23 | served at /sitemap.xml (Next.js metadata route). Only the public editorial surfaces; personal pages are robots-disallowed |

### `app/accessibility/`
*1 file, 73 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 73 | ACCESSIBILITY STATEMENT. ADA Title III alignment, WCAG 2.1 AA target. Claims here must track what |

### `app/admin/`
*2 files, 624 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 605 | THE DESK (owner directive, HANDOVER-2026-08-14 backlog 4). The operator surface for /api/admin, which has been |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/analytics/`
*1 file, 52 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 52 | the business ledger. Replaces PASSPORT for a business account (lib/nav.js). |

### `app/asterisk/`
*2 files, 180 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 161 | /asterisk — the full Asterisk memory and guidance control room. Everything the drawer shows, plus the control room: export your memory as |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/board/`
*2 files, 502 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 483 | Moodboard viewer/manager. Your own boards: rename, remove pieces, create new boards, copy the share link. Opened with ?id=<boardId> it shows anyone's |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/checkout/`
*2 files, 360 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 341 | THE CHECKOUT HOUSING (owner order, 20 Aug 2026). One clean room for the §6 two-transaction lane: the piece's picture and |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/components/`
*20 files, 4,407 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `MailDesk.jsx` | 938 | the mail icon in the header, on every tab, and the panel behind it. |
| `AccountSignup.jsx` | 452 | the account hold (mounted in the shell). Real Supabase accounts only (email + password, or a magic link for |
| `roadBuilder.js` | 358 | passport → /upload build animation (upload-station r5, owner decree). At click the overlay shows a still |
| `DesignConsole.jsx` | 349 | the DESIGN CONSOLE. The owner's hand on the Fashion Intelligence OS: every text size, button |
| `AsteriskDock.jsx` | 308 | ASTERISK's living form (owner decree, redesign/asterisk-hologram): an interactive 3D hologram entity built |
| `ProfileRoom.jsx` | 277 | Profile rooms (Feature E). Two faces of the same surface: <RoomEditor />  — the owner's editor on /profile. Accounts only (ADR-002); |
| `WardrobeTab.jsx` | 265 | Profile → WARDROBE tab (Feature C, Phase 3a). Pieces you actually own: manual adds here, catalog pieces marked owned, and "bought" ticket |
| `AsteriskMemory.jsx` | 247 | Asterisk memory surface (contract ADR-001 v2). MemorySections = the shared section renderer /asterisk uses, so the read |
| `BusinessAccount.jsx` | 205 | the passport → business panel (owner law, Aug 13), mounted on PROFILE → ACCOUNT. Every state shown |
| `ConsentMoment.jsx` | 138 | D4's first-visit consent moment (ruled 20 Aug 2026; spec docs/d4-consent-spec-2026-08-20.md). Shell- |
| `DiscoverRails.jsx` | 137 | Cultural Discover rails (handoff Feature D). Named, collapsible strips whose content derives live from reviewed sources: the culture catalog |
| `dismiss.js` | 136 | ONE dismissal contract for transient surfaces (synergy phase 1). Every overlay/sheet/modal closes on Escape; panels that |
| `TicketFlow.jsx` | 117 | the third-party purchase-assistant flow. Buy/Request → ticket created → availability + price shown → REQUIRED |
| `ProductSignals.jsx` | 105 | the small honest signals on a piece: what colour it VERIFIABLY is, and how it would fit the reader. |
| `UserBits.jsx` | 105 | Reusable social atoms: monogram avatar, "Who to follow" module, and the user search bar. All follow state is local until real accounts exist. |
| `PassportSecurity.jsx` | 79 | UV security artwork for the PASSPORT document (redesign/passport-uv), color-matched to the OS tokens. |
| `KindGate.jsx` | 64 | the client half of the account-kind split. |
| `ParisMap.jsx` | 62 | the real-OSM Paris road hologram, shared (redesign/upload-station). PassportSecurity renders it inside the |
| `Notice.jsx` | 33 | ONE notice surface (synergy phase 1). The app had grown nine ad-hoc notice/error treatments; this is the house primitive |
| `TransmissionText.jsx` | 32 | One transmission's body, with #hashtags and @mentions as live links (owner directive, HANDOVER-2026-08-14 backlog 3). Every surface that |

### `app/cover/`
*3 files, 465 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 397 | FRONT COVER. The landing edition (owner amendment, July 25: seventh destination), rebuilt as a true magazine cover (owner refinement round, Aug 12) and |
| `ledger.js` | 43 | The FRONT COVER's system-ledger folio, as a pure function so it is testable without a browser (same reason /piece/[id]/handoff.js sits beside its page). |
| `layout.js` | 25 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/discover/`
*2 files, 595 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 570 | DISCOVER. The full site inventory across every source. Asterisk may route search and exploration through the user's Passport, but the user can pause that layer. |
| `layout.js` | 25 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/hotlist/`
*2 files, 703 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 678 | THE WIRE (owner overhaul, Aug 13; formerly EDITORIAL — the destination renamed by owner decree). |
| `layout.js` | 25 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/orders/`
*2 files, 233 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 214 | ORDERS & TICKETS. PURCHASE TICKETS are real database records from the third-party purchase assistant (/api/tickets): the source platform fulfills, ships, and tr |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/piece/[id]/`
*2 files, 154 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 132 | a STABLE, SHAREABLE URL for one piece. |
| `handoff.js` | 22 | the hand-off half of the stable piece URL. |

### `app/privacy/`
*1 file, 150 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 150 | PRIVACY POLICY. Constitution §7 launch dependency. Every claim below describes what the product ACTUALLY does today (no-faking rule applies to legal pages first |

### `app/profile/`
*2 files, 778 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 759 | PROFILE. Standard social format (owner order, Aug 12: Grailed × Twitter × MySpace, legibility first): banner, overlapping avatar, name/handle/bio, |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/settings/`
*2 files, 430 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 411 | SETTINGS. The rack (owner order, Aug 12: old music-making software — numbered hardware modules, LEDs, engraved labels; every control a user needs to |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/stats/`
*2 files, 272 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 253 | Brain health dashboard: the ASTERISK hologram entity at reading size, interaction volume by action, graph/board/user counts, and the |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/stylist/`
*2 files, 321 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 296 | THE STYLIST. Full generations: 5 base genres × 5 looks = 25 LOOKs, cut across sources, match floor 75 (of 99 — not a percentage), with a 30-day repeat memory |
| `layout.js` | 25 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/terms/`
*1 file, 162 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 162 | TERMS OF SERVICE. Constitution §7 launch dependency. Describes the product as it actually is: a discovery magazine with external checkout — ASiLUM is never the |

### `app/title-card/`
*1 file, 77 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 77 | the magazine's title card (owner-directed, 21 Aug; revised same day: "make it appear more like the 404 screen"). The card now |

### `app/u/[handle]/`
*1 file, 186 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 186 | a poster's public page (the identity chain, owner order Aug 13: every wire byline lands somewhere REAL). |

### `app/upload/`
*2 files, 466 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 447 | UPLOAD // TEACH ASTERISK (redesign/upload-station). A Pinterest-style moodboard station over the warped-in Paris map: |
| `layout.js` | 19 | Generated for route metadata only. The page itself is a client component and cannot export `metadata`, so the segment layout carries it. This renders its |

### `app/watchtower/`
*1 file, 38 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `page.js` | 38 | demand, in cohorts. Replaces DISCOVER for a business account (lib/nav.js). |

---

## `scripts/` — operational and measurement tooling

Nothing here runs in production. `measure-*` are the evaluation harnesses that
keep the engine honest; the rest are migration and maintenance commands.


### `scripts/`
*51 files, 7,036 lines*

| File | Lines | What it is |
| --- | ---: | --- |
| `measure-attribute-reading.mjs` | 482 | does the engine READ the attribute words in a query, or does it only disclose that it cannot? |
| `measure-replay.mjs` | 382 | declared-criteria measurement for r15: the offline replay harness calibration. |
| `measure-distribution.mjs` | 301 | declared-criteria measurement for r23: DISTRIBUTIONAL HEALTH (audit #12). |
| `measure-noun-coverage.mjs` | 254 | before/after measurement for r8 (generic-noun coverage: knit → knitwear) and the GARMENT_CATEGORY |
| `measure-disciples.mjs` | 236 | declared-criteria measurement for r10: the fan-tribe study (11 curated culture records from the owner-supplied |
| `measure-tuning.mjs` | 226 | declared-criteria measurement for r16: bounded bridge self-tuning. Offline arms; the python 1000-bot stress |
| `measure-popularity-people.mjs` | 222 | the delta/epsilon counter battery. |
| `backfill-edge-contributors.mjs` | 221 | rebuild the gamma corroboration ledger from the canonical event history. |
| `measure-culture-guidance.mjs` | 219 | declared battery for the search-culture-guidance round (Aug 5, 2026). |
| `measure-vibe-sweep.mjs` | 208 | 1000-query cross-domain search sweep (Aug 5). |
| `check-deploy-drift.mjs` | 195 | Fails when `main` has moved ahead of what production is actually serving. |
| `restore-drill.mjs` | 183 | Rehearse the restore (owner directive, HANDOVER-2026-08-14 backlog 6). |
| `measure-slot-bias.mjs` | 182 | declared-criteria measurement for r24: server-stamped slot/zone on events (audit #27). |
| `measure-noise-stability.mjs` | 165 | declared-criteria measurement for r26: RESAMPLED NOISE FLOORS (audit #26). |
| `measure-vector-feed.mjs` | 162 | declared-criteria measurement for r18: catalog vectors into the feed (gamma sparse-graph fallback + reach |
| `backup-database.mjs` | 161 | Take a restorable backup of the ASILUM database (owner directive, HANDOVER-2026-08-14 backlog 6). |
| `measure-lexical-fidelity.mjs` | 155 | does the engine read the words a person actually types? |
| `measure-assisted-interpretation.mjs` | 146 | the safety rails around a model-assisted read, measured before anyone turns one on. |
| `generate-code-map.mjs` | 144 | regenerate docs/CODE-MAP.md from the tree. |
| `verify-ebay.mjs` | 143 | prove the eBay path end to end the moment keys exist, and say plainly what is still missing when they do not. |
| `measure-evidence-hygiene.mjs` | 139 | does a served row's matchReason describe evidence the row actually carries? |
| `measure-match-floor.mjs` | 139 | is ruling 8's match floor still a real gate? |
| `measure-sweater.mjs` | 137 | declared-criteria measurement for r9: the sweater retest. r8's beanie guard rejected sweater → knitwear because |
| `check-deferred-triggers.mjs` | 128 | Answers, in one command, the question two handovers have carried by hand: have the deferred optimisations become worth doing yet? |
| `measure-identity-issuance.mjs` | 125 | the issuance lockout battery. |
| `audit-navigability.mjs` | 117 | measure how findable this codebase is. |
| `measure-search-honesty.mjs` | 113 | declared battery for the search-honesty round (Aug 5, 2026). |
| `measure-rerank.mjs` | 111 | A/B measurement for bounded semantic re-ranking (r5). Runs each probe through searchProducts twice (rerank off / |
| `measure-graph-corroboration.mjs` | 107 | the forged-edge battery (Aug 6). |
| `measure-composed-disclosure.mjs` | 106 | does the engine still say what it knows when a query carries TWO constraints instead of one? |
| `measure-tiebreak.mjs` | 105 | declared-criteria measurement for r7 semantic tie-breaking. OFF = r5+r6 shipped behavior, ON = + tie-break. |
| `measure-search-loop.mjs` | 102 | declared-criteria measurement for r17: the search→brain loop (an applied reading trains the feed). |
| `measure-cultural-reach.mjs` | 99 | does a curated reading actually reach the reader, or does junk evidence shadow it? |
| `measure-ontology.mjs` | 94 | declared-criteria measurement for r13: the Fashionpedia-informed garment vocabulary (curated crosswalk, CC BY 4.0 |
| `measure-typo.mjs` | 92 | declared-criteria measurement for r12: the literal-engine typo bridge (fastest-levenshtein at interpretation time). |
| `measure-stems.mjs` | 91 | declared-criteria measurement for r11: the stem-indexed garment vocabulary (words/stemmer replaces the strip-s |
| `measure-attribution.mjs` | 87 | declared-criteria measurement for r14: bridge attribution instrumentation. The whole point of this round is that |
| `verify-stripe-e2e.mjs` | 84 | Proves the checkout engine end to end against REAL Stripe (test mode), with zero UI and zero database: refuses to run if DATABASE_URL is set, seeds one |
| `apply-schema.mjs` | 73 | Apply a SQL file to the database behind DATABASE_URL (.env.local or env). Usage: node scripts/apply-schema.mjs supabase/schema-v2.sql |
| `embed-catalog.mjs` | 71 | backfill text-v1 embeddings for the catalog (asterisk-boost r4). Requires EMBEDDINGS_PROVIDER + EMBEDDINGS_API_KEY in |
| `check-trend-freshness.mjs` | 69 | Fails scheduled CI before dated fashion claims silently become stale. Covers BOTH trend layers behind lib/asterisk/trends.js: the garment-level |
| `steward.mjs` | 65 | "is anything wrong?", answered in one command. |
| `configure-database-role.mjs` | 61 | One-time local helper: activate the v11 asilum_app role with a strong secret. The owner URL and new password are read from the environment and never logged. |
| `build-vector-neighbors.mjs` | 58 | precompute item-item vector neighbors for the feed (r18). Reads the catalog embeddings (text-v1, the space the |
| `seed-mappings.mjs` | 52 | Idempotent: (1) upserts the curated search mappings into search_mappings, (2) backfills the typed product_tags layer + production source fields for |
| `seed-supabase.mjs` | 50 | Optional demo seeding after schema-v1 through schema-v10 have been applied. Upserts the synthetic catalog into items through the application DB path. |
| `compile-culture-research.mjs` | 42 | Compile APPROVED culture-entity proposals (learned_facts) into lib/asterisk/culture.research.json — the ONLY way research reaches the |
| `diag-rerank-sims.mjs` | 35 | one-off diagnostic for r5 tuning: what do voyage sims actually look like for the failing storm/hike probes, target |
| `extract-fashionpedia.mjs` | 35 | reproducible extraction of the Fashionpedia ontology (r13). Reads an official annotation file |
| `backfill-dense-tags.mjs` | 34 | Backfill dense per-piece tags (lib/tagging/dense.js) into product_tags. Idempotent: rows upsert on (product_id, tag, tag_type) with max-confidence |
| `setup-wardrobe-storage.mjs` | 28 | create the PRIVATE "wardrobe" Storage bucket (idempotent). Run once per environment before enabling |

---

*Generated by `npm run docs:codemap` from main @ f4e5588 — 313 source files, 58,470 lines. Do not edit this file by hand; edit `docs/code-map-preamble.md` or the source headers.*
