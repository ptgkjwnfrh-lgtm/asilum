# Brain roadmap — the learning-bridge gap plan (charted Aug 4, 2026)

Owner directive: close the gaps between the six-bridge brain and the state
of the field. Doctrine unchanged and binding: deterministic, explainable,
kill-switchable, measured (declared criteria, two-arm batteries, probe
hygiene); no LLM calls in the brain; no addiction mechanics — bounded
exploration floors are guarantees, not tunables.

Each round = branch → battery → PR → owner merge. Status updates land here
in the same PR as the round they describe.

## Phase 1 — make learning measurable

- **r14 — bridge attribution** (SHIPPED with this file): every feed slot
  carries `_bridge` (core: dominant weighted bridge of the six; zoned:
  `discovery-adjacent` / `discovery-crossuser` / `reach`). Attribution rides
  interactions into `user_events` payloads (whitelisted) and aggregates
  per-user impressions in `profile._meta.bridgeStats`. Instrumentation only
  — measured byte-identical feeds (5/5 scenarios) with 100% coverage.
- **r15 — offline replay harness**: replay attributed sessions against
  candidate bridge-weight policies, scored by recorded outcomes. Calibration
  criterion: replay's policy ranking must agree with the live 1000-bot
  stress harness on known policies before it is trusted.
- **r16 — bounded bridge self-tuning**: per-user bridge win-rates
  (engagements from `user_events` ÷ impressions from `bridgeStats`,
  time-decayed) drift blend weights inside DECLARED bounded ranges. Alpha
  floor and epsilon floor are hard guarantees (anti-bubble,
  anti-addiction). Cold-start = today's hand-tuned split.
  `BRAIN_BRIDGE_TUNING=0` kills it. Measured by r15 replay + live stress
  harness + byte-exact feed invariants (brand cap, discovery cadence,
  reach slots). /stats explains the user's own mix in plain words.

## Phase 2 — feed the brain (each independent; can interleave)

- **r17 — search→brain loop**: searches, interpretation-pill clicks, and
  engaged Passport assumptions become bounded profile training through the
  existing event pipeline. Ignored readings train nothing.
- **r18 — vectors into the feed**: precomputed item-item vector neighbors
  (catalog embeddings already in DB; no query-time API calls) supplement
  gamma where the co-engagement graph is sparse; epsilon prefers
  far-in-tag-space / near-in-vector-space items — novelty with coherence.
- **r19 — anti-taste vector**: slow-decay negative profile from fast-skips
  and hides; fences far-reach/discovery candidates ONLY (never core — the
  declared anti-bubble guard). Reset Brain wipes it.

## Phase 3 — new capability (gated)

- **r20 — complement bridge (zeta)**: cross-category co-bag edges ("goes
  with", not "similar to"). DATA-GATED: ships inert behind a declared
  real-event volume threshold; bot traffic never counts (no-fake rule).
- **r21 — taste clusters**: deterministic seeded clustering of existing
  profiles; new users snap to a cluster prior. Cold-start battery: fewer
  interactions to satisfaction, established profiles byte-identical.

## Deferred with named triggers

- pgvector migration — when r18's precomputed neighbor lists outgrow
  in-process scans (owner cost decision).
- Vision embeddings — when the catalog carries real product images.
- users/boards embeddings — rides r18 infra once the Voyage payment method
  exists (owner action; free tier is 3 RPM).
