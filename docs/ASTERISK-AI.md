# ASTERISK AI — architecture plan & foundation (Day 10)

ASILUM's internal fashion intelligence: multimodal interpretation, tagging,
personalization, cultural understanding, auditing, and recommendation — built
as an **orchestrated system of specialized services**, not one model or one
prompt. It lives inside the Mood Board Brain, extends the Alpha Learning
Bridge (never replaces it), and knows what it does not know.

Provider decision: **Anthropic** is the first real model provider, wired into
the Day 9 seam (`lib/ai/adapter.js`). The base model is replaceable; ASILUM's
ontology, knowledge, dual tags, taste signals, and human-reviewed records are
the defensible assets.

---

## 1. Architecture audit (current state)

| Layer | State |
|---|---|
| Six-bridge brain (`lib/brain`) | LIVE — alpha/beta/gamma/delta/epsilon/ad bridges, two-timescale profiles, 6-day half-life decay. Untouched base layer. |
| Identity (`lib/identity.js`) | LIVE — HMAC device cookies, `resolveRequestUser()` on every gated route. |
| Canonical events (`lib/events`, `user_events`) | LIVE — 19 USER_* types, idempotent, transactional. |
| AI seam (`lib/ai/adapter.js`) | LIVE — config-gated `runModel()`, prompt versioning, untrusted-output validation, `ai_model_events` audit, local-rules fallback. Day 10: anthropic provider implemented. |
| Local interpretation | LIVE — `localFashionInterpreter` (lexicon + palette-v0 + taxonomy), honest confidence caps. |
| Style profiles / stylist reasoning | LIVE — deterministic aggregation, avoided_tags, slot/coherence outfits, feedback loop. |
| Product layer | LIVE — `items` + `product_tags` + `product_images` + availability checks + eBay adapter; in-memory fallback. |
| Vocabulary | LIVE — `lib/fashion-taxonomy` + brain aesthetic tags (one tag space, no forks). |
| Honesty contract (`lib/ai/contract.js`) | LIVE — fake AI structurally impossible. |

## 2. Preserved components
Everything above. Asterisk AI is additive: `lib/asterisk/*` composes existing
services; base tags, brain vectors, learning weights (Alpha ~60% / Beta ~30% /
~10% exploration+ads; behavioral point logic) are unchanged.

## 3. Missing systems (gap list)
Query classification & entity resolution · visual analysis beyond palette ·
audio/music interpretation · cultural knowledge records (films, characters,
celebrities, cities, decades) · canonical ontology with aliases (**Day 10**) ·
dual tagging + reconciliation (**Day 10**) · learned-fact provenance pipeline
(**Day 10**) · moderation queue (**Day 10**) · real model provider (**Day
10**) · trend intelligence · future-interest prediction · duplicate/cross-
market matching · embeddings & semantic retrieval · evaluation harness ·
research ingestion (controlled web research) · explanation generation service.

## 4. Folder & service structure
```
lib/asterisk/            Asterisk AI services (orchestration layer)
  ontology.js            canonical fashion language + resolver      [Day 10]
  tagAudit.js            dual tagging + reconciliation              [Day 10]
  facts.js               learned-fact staged pipeline               [Day 10]
  explain.js             explanation system + correction loop       [Day 11]
  queryRouter.js         query classification → entity resolution   [Day 12 v1]
  culture.js             curated film/music/city/decade readings     [Day 12 v1]
  vision/                fine-grained garment attributes            [P3]
  trends.js              trend lifecycle intelligence               [P4]
  predictions.js         future-interest estimation                 [P5]
lib/ai/                  model seam (adapter, prompts, validation) — unchanged home
lib/brain/               Alpha base layer — never modified
```
One service per concern; routes call services; services call the seam; the
seam calls providers. No logic lives in a prompt.

## 5. Database schema plan
Applied today (`supabase/schema-v4-asterisk.sql`): `ontology_tags`,
`ontology_relationships`, `product_ai_tags`, `tag_reconciliations`,
`learned_facts`, `moderation_tasks`.
Planned (per phase): `entities` (brands/designers/collections/seasons),
`celebrity_style_events`, `films`/`film_characters`, `cities`, `decades`,
`songs`/`artists`, `trends`, `user_predictions`, `product_embeddings`,
`evaluation_sets`/`evaluation_runs`, `model_versions`. Existing tables keep
their roles (`product_tags` = Base layer; `user_events` = behavior log).

## 6. Canonical tag ontology
`lib/asterisk/ontology.js`: canonical ids `<type>.<slug>` with display label,
aliases, parent, description; seeded from the LIVE vocabularies (brain
aesthetic tags + fashion-taxonomy) so the ontology extends rather than forks.
Aliases collapse duplicates (all "dark romance" variants → one id).
`resolveTag()` canonicalizes any free-form value; unresolved values are kept
as-is, never invented. Merges/deprecations are versioned rows
(`status: merged`, `merged_into`), never silent renames.

## 7. Dual tagging & reconciliation
- **Base Tags** = `items` structured fields + `product_tags` (retailer/seller/
  admin/system provenance via `source`). Never AI-written.
- **AI Tags** = `product_ai_tags`, append-only per audit pass (field, value,
  canonical_tag, confidence, certainty status, evidence, model provenance).
- **Reconciliation** = one `tag_reconciliations` row per pass: agreement
  score, conflicts (both values + confidences recorded), missing base fields.
  Conflicts NEVER overwrite base tags; high-impact conflicts (brand/category/
  material, conf ≥ 0.5) open a `moderation_tasks` row. Moderator decision is
  preserved on the reconciliation (`resolution`, `resolved_by`).
- Accuracy is measured, not assumed: evaluation sets (§17) compare AI/base/
  reconciled tags against human labels; 90% is a target the audits must prove.

## 8. Confidence & provenance
Every AI-generated value carries: confidence 0..1, a certainty status from the
fixed vocabulary (confirmed | verified | strongly_supported | probable |
estimated | visually_inferred | user_supplied | seller_supplied |
ai_generated | disputed | unverified | unknown), evidence text, and model
provenance (provider, model, prompt version). **Models may only claim
probable/estimated/visually_inferred/unknown** — `confirmed`/`verified` are
reserved for sourced or human-reviewed data (enforced in
`validateTagAuditOutput`). Local rules cap confidence at 0.6.

## 9. Research ingestion & verification pipeline
`learned_facts` implements the staged structure: discovered →
pending_verification → machine_reviewed → human_reviewed → approved →
superseded/archived (rejected at any pre-approval stage). Transitions are
validated (`lib/asterisk/facts.js`); approval requires ≥1 source URL and a
reviewer identity; sourceless claims stay at reliability 0. Each fact stores
source URLs/types, publication dates, retrieval date, reliability +
confidence scores, model version. Actual web research (query generation,
approved sources, multi-source comparison, conflict detection) is Phase 2 —
the pipeline it must write through exists now, so uncontrolled model output
can never reach trusted records.

## 10. Mood Board Brain event model
Keep `user_events` as the single behavior log (structured, idempotent).
Additions per phase: `taste_signal` events distinguishing admire/save/wear/
purchase/reject; correction events (`user_correction` with structured reason
codes: wrong-brand, too-literal, right-vibe-wrong-product, …); connected-
platform imports (consent-gated). Decay + reinforcement stay in the brain: one
view = weak temporary signal; save = high-confidence; purchase = strong
practical; repeated pass = negative; explicit correction overrides inference.
A single click never permanently redefines the user.

## 11. User taste profile model
`user_style_profiles` (live) grows per phase: positive + negative signal
lists (avoided_tags live today), contextual/seasonal preference maps,
admire-vs-buy separation (browsing-only interests vs purchase behavior),
price sensitivity, novelty tolerance, style-evolution timeline (profile
snapshots, versioned). Alpha/Beta weights and point logic preserved exactly.

## 12. Trend intelligence data model (Phase 4)
The first bounded trend-knowledge slice is live in `lib/ai/trendKnowledge.js`:
a dated 2026-07-13 fashion-TikTok editorial snapshot with source URLs,
confidence, region, lifecycle, and a hard 2026-10-01 expiry. It feeds structured
context to stylist prompt v2 and gives the local fallback an explainable trend
relevance boost capped at 0.18—below one preferred-brand signal—so current
context cannot overwrite demonstrated taste. Product text must support a trend
match; broad aesthetic tags alone are not enough. Refresh the snapshot from
TikTok Creative Center plus independent fashion reporting before its expiry.

`trends` table per the lifecycle model: origin, phases (origin → early
adoption → subculture → designer/luxury/celebrity adoption → acceleration →
mass reproduction → saturation → backlash → decline → nostalgic return →
archival rediscovery), regions, subcultures, associated products/designers,
evidence sources, momentum/saturation/longevity/commercialization scores.
Trend conclusions require multiple signals (search growth, saves, purchases,
resale, runway, editorial, geography) — never a few social posts. Per-user
trend relationship (ahead/participating/late/avoiding/source-material) is
computed, not flattened into "likes the trend."

## 13. Future-interest prediction model (Phase 5)
`user_predictions`: predicted interest, supporting signals, confidence, time
horizon, risk, exploration strategy. Probabilistic only; tested via the
existing ~10% exploration slice (never dominating the feed); updated by user
response; user-disableable.

## 14. API contracts
All identity-gated via `resolveRequestUser`; admin via `ADMIN_TOKEN`.
- Live today: `/api/interpret` (GET — cultural reading of a query: labeled
  interpretations, taste-ordered, honest entity:null misses), `/api/why`
  (GET explanation, POST structured corrections — preference codes retrain,
  standing exclusions filter, and wrong-* codes open moderation tasks),
  `/api/moodboard`, `/api/style-profile`, `/api/stylist`
  (request/feedback), `/api/admin` — extended with `asterisk.audit`,
  `asterisk.aiTags`, `asterisk.reconciliations`, `asterisk.ontology(.sync)`,
  `asterisk.fact.record/.review`, `asterisk.facts`, `moderation.list/.resolve`.
- Planned: `POST /api/asterisk/interpret` (query classification → labeled
  interpretations), `GET /api/asterisk/explain/:recommendationId`, user
  correction endpoints, privacy controls (view/disconnect/delete/pause/reset).
Services return `{ok:false, error}` — routes map to honest HTTP codes.

## 15. Background jobs
Existing: availability checks, source sync. Needed per phase: nightly tag-
audit sweep (batch `auditProductTags`), fact-verification queue processor,
profile staleness rebuilds (live), embedding backfills (P3), trend signal
aggregation (P4), evaluation runs (continuous). All jobs log to sync/audit
tables; no hidden mutations.

## 16. Moderation workflows
`moderation_tasks` queue (open → in_review → resolved/dismissed) with kind,
subject, payload (evidence, conflicts, suggested resolution), priority.
Human review required for: high-value archive attribution, exact seasons,
authenticity, celebrity credits, disputed history, sensitive cultural
interpretations, low-confidence brand IDs, major trend claims, user-reported
errors, high-impact tag conflicts. Moderators see original data, AI analysis,
confidence, sources, conflicts, change history (append-only audit rows).

## 17. Model evaluation requirements
Evaluation sets comparing AI/base/reconciled tags and descriptions to human
labels across category/color/material/attribute/season/cultural accuracy;
recommendation save/pass/conversion rates; diversity and repetition;
correction rate; confidence calibration; hallucination rate; and
**unknown-response accuracy** — the system is rewarded for honest "unknown".
Every model result already records provider/model/prompt version so wrong
outputs are reprocessable (`ai_model_events`, `product_ai_tags.audit_id`).

## 18. Security & privacy risks
- Keys server-only (`AI_API_KEY`, no NEXT_PUBLIC, no client imports) — held.
- Model output = untrusted input (validated, id-restricted) — held.
- Prompt-injection via listing text → validators whitelist fields/statuses;
  model can never write base tags or approve facts.
- Consent: connected-platform learning only with explicit user consent;
  privacy controls (§14) required before any external-activity ingestion; no
  hidden surveillance.
- PII: taste data exportable/deletable per user; events keyed to device uid.
- Third-party dependency: provider outages degrade to local rules; spend
  bounded by flags + max_tokens; every call audited in `ai_model_events`.
- Moderation writes require ADMIN_TOKEN (16+ chars) and are attributed.

## 19. Phased implementation plan
- **P1 Foundation (Day 10, this PR):** anthropic provider · ontology v1 ·
  dual tagging + reconciliation · learned-fact pipeline · moderation queue ·
  admin surface. (Normalization, embeddings, availability continue on the
  existing tracks.)
- **P2 Cultural intelligence:** entity records (films/characters/celebrities/
  cities/decades/music), query router + entity resolver, explanation service,
  human-reviewed cultural relationships, controlled research ingestion.
- **P3 Advanced vision:** fine-grained attributes, product/archive matching,
  duplicate detection, proportional-only measurements (no scale = no numbers).
- **P4 Trend intelligence:** lifecycle tracking, momentum/saturation, user-
  to-trend relationships.
- **P5 Predictive personalization:** future-interest estimates, controlled
  exploration, taste evolution, cohorts.

## 20. First production-ready step (implemented in this PR)
1. `PROVIDERS.anthropic` — real Anthropic Messages API call (fetch, server-
   only, 30s timeout, refusal-aware, fence-stripping), still fully flag-gated.
2. `supabase/schema-v4-asterisk.sql` applied (ontology, ai-tags,
   reconciliations, facts, moderation; RLS on).
3. Ontology v1 + resolver, seeded from live vocabularies.
4. `auditProductTags()` — Asterisk's secondary audit of any product: model
   path when enabled, honest local rules otherwise; append-only AI tags;
   reconciliation + moderation routing; base tags never touched.
5. Learned-fact pipeline with validated lifecycle transitions.
6. Admin inspect/operate actions for all of the above.

Everything ships **off by default** — no key, no flags, no model calls, no
fake output. The UI is untouched.
