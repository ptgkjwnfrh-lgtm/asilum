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
- **r15 — offline replay harness** (SHIPPED): lib/brain/replay.js —
  deterministic seeded bot world (affinity-expanded judgment, the stress-
  harness doctrine) + ADVANTAGE-form counterfactual replay (candidate
  position weight minus logged-slot weight; the behavior policy scores ~0
  by construction, killing self-coverage bias). splitOverride plumbing in
  buildFeed is validated-or-ignored and reachable ONLY from measurement
  code — no route reads it. CALIBRATED (scripts/measure-replay.mjs,
  amendments declared): decided pairs 6/6 agree between live and replay
  (pairs separated beyond 2× the half-sample noise floor; 4 genuine
  tie-pairs reported undecided, never scored), deterministic run-to-run,
  120 bots × 6 pages. The python 1000-bot harness remains the live gate
  for r16's shipped candidate.
- **r16 — bounded bridge self-tuning** (SHIPPED): lib/brain/tuning.js —
  per-bridge LIFT (engagement share ÷ impression share; engagements
  action-weighted from attributed user_events, impressions from
  profile._meta.bridgeStats) drifts the CORE blend, lift clamped
  [0.5, 1.5]. HARD LAW: alpha ≥ 20% and epsilon ≥ 5% shares always
  (anti-drift, anti-bubble); no bridge > 50% (anti-monoculture); ads
  NEVER self-amplify (excluded from tuning); safety modes
  (epsilon-active, safe) stay hand-tuned and suppress tuning; evidence
  gates (120 attributed impressions + 8 engagements) keep cold users
  byte-identical forever. BRAIN_BRIDGE_TUNING=0 kills it. /stats and
  /api/profile explain the user's mix in plain words; the feed response
  carries `tuning:{active,split}`. Measured (scripts/measure-tuning.mjs,
  3 declared amendments — including the PERMUTATION CONTROL that made
  advantage-replay honest about near-policies: on-slate replay is
  pessimistically biased against any policy differing from behavior, so
  the null is the bot's own lifts on the WRONG bridges): live-sim tuned
  0.33247 ≥ base 0.33032, degraded 17/120 under the 30 cap, tuned beats
  its scrambled twins (−0.0063 vs −0.0089) beyond noise, structure
  invariants 0 breaks, page-0 byte-identity, deterministic. LIVE GATE
  (python 1000-bot harness, mem-mode, ON vs OFF): alignment +0.213 vs
  +0.208, zone mix and engagement rates unchanged, bored-user probe
  correct in both, 0 errors in both.

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
