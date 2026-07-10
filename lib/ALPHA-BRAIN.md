# ASILUM Alpha Learning Brain — architecture map

**Base layer (LIVE, never replace): the Alpha Learning Bridge = `lib/brain/`.**
Six weighted bridges already translate real signals — favorites, saves, bag,
share, dwell, fast-skips, board co-membership, brand follows, moodboard
training — into two-timescale taste profiles with clock forgetting, an
item-item co-engagement graph, popularity counters, and always-on
exploration. Everything below builds around it; nothing bypasses it.

## Module map (added July 8)

| Module | Role | Status |
|---|---|---|
| `lib/ai` | Brain facade + `bridgeStatus()` introspection; `contract.js` = honesty helpers (`real` / `mockMarked` / `notImplemented`) | live |
| `lib/events` | Canonical 19-event vocabulary + `buildEvent()` + `eventFromInteraction()`; **persisted** to `user_events` via `lib/db.recordEvent` from interaction/board-save/search (Day 5) | live (persisted) |
| `lib/fashion-taxonomy` | Shared vocabulary: re-exports the live tag space + categories/materials/silhouettes/colors/eras/moods/conditions | live (data) |
| `lib/embeddings` | v0 = tag-space vectors + cosine (real math, used today); v1 text/visual contracts gated on `EMBEDDINGS_*` env | v0 real / v1 stub |
| `lib/vision` | **Palette v0 LIVE (Day 8)**: real color statistics from uploaded pixels (`palette.js` — dominant swatches, brightness/mood, curated color→tag mapping); moodboard uploads train on colors + filename words, records marked `analyzed_by: palette-v0`, `USER_UPLOADED_IMAGE` events fire. Deeper analysis (objects/texture/silhouette, fit-pic) still provider-gated stubs | palette live / rest stub |
| `lib/visual-personalization` | Pinterest-inspired: real v0 board-level profiles from item tags; stubs for pin ingest, image-analysis folding, aesthetic clustering | v0 real / rest stub |
| `lib/taste-graph` | TikTok-inspired cross-user layer: user↔user cosine, **live neighbors** (profile scan, capped + reported) and **live collaborative candidates** (first reader of `user_events`; signal-weight × neighbor-similarity, negatives subtract) via `/api/similar` (Day 6); clusters/cluster-trends still stubs | live (prototype scale) |
| `lib/recommendations` | Service facade: live `similarProducts` (Bridge), `LIVE_ROUTES` map, real v0 practical ranker (price/size/availability/freshness), stubs for cross-user/editorial/visual rankers | mixed |
| `lib/feed` | Mixed-feed foundation: `FEED_SOURCES`, `RANKING_FACTORS` (hand-set starting weights), `composeMixedFeed` stub. Product feed stays `/api/feed` | stub + registry |
| `lib/music-mapping` | Curated genre/artist → tag seed tables (Deftones example included); `musicProfile()` aggregates into a `/api/train`-compatible tag map | curated mock |
| `lib/connectors` | Registry: ebay (live adapter pattern), pinterest, spotify, shopify, stripe, designer feeds, resale. Opt-in, env-gated, no scraping | registry + stubs |
| `lib/background-jobs` | 11-job registry; no runner exists in the stack, every `run()` says so | stub |
| `lib/mock-data` | Index of every mock in the app so demo data can't masquerade as real | live (index) |
| `lib/db/types.js` | JSDoc entity typedefs (Product, UserProfile, UserEvent, Embedding, FitAnalysis, TasteCluster, …) | contracts |
| `supabase/schema-alpha.sql` | Staged future tables (user_events, embeddings, fit_analyses, taste_clusters, user_similarity, music_profiles, board_profiles, feed_items, …). **Not applied.** | staged |

## Rules of the tree
1. Placeholders refuse honestly (`notImplemented`) — no fake AI, ever.
2. Mock data is always `mockMarked` and listed in `lib/mock-data`.
3. One tag vocabulary (`lib/brain/tags.js`) — every module speaks it.
4. Server-only modules (`taste-graph`, `recommendations`) must never be
   imported from client components (the catalog must not reach the bundle).
5. Connectors: real OAuth, opt-in, env vars only, official APIs only.
6. Discovery, not addiction: rotation, caps and exploration slots are
   design invariants, not engagement knobs.

## Growth path
tag space (now) → provider embeddings (`embeddings` v1) → vision analysis
(`vision`) feeding board profiles (`visual-personalization`) → user
embeddings + neighbors + clusters (`taste-graph`, batch jobs) → mixed feed
(`feed.composeMixedFeed`) blending Bridge taste with cross-user candidates.
