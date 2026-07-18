# EU AI TRANSPARENCY — surface map and counsel package

Status: DRAFT FOR COUNSEL REVIEW — engineering-prepared, not legal advice.
Prepared 2026-07-17 against the EU AI Act general application date of
2026-08-02 (flagged in DATA-INVENTORY gap #1). Companion registers:
RIGHTS-REGISTER.md (per-source legal bases), DATA-INVENTORY.md (data,
retention, consent), FEATURE-FLAGS.md (what is actually enabled).

## The threshold question (counsel's, not ours)

ASILUM is a private prototype: no public deployment, no EU users, no
commercial availability. Whether any AI Act obligation attaches before the
system is "placed on the market" or "put into service" in the Union is a
legal determination this document deliberately does not make. Everything
below is prepared so that IF counsel says obligations attach (now or at
launch), the surfaces and gaps are already mapped.

## What Asterisk actually is (honest system description)

Two distinct layers, per ASTERISK-AI.md and AI-FOUNDATION.md:

1. **Live today — deterministic, no ML inference.** The taste engine
   ("brain") is weighted-bridge arithmetic over explicit interaction
   signals. Asterisk readings come from a human-curated, source-cited
   culture catalog (interpretation contract v1); explanations are
   rule-derived from real signals (`generatedBy: "asterisk-local-v1"`);
   palette analysis is client-side color statistics. No generative model
   produces any user-facing content.
2. **Gated off — model seam.** `lib/ai/adapter.js` can call external
   models (Anthropic path implemented) but every flag in `lib/ai/config.js`
   defaults off and no production key is configured. Model output, when
   ever enabled, is validated untrusted (`validate.js`), may only claim
   non-certain certainty statuses, and is logged to `ai_model_events`.

Classification consequence (for counsel to confirm): the live system is an
algorithmic recommender with curated editorial content — the AI Act's
Article 50 chatbot/synthetic-content duties primarily concern the GATED
layer; the live layer's closest obligations are DSA-style recommender
transparency (main parameters, user controls), which the product already
surfaces as a design principle.

## Surface → obligation map

| Surface | What it shows today | Obligation family | Status |
| --- | --- | --- | --- |
| ✳ ASTERISK drawer (all pages) | Passport read, controls, honest gaps | interacting-with-a-system disclosure | disclosure line ADDED this PR |
| /asterisk control room | full memory facade, guidance/erase/export | recommender transparency + controls | WHAT ASTERISK IS section ADDED this PR |
| Discover ✳ READS strip | reading method, interpretation confidence %, trend + review date | output provenance | live since Phase 1 (method labels, confidence bands) |
| ✳ WHY THIS (item modal) | signal-derived reasons, uncertainty when profile thin | explanation of recommendation | live since Day 11 |
| Stylist LOOKs | rule-built outfits from brain + availability | recommender transparency | provenance implicit — candidate for a "how looks are built" line at model-enable time |
| Settings LEGAL | sourcing, measurements, deletion semantics | general transparency notice | AI paragraph ADDED this PR |
| Moodboard uploads | `analyzed_by: filename|manual|palette-v0` honest labels | AI-processing disclosure | live since Day 8 |

## What this PR adds (engineering half)

Three add-only disclosure surfaces, all stating the same facts: Asterisk
is an automated recommendation + interpretation system; readings are
human-curated and cited; no generative AI is currently active; taste
personalization can be paused (guidance), corrected (✳ WHY THIS), or
erased (privacy controls). No compliance claims are made — the copy
describes the system, and this document routes the legal questions.

## Gate for the model seam (standing rule, enforceable in review)

Before ANY `lib/ai/config.js` flag ships enabled in production:

1. Counsel sign-off on Art. 50 duties for that surface (interaction
   disclosure and/or machine-readable synthetic-content marking).
2. Disclosure copy on the surface where model output appears, not only in
   settings.
3. `ai_model_events` retention period set (DATA-INVENTORY gap class).

FEATURE-FLAGS.md is the authoritative list of what is on; this file's
claims are true while the AI feature flags stay off.

## Open questions routed to counsel

1. Scope threshold: do any obligations attach to a private prototype
   before EU market placement? (Blocks nothing today; determines launch
   checklist.)
2. If/when placed on market: is the live deterministic layer inside the
   AI Act's "AI system" definition at all, or purely DSA territory?
3. Synthetic-content marking duty at model-enable time: text-only stylist
   wording vs Art. 50(2) machine-readable marking — what applies?
4. The three sibling gaps from DATA-INVENTORY (privacy policy/ToS,
   search_logs retention, DMCA agent) — sequencing relative to 2026-08-02.
