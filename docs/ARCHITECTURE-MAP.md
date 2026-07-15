# Architecture & Data-Flow Map (Phase 0)

One page, every flow named. Arrows are data flows; (auth) marks the identity
gate; [table] marks persistence. Baseline: main @ 8c5e838, schema v12.

## Identity & request plane

```
browser ── GET /api/auth ─────────────► HMAC device cookie (u-<uuid>)   (lib/identity.js)
browser ── Supabase session bearer ───► verified sb-<uuid>
every personalized route ─ resolveRequestUser(proof) ─► uid | 401/null
admin ── Authorization: Bearer ADMIN_TOKEN ─► /api/admin action registry
runtime db role: asilum_app (v11), verifySchema fail-closed (v12)
rate limits: [api_rate_limits] hashed subjects · idempotency: [processed_operations]
```

## Taste plane (six-bridge backbone — unchanged by roadmap)

```
UI interactions ─ POST /api/interaction (operationId) ─► commitInteractionBatch
  └─ ONE txn: [profiles] [interactions] [user_events] [edges] [popularity]
boards saves ─► commitBoardSave (same txn discipline) ─► [boards] [board_items]
feed ─ /api/feed ─► six bridges (alpha…epsilon, ad) + zones + rotation
stylist ─ /api/outfits ─► brain/stylist + trends lens + measurements fit (v12)
measurements ─ /api/measurements (auth) ─► first-party only, NEVER external  [v12 store]
privacy ─ /api/privacy delete ─► purges personalization
```

## Asterisk knowledge plane

```
query ─ GET /api/interpret ─► queryRouter.interpretQuery ─► culture.js (274 entities)
  ├─ trends via trends.js (ONE authority; freshness CI, review 2026-08-15)
  └─ provenance via entity.knowledge (research-born records)
corrections ─ /api/why POST ─► [user_corrections] ─► styleProfile rebuild / [moderation_tasks]
research: admin propose ─► [learned_facts] lifecycle ─► approved ─► compile script
  ─► culture.research.json (reviewed PR diff) ─► fail-closed loader ─► catalog
model seam: lib/ai/adapter.js (anthropic real, ALL features env+consent gated, off)
```

## Commerce plane

```
adapters (ebay/woocommerce, gated) ─► normalize ─► [items] + product_* tables
search ─ lib/search (fulltext + mappings + tags) ─► rank ─► [search_logs]
tickets ─ consent-gated state machine ─► [purchase_tickets] + user-reported outcomes
sponsored: eligibility + disclosure gates (#19) — separate from interpretation
```

## Phase-1 additions (planned, ADR'd)

```
GET /api/interpret ─► orchestrator (layers: router → ambiguity → decomposition
  → misspelling → lexicon best-effort → fallthrough) ─► interpretation contract v1
  + separated confidence (confidence.js)
unresolved/low-conf ─ flag-gated ─► [unknown_queries] (normalized, demand-counted)
user feedback ─ POST /api/interpret (auth) ─► [interpretation_feedback]
  └─ immediately re-orders THAT user's interpretations; global only via research
admin: asterisk.unknown.* review/promote ─► research pipeline (no auto-trust)
```

## Dependency graph (features → planes)

- A (universal search) → Asterisk plane + search plane; adds interpretation/unknown/feedback domains.
- B (drawer//asterisk page) → READ facade over taste+Asterisk planes (ADR-001); adds memory-preferences only.
- C (wardrobe stylist) → taste plane + NEW storage boundary (private bucket) + ownership domain; consumes tickets outcomes.
- D (rails) → Asterisk knowledge + trends + search planes; adds rail registry.
- E (profiles) → NEW themed-profile domain (account_id, ADR-002) + moderation pipeline.
- F (DMs) → NEW, blocked on owner decisions; depends on E's account_id foundation.
- G (brand verification) → moderation plane + NEW brand/enforcement domains + Shopify approval.
```
A ──► B (contract feeds drawer)
A ──► D (interpretations feed rails)
C ──► (independent; shares upload pipeline groundwork with E)
E ──► F (account plane first)
G ──► (independent; needs Shopify approval)
```
