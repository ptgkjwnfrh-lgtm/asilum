# Brain roadmap — the learning-bridge gap plan (charted Aug 4, 2026)

Owner directive: close the gaps between the six-bridge brain and the state
of the field. Doctrine unchanged and binding: deterministic, explainable,
kill-switchable, measured (declared criteria, two-arm batteries, probe
hygiene); no LLM calls in the brain; no addiction mechanics — bounded
exploration floors are guarantees, not tunables.

Each round = branch → battery → PR → owner merge. Status updates land here
in the same PR as the round they describe.

## Phase 1 — make learning measurable

> **Correction (Aug 5, 2026 — audit round).** r14's attribution passthrough
> and r16's tuning were BOTH inert in production from the day they shipped,
> for two independent reasons found by a code audit, not by any battery:
> (1) `/api/interaction` rebuilt every event item from server inventory via
> `productSnapshot`, whose allowlist has no `_bridge` — so the client's
> reported attribution was discarded *before* `eventFromInteraction` saw it,
> and no production `user_events` row ever carried `payload.bridge`;
> (2) `tuning.js` keyed its action weights on four event names that do not
> exist in the frozen vocabulary (`USER_BAGGED_ITEM`, `USER_DWELLED_ITEM`,
> `USER_SKIPPED_ITEM`, `USER_HID_ITEM` vs the canonical `USER_ADDED_TO_BAG`,
> `USER_VIEWED_PRODUCT`, `USER_SKIPPED_PRODUCT`,
> `USER_REJECTED_RECOMMENDATION`), so bag — the strongest signal — and BOTH
> negative weights scored zero, and the declared law "skips count against"
> could not hold. Impressions accrued; engagement evidence was structurally
> zero, so `tunedSplit` failed its gate forever and `tuning.active` was
> permanently false. Every r16 measurement passed because the offline
> harnesses (`replay.js`, `measure-tuning.mjs`) build engagement in-process
> from `it._bridge`, bypassing the route entirely — the batteries never
> crossed the API boundary they claimed to validate. Fixed and verified
> end-to-end through the running app (tuning activates, floors hold, cold
> users byte-identical); the harness lesson is recorded below.

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
  STATUS NOTE (Aug 5, audit #23 — do NOT delete; the numbers above are the
  shipped run's evidence and stand as recorded). scripts/measure-tuning.mjs
  now reports VERDICT: FAIL at head. INVESTIGATED AND EXPLAINED, owner-
  approved read-only prod-DB run + git bisection:

    commit                         base    tuned   advantage  control  verdict
    #119 r19 attribution           0.34179 0.34520 −0.01509   −0.01517 PASS
    #121 gamma corroboration       0.34196 0.34544 −0.01470   −0.01498 PASS
    #123 popularity counts people  0.32974 0.34035 −0.01726   −0.01300 FAIL

  The failure is NOT from the r14/r16 attribution repair (#117/#119) — those
  pass. It appears exactly at #123, and it is a BATTERY-FIDELITY artifact of
  that intentional fix, not a product regression:

    * #123 made delta/epsilon score DISTINCT PEOPLE instead of raw counts.
      In this simulator every bot is one identity that sees each item once,
      so — measured — every item has viewers = 1 and engagers ∈ {0,1}, and
      the delta bridge collapses to exactly TWO distinct scores across the
      whole pool (0.2722 / 0.3). A bridge with two values carries almost no
      ranking signal, so the replay cross-check's tuned-vs-control
      comparison on delta is noise-dominated. This is the same truth the
      #123 PR declared up front: "delta is uniform until real people
      accumulate."
    * The REALISTIC arm moved the other way: tuning's live-sim margin over
      base TRIPLED (+0.0035 at #121 → +0.0106 at #123) and degraded bots
      halved (4/120 → 2/120). By the arm that actually simulates sessions,
      tuning helps MORE after #123, not less.
    * The prod-DB failure margin is 0.00045 — about 12% of the run's own
      noise band (advantage −0.01726 vs threshold −0.01681).

  CONCLUSION: no tuning-policy change is warranted by this. The instrument
  needs the fix, not the product — the bot world must model a SHARED
  POPULATION so items accumulate distinct viewers/engagers and people-counted
  delta regains discriminating power (this is exactly audit #10, bot realism).
  Until the simulator models multiple identities per item, the replay
  cross-check's delta comparison should be read as uninformative rather than
  as evidence against tuning. Deliberately NOT done: recalibrating the
  battery to force a pass (goalpost-moving), and changing the tuned policy
  (the evidence points at the harness, and a policy change needs the full
  algorithm-evaluation process).

## Phase 2 — feed the brain (each independent; can interleave)

- **r17 — search→brain loop** (SHIPPED): an APPLIED cultural reading —
  the pill click, "this is what I meant" — trains the profile through
  POST /api/interpret verdict "meant". Law: tags resolve SERVER-SIDE from
  the culture catalog (client tags never trusted; fabricated ids train
  nothing); ONE reading carries ONE item's worth of signal (confidence ÷
  tag count — the un-normalized version measurably collapsed a standing
  dominant taste 23→7 in one click and was fixed before shipping);
  guidance-off trains nothing; the USER_SEARCHED_QUERY event (a
  placeholder since day 5) goes live and persists BEFORE the mutation
  (day-8 law); GET stays side-effect-free (day-5 law); ignored readings
  train nothing by construction. SEARCH_BRAIN_LOOP=0 kills it. Measured
  (scripts/measure-search-loop.mjs, 2 declared amendments): reading-tag
  feed presence 6/6 up-or-at-ceiling (14→23, 16→23, 19→23), standing
  dominant taste held 6/6, ignore-arm byte-identical 6/6, deterministic;
  verified end-to-end in the running app (trained tags returned, bounded
  profile delta, negative paths inert). Deviation from the original
  roadmap wording, declared: raw searches and assumption-slate engagement
  do NOT train in v1 — only the explicit apply. The pill click is the
  cleanest consent signal; implicit channels are a future round with
  their own battery.
- **r18 — vectors into the feed** (SHIPPED): precomputed item-item vector
  neighbors supplement the feed with no query-time API calls — a vendored
  top-12 neighbor artifact (lib/brain/vector-neighbors.json, built from
  the prod catalog embeddings over 915 items via
  scripts/build-vector-neighbors.mjs; provenance asserted by
  tests/vector-neighbors.test.js, and any catalog re-embed must rerun the
  build script in the same PR). Two uses: gamma sparse-graph fallback
  (vector neighbors at a 0.6 discount ONLY where co-engagement edges are
  missing — a WELL-CORROBORATED edge wins, but since #121 gammaScore counts
  distinct contributors a solo-identity edge scores 0.333, below the vector
  floor, so the vector fallback deliberately outranks it) and reach
  coherence (epsilon
  prefers far-in-tag-space / near-in-vector-space items — novelty with a
  thread of coherence). BRAIN_VECTOR_NEIGHBORS=0 kills it. Measured:
  unit 5/5 (suite 222); offline battery (scripts/measure-vector-feed.mjs)
  PASS — reach-slot affinity 0.1025→0.1417 with the top-24 latent-affinity
  satisfaction proxy not degraded beyond noise (re-run at head, mem-mode:
  top-24 affinity off 0.5337 → on 0.5415, noise 0.0088). AUDIT #23: the gate
  asserts top-24 AFFINITY, not item IDENTITY — the earlier "top-24 identity
  held" wording was wrong. The supplement is MEANT to change which items
  fill reach slots, so exact top-24 membership is NOT expected to hold and
  the gate rightly never checks it; affinity-not-degraded is the honest
  claim. Per-page structure identical, deterministic run-to-run; live
  1000-bot
  two-arm gate PASS — ON alignment gain +0.231 (196/200 bots improved)
  vs OFF +0.214 (197/200), zone mix structurally identical
  (46.9/11.9/1.2 vs 46.6/12/1.4), engagement by zone equal within noise
  (core 36% both arms; discovery 52% vs 55%, inside ~2σ at n≈1250),
  bored-user law holds in both arms (reach 5/5, epsilonAuto), 0 errors
  either arm (9181/9204 calls). HONEST NOTE: the gamma-fallback
  criterion is vacuous at sim warmup scale — 0 gamma-attributed slots
  appeared in either arm, so the fallback's bounds are unit-tested but
  its slot-level effect is unmeasured until the co-engagement graph is
  denser (real traffic).
- **r19 — position-weighted attribution** (SHIPPED, renumbered ahead of the
  anti-taste vector at the audit's recommendation — it is the substrate every
  attribution-consuming round stands on): r16's lift denominator counted every
  slot the server SENT. A page is 60 slots and nobody scrolls 60, so bridges
  filling deep slots banked impressions no eye reached, their lift was
  deflated by pure position, and tuning drifted away from them for reasons
  unrelated to taste. The denominator is now what the reader actually LOOKED
  AT: the client's IntersectionObserver (0.55 coverage, tracking cards since
  the dwell work) reports examined slot ids to POST /api/impressions, and the
  bridge for each id comes from the SERVER's record of that serve
  (`profile._meta.lastServe`) — the client names slots, never their
  provenance. Declared bounds: one count per slot per serve; one report per
  serve (replays and unknown serves apply nothing and say so); ids capped at
  120; unknown ids dropped. `_meta.bridgeServed` keeps serve counts as a
  diagnostic and as the declared fallback denominator when no report ever
  arrives (a JS-disabled client must not be frozen out of tuning forever);
  `examinationCoverage()` reports which denominator is in play.
  BRAIN_EXAMINED_IMPRESSIONS=0 restores serve-counting without a deploy.
  A position-decay CURVE was rejected deliberately: its constants would be
  invented numbers, and real observation was already available.
  Measured: unit 7/7 (suite 232); E2E through the running app — 60 served, 12
  examined, denominator 12 and served 60, replay and forged-id reports apply
  0; live two-arm gate ON +0.225 (197/200) vs OFF +0.230 (200/200), zone mix
  46.7/11.9/1.4 vs 46.8/11.9/1.3, engagement by zone equal (core 36% both),
  bored-user law holds both arms, 0 errors either arm.
  The harness itself was fixed in the same round: bots stripped `_bridge`
  before posting interactions and reported no examination at all — which is
  precisely why no battery ever caught the attribution break that the Aug 5
  code audit found by reading. Bots now carry the bridge back and report the
  16 of 60 slots they actually examine.
  **CONSEQUENCE, UNRESOLVED AND OWNER-FACING:** measured examination coverage
  is ~0.27 (16 of 60 slots), so evidence now accrues ~3.75× more slowly. The
  r16 gate constant (MIN_IMPRESSIONS = 120, commented "~2 pages of attributed
  serving") was calibrated in SERVED units; in examined units two pages is
  ~32. Left unchanged in this round on purpose — recalibrating changes when
  tuning activates for real users and deserves its own declared measurement.
  The two arms are statistically indistinguishable at sim scale (run-to-run
  variance on this harness is ~±0.02, larger than the 0.005 gap), so this
  gate proves no regression, NOT an improvement; the improvement it buys is
  an unbiased denominator, which only real traffic can demonstrate.
- **r19b — anti-taste vector** (was r19): slow-decay negative profile from fast-skips
  and hides; fences far-reach/discovery candidates ONLY (never core — the
  declared anti-bubble guard). Reset Brain wipes it.

## Phase 3 — new capability (gated)

- **r20 — complement bridge (zeta)**: cross-category co-bag edges ("goes
  with", not "similar to"). DATA-GATED: ships inert behind a declared
  real-event volume threshold; bot traffic never counts (no-fake rule).
- **r21 — taste clusters**: deterministic seeded clustering of existing
  profiles; new users snap to a cluster prior. Cold-start battery: fewer
  interactions to satisfaction, established profiles byte-identical.

## Harness laws (learned the hard way)

- **A battery that never crosses the API boundary cannot validate a
  production path.** r16's offline harnesses built engagement in-process
  from `it._bridge`, so they measured a feature that was inert behind the
  real route for its entire shipped life. Any round whose value depends on
  data written by a route must include at least one assertion driven
  THROUGH that route (or an equivalent test of the route's own helper), not
  around it.
- **Vocabulary keyed by hand-written string literals is untested by
  construction.** A wrong event name is indistinguishable from an
  unweighted event at runtime — both score zero, silently. Key off the
  frozen `EVENTS` object, and assert every weighted key exists and every
  live action carries weight (tests/bridge-tuning.test.js).
- **A test that fabricates its own fixtures can encode the same mistake as
  the code.** The r16 test hand-wrote the same four wrong event names, so
  the suite agreed with the bug. Fixtures for vocabulary-bound data should
  be produced by the real constructor (`eventFromInteraction`), not typed.
- **A simulated world that cannot produce the thing being measured will
  measure noise and report a verdict anyway** (r22, Aug 6). Every bot
  browsed a PRIVATE world, so after #123 made the counters count distinct
  people, no item could ever reach a second viewer: delta held exactly TWO
  values across all 915 items, and the r16 replay cross-check was ranking
  policies on a constant. Measured, not inferred — a lone bot still prints
  2 distinct delta scores, and `tests/bot-realism.test.js` asserts that
  reproduction deliberately so the degeneracy can never return silently.
  Before trusting any bridge comparison, assert the bridge under test
  actually VARIES in the world doing the comparing.
- **When an instrument gets sharper, the criteria it used to pass start
  failing — check whether the old pass was real** (r22). Making the world
  shared did not break r15 and r18; it revealed that r18's headline
  "thin-graph gamma" arm had matched **0 bots** on main (private edges
  can't produce co-engagement neighbors of your own recent items), and that
  r15's calibration passed partly because the pairs where its estimator is
  biased were classed UNDECIDED by a noise floor that has now dropped. A
  battery whose central arm has n = 0 is not a passing battery.
- **A world model has its own calibration criteria, declared before the
  numbers, and a measurability floor is a floor rather than a target**
  (r22). The satiation strengths were swept against W3 (mean pages browsed,
  mean engagers) and never against a tuning verdict; where two grid points
  cleared the floor, the one that did NOT also weaken a second knob was
  taken. Record the sweep — an unrecorded constant is indistinguishable
  from one chosen for the answer it gave.
- **A metric scored against state the system itself trained is circular**
  (r23, Aug 6). Feed-to-profile calibration ranked the injected concentrator
  BEST: the profile is learned from the feed being judged, so an arm that
  serves a narrow slice trains a reader who wants that slice and then scores
  well for matching them. Same class of error as scoring a policy on outcomes
  its own ordering produced. Calibration targets must be exogenous to the
  thing under test.
- **When a metric has no power, shrink the claim — do not keep changing the
  metric until the sign comes out right** (r23). Latent-taste calibration
  ranked the concentrator non-monotonically too (loop-free 0.8275, base
  0.8318, concentrator 0.8293), because L1 to a broad target rewards breadth
  and a healthy personalized feed is deliberately narrow. Trying a third
  target until one ranked the fault worst would be fishing for a sign, which
  is recalibrating-to-pass wearing different clothes. The metric is reported
  and gates nothing, and audit #12's calibration item is recorded as still
  OPEN rather than closed by a number that exists.
- **Concentration has to be measured against a loop-free control, not an
  absolute ceiling** (r23). A 915-item synthetic catalog served to two-tag
  bots is concentrated whatever the engine does, so an absolute band mostly
  measures the fixture — and needs a number invented before anyone knows what
  the fixture produces. Running delta = 0 as a third arm makes the loop's own
  contribution the measured quantity: 0.0011 of top-decile share at shipped
  weights, on the production pool, with concentration FALLING across cohorts.
- **A rate limiter in front of a load test measures the rate limiter**
  (r22). The 1000-bot gate ran every bot from 127.0.0.1 against a global
  300/minute identity-issuance budget: ~2000 failed calls, 0.47 of 3 rounds
  per bot, and full-looking output underneath. Board taste transfer read
  `seeded=False` and the bored-user probe read `reach=0` purely because the
  bots never got identities. Properly provisioned (per-bot edge IP + raised
  bench budgets) the same gate returns 0 errors and both invariants pass.
  Read the error count in the header before reading any number below it.

## Deferred with named triggers

- pgvector migration — when r18's precomputed neighbor lists outgrow
  in-process scans (owner cost decision).
- Vision embeddings — when the catalog carries real product images.
- users/boards embeddings — rides r18 infra once the Voyage payment method
  exists (owner action; free tier is 3 RPM).
