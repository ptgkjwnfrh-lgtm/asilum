# ASILUM Capability Map — Master Handoff Baseline

> **Restructure status (2026-07-19):** Phase 0 of the July-19 Restructure
> Handoff is complete — all five release-blocker findings fixed on `main`
> (PR #77: creation-time newest sort, stale-response guards, discoverable-
> only inventory confidence; PR #78: anonymous-abuse boundary layers 2-3 +
> dual-channel candidate retrieval with surfaced truncation). Constitution
> v2 + ADR-004..007 are PROPOSED in this PR; phases 1+ await its approval.

Status audit for the master handoff (Features A–G) against `main` at `9a1e3b3`
(July 15, 2026). Legend: **EXISTS** (production-real today), **PARTIAL**
(a real slice exists; handoff scope is larger), **MISSING** (nothing real yet).
Nothing below is aspirational — every EXISTS/PARTIAL claim names the module.

## Feature A — Universal anything-to-fashion search

| Capability | Status | Where / gap |
|---|---|---|
| Cultural query classification + interpretation | PARTIAL | `lib/asterisk/queryRouter.js` + `culture.js` (274 entities) → `/api/interpret`. Deterministic, curated-only; no orchestrator over multiple resolvers, no clarifying questions. |
| Interpretation → structured fashion attributes | PARTIAL | Interpretations carry tags/colors/moods in the live 10-tag brain space; no materials/silhouette/construction/climate axes, no negative constraints. |
| Attribute search over permitted inventory | EXISTS | `/api/discover?tags=` + `lib/search` engine + six-bridge ranking. |
| Explanations / “why this result” | EXISTS | `lib/asterisk/explain.js`, `/api/why`, AsteriskWhy UI; discover strip shows entity + note + knowledge provenance. |
| Correction controls | EXISTS | `/api/why` POST taste/data codes → `user_corrections` (schema-v5), retrains profile / opens moderation. Interpretation-version-linked feedback: MISSING. |
| Separated confidence fields, calibration | MISSING | Single per-interpretation `confidence` today; no entity/evidence/inventory/ranking split, no calibration dataset or ECE tracking. |
| Unknown-query lifecycle | MISSING | Unresolved queries fall through honestly (`entity: null`) but are not aggregated, deduplicated, or research-queued. `search_logs` exists as raw signal. |
| Research lifecycle (staged, reviewed, compiled) | EXISTS | `lib/asterisk/research.js` + `facts.js` + `cultureSchema.js` + compile script; 40 entities shipped through it (PRs #23/#24/#28/#29/#31). Fail-closed loader, idempotent compile. |
| Model-assisted drafting | PARTIAL | Gated seam exists (`draftProposalsFromSource`, `AI_RESEARCH_ENABLED`) — honestly `notImplemented`; Anthropic provider real in `lib/ai/adapter.js` but no research prompt/validation. |
| Learning notifications | MISSING | No `user_notifications` domain. |

## Feature B — Unified Moodboard Brain + *Asterisk

| Capability | Status | Where / gap |
|---|---|---|
| One inspectable memory contract | MISSING (pieces EXIST) | Real stores: `user_style_profiles`, `user_corrections`, follows (localStorage + profile._meta), craving (`lib/craving`), measurements (v12, `/api/measurements`), avoided tags, learned concepts (`culture.research.json`). No single versioned read API; pages read stores independently. |
| Sidebar Asterisk icon + drawer | MISSING | No drawer; sidebar is the locked 9-item nav (additive change allowed, house style only). |
| `/asterisk` inspect-and-control page | MISSING | Closest: `/stats` (BrainViz) and moodboard convictions panel. |
| Explicit vs inferred vs global distinction | PARTIAL | Data distinguishes them (corrections vs behavior vs culture records) but no surface renders the distinction. |
| Forget/export/delete per memory class | PARTIAL | `/api/reset` (brain), `/api/privacy` (personalization delete, #19), corrections; no per-class export or granular forget. |
| AI transparency notice | MISSING | Constitution honesty rules exist in code; no user-facing notice. EU obligations effective 2026-08-02 — counsel gate. |

## Feature C — Wardrobe-aware Stylist

| Capability | Status | Where / gap |
|---|---|---|
| Stylist engine (taste/fit/coherence/occasion) | EXISTS | `lib/brain/stylist.js`, `lib/ai/stylistReasoningEngine.js`, `/api/outfits`, trend lens (#18), measurements-fit (#26/#30), aiConsent gate. |
| Ownership model | MISSING | No `wardrobe_items`; bag = intent (never ownership — invariant already enforced culturally), tickets have user-reported outcomes (#19: `reportTicketOutcome`) but don't create wardrobe records. |
| Garment photo upload + analysis | PARTIAL | `mood_board_uploads` + palette-v0 color statistics exists (owner-scoped rows, idempotent, transactional). No Storage buckets (no image persistence), no EXIF strip, no garment-structure analysis, no promote-to-wardrobe. |
| Outfits anchored on owned items | MISSING | Anchor-item generation exists (`?anchor=`), but anchors are catalog items, not owned items. |

## Feature D — Cultural Discover rails

| Capability | Status | Where / gap |
|---|---|---|
| Trend knowledge w/ sources, lifecycle, expiry | EXISTS | `lib/asterisk/trends.js` (one authority, Day 14) + `lib/ai/trendKnowledge.js` (sourced garment snapshot) + freshness CI (both layers, one review clock 2026-08-15). |
| Cultural entities for rails | EXISTS | 274-entity catalog incl. runway-adjacent, film, music, figures. |
| Rail registry / versioned rail items / per-user prefs | MISSING | Discover has the Asterisk read strip + `?tags=` pills; no named collapsible rails, no `discover_rails` tables. |
| Soundtrack rail (manual) | PARTIAL | `lib/music-mapping` (curated genre/artist → tags, `musicProfile`) is exactly the compliant manual seam; no UI rail. |
| Screen rail | PARTIAL | Film/TV entities exist w/ readings; no rail surface. |
| Exploration rail | PARTIAL | Epsilon/far-reach bridge exists in the feed; not a Discover rail. |
| Verified-event rails | MISSING | No event entity type with date+source verification; trend records are aesthetic/garment level. |
| Sponsored disclosure | EXISTS | Sponsored bridge + #19 sponsorship eligibility/disclosure gates. |

## Feature E — MySpace-inspired profiles

| Capability | Status | Where / gap |
|---|---|---|
| Profile page w/ banner/avatar/bio, tabs | EXISTS | `/profile` (localStorage personalization), `/u/[handle]` public pages. |
| Theme tokens, backgrounds, module ordering, visibility | MISSING | No `profile_themes`/`profile_modules`; current customization is local-only. Sanitization/moderation pipeline: MISSING. |

## Feature F — Direct messages

MISSING entirely — by design (constitution: no DMs before moderation ops).
Blocked on owner decisions #2/#3 and counsel age policy. No schema, no UI.

## Feature G — Shopify brand verification & impersonation

| Capability | Status | Where / gap |
|---|---|---|
| Moderation case machinery | PARTIAL | `moderation_tasks` + admin resolve flow + user-report kind exist; no brand cases, no enforcement/appeals state machines. |
| Shopify OAuth/store control | MISSING | `SHOPIFY_STOREFRONT_ACCESS_TOKEN` env placeholder only. Blocked on Shopify partner app + review. |
| Verified-brand badge, catalog hashing, enforcement | MISSING | |

## Cross-cutting (§5–§6)

- **Identity**: `lib/identity.js` proof-only (HMAC device cookie / verified sb- bearer); `identity_adoptions` (v7) maps anon→account transactionally; least-privilege `asilum_app` runtime role (v11) + startup schema assertion (v12 required). `account_id uuid` for social domains: MISSING (ADR-002).
- **Migrations**: repo convention is sequential `supabase/schema-vN.sql` + `scripts/apply-schema.mjs` + `app_schema_migrations` — NOT Supabase CLI migrations (handoff §5.1 conflict → ADR-003).
- **Rate limits**: pg-backed `api_rate_limits`, hashed subjects (server-derived). EXISTS.
- **Idempotency**: `processed_operations`, upload/ticket keys, compile idempotency. EXISTS.
- **Observability**: `ai_model_events` audit; no separated analytics/security/legal telemetry classes. PARTIAL.
- **Tests**: 62-test suite (unit, integrity, security-boundaries, research, trends, fit, pg-integration) + CI + trend-freshness workflow. EXISTS.
- **Feature flags**: env-gated features (AI_*, adapters, INGEST_ALLOWED_HOSTS) — convention exists; no unified flag registry/kill-switch doc → this PR adds the register.
