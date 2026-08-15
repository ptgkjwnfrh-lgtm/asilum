# Recommendation surfaces

- / (CATALOG feed): the six-bridge zoned feed — see
  asterisk/learning-engine.md for zones, caps, rotation.
- /discover: deliberately taste-free full index (source labels via
  sourceFor); honors ?q= and ?brands=a|b.
- Stylist: full=1 → 5 base genres × 5 = 25 looks, match floor 75, 30-day
  look-signature memory (_meta.looksSeen, 10% repeat chance).
- Shareable seeds: /?board=<id> seeds any visitor's feed; /?item=<id>
  surfaces graph neighbors.
- Following blend: followed boards + followed brands' pieces + followed
  users' posts.
Brand follows train the brain through the brand's dominant TAGS — raw
designer names produce nothing through the lexicon (verified).

## Gamma edge corroboration (Aug 6, 2026 — confirmed vulnerability, fixed)

The co-engagement graph was a global, monotone, unauthenticated counter. POST
/api/interaction emitted up to 100 pair-writes per request and writeEdges
committed `ON CONFLICT (a,b) DO UPDATE SET w = edges.w + EXCLUDED.w`. Nothing
deduped by identity, capped, or decayed. One device cookie could pin edge(A,B)
at w≈450 in minutes; gammaScore's `w/(w+3)` squash then scored B at ≈0.99 on
the gamma bridge — 20% of the core blend — in EVERY other user's feed, and
first on the public GET /api/related for anchor A. Permanently, for everyone.

**Why not a distinct-contributor threshold.** The obvious fix — "an edge only
counts once N distinct identities corroborate it" — prices the attack wrong.
A ledger keyed per (contributor, pair) lets an attacker mint N cookies ONCE
and reuse them across unlimited pairs; three cookies corroborate ~36k
pairs/hour, and N=2 vs N=3 costs one extra cookie. A hard threshold also
deletes the honest tail (the median pair has exactly one contributor) while
barely inconveniencing a determined attacker.

**The fix is arithmetic.** Gamma is scored from the count of DISTINCT
identities that corroborated a pair, and the squash half is 2:

    contributors : 1      2      3      4      6      8
    gamma        : 0.333  0.500  0.600  0.667  0.750  0.800

r18 already supplies a vector-nearness floor of 0.6 × median neighbour cosine
0.848 ≈ 0.509, and blendedScore takes `Math.max(behavioural, vector)`. One
identity scores 0.333 — BELOW that floor — so a solo actor can never lift an
item above the score it would have had with no edge at all, however hard it
engages.

**r27 adds a THIRD source to the same bridge: what the photographs look like.**
Gamma now takes `Math.max(behavioural, text × 0.6, visual × 0.45)`, ranked by
how much each kind of evidence actually knows:

    behaviour (corroborated)   up to 0.80    people co-engaged these two
    text embedding             up to 0.60    the descriptions are near
    VISUAL (image-v0)          up to 0.45    the photographs look alike

Visual is discounted hardest because image-v0 has NO SEMANTICS
(lib/vision/embed.js) — it cannot tell a black wool coat from a black leather
one, so a high score is weaker evidence than a text match of the same size.
Below a 0.80 similarity floor it contributes NOTHING rather than a discounted
something: a colour-dominated descriptor scoring 0.5 means "both are darkish",
which is noise wearing a number.

That floor was derived, not picked. The weakest visual match that counts scores
0.80 × 0.45 = 0.36, landing just above the 0.333 a solo-identity edge scores —
so a genuine visual likeness narrowly outranks one unverified person's click,
and nothing weaker gets a say. An anchor is excluded from its own neighbour map
(a thing does not go with itself). BRAIN_IMAGE_GAMMA=0 removes the source.

INERT IN PRODUCTION TODAY: the catalog carries zero photographs, so no request
supplies image vectors and every feed is byte-identical to r26 — asserted in
tests/image-gamma.test.js and confirmed by measure-tuning and
measure-vector-feed returning numbers identical to main, digit for digit. No gate, no per-viewer bifurcation, no tail deletion, and the public
/api/related (which has no viewer identity by design) needs no special case.

Supporting rules, all in the same round:
- **Ledger** `edge_contributors (a, b, identity_hash, w)` stores each
  contributor's BEST weight, so the deliberate action hierarchy survives
  (bag 2 > share 1.5 > save/favorite 1, board co-membership 2) while
  repetition buys nothing. `edges` is a materialized view of it: w = sum of
  bests, contributors = distinct count, recomputed for touched pairs — which
  also HEALS a poisoned w the first time the pair is touched again.
- **CONTRIB_CAP 8** bounds the ledger (the curve is flat past it).
- **Both endpoints validated against the catalog at write.** `a` came straight
  from stored `_meta.recent` and was never re-checked, and r17 pushes a
  pseudo-item `reading:<interpretationId>` into that ring. Those ids are
  deterministic and GLOBAL, so corroborating one edge from a phantom anchor
  would steer every user who later applies that reading — bypassing the
  catalog entirely.
- **Reads bounded PER ANCHOR** (EDGE_FANOUT_CAP 32, ordered by contributors
  then w then id). A global LIMIT would let one hot anchor starve the other 99
  requested ids. `mem.edges` gains MEM_EDGES_CAP 20000, mirroring the existing
  mem ring caps.
- **Erasure**: the ledger is the first identity-linked row in the graph, so
  account deletion removes it and recomputes the affected pairs — a departed
  person must stop corroborating.

Historical rows are NOT grandfathered: existing edges keep w for audit but get
contributors = 0. Inferring contributors from w would fabricate history, and
because the attack inflates w, any such inference would assign the highest
trust to the most-likely-poisoned edges.

**BACKFILLED 2026-08-15 (owner decision).** That left gamma INERT on
production: the audit found all 2,632 live edges at contributors = 0, so
edgeStrength returned 0 and getEdges answered every anchor with nothing, while
/stats reported "graph edges 2632" and read as health. Only 1 favourite had
landed since v22, so organic corroboration was never going to arrive.

`scripts/backfill-edge-contributors.mjs` rebuilt the ledger from `user_events`
— the same evidence the live path writes from — NOT from w, so the objection
above still stands and is not contradicted. It replays positive actions at the
live weights (bag 2 / share 1.5 / save 1 / favorite 1), pairs each positive
with the identity's CO_ENGAGE_SPAN most recent distinct prior positives,
validates BOTH endpoints against the catalog, bounds each pair at CONTRIB_CAP,
and touches only pairs that ALREADY exist — it cannot invent an edge.

Result: 2,331 of 2,632 edges corroborated from 10,656 ledger rows; 301 edges
the event log cannot corroborate stay honestly at 0. The recompute healed the
weights as designed — max w fell from 449.5 to 12.0. Gamma went from 0/30 to
30/30 anchors returning neighbours, contributing 18 of 60 feed slots, WITH
corroboration still enabled. `BRAIN_EDGE_CORROBORATION` was never touched.

`BRAIN_EDGE_CORROBORATION=0` restores the legacy summed-weight rule with no
deploy. Battery: scripts/measure-graph-corroboration.mjs (6 declared criteria,
one declared amendment) — the forged item sits at rank 37 of the victim's
60-slot page under the legacy rule and is absent under the fix.

## Popularity counts PEOPLE (Aug 6, 2026 — confirmed vulnerability, fixed)

The delta bridge's counters were global, monotone and unauthenticated in BOTH
directions, and neither ever decayed:

- **Upward**: POST /api/interaction added `eng+1` per positive action with no
  per-identity dedup. 120 favourites/minute from one cookie put an item's
  volume term at 0.94 for every user in the system.
- **Downward, and worse**: GET /api/feed wrote `imp+1` for ALL 60 served items
  on EVERY serve, while caller-controlled category/maxPrice/fit filters chose
  WHICH items received them — ~3600 aimed impressions/minute. `novelty =
  25/(imp+25)` then collapses to 0.007, permanently removing a targeted item
  from every user's exploration and reach zones. A READ endpoint mutating
  global ranking state, and one that sat OUTSIDE the guidance gate, so users
  who had explicitly turned Asterisk off still moved everyone's ranking.

Suppression is the asymmetric direction because the exploration floors protect
the ZONE, not any particular item.

**Why novelty became a percentile.** The obvious fix — keep `K/(V+K)` and feed
it distinct viewers — cannot work. K=25 is calibrated to an EVENT scale that
people-counting compresses by more than an order of magnitude. Keep K and every
item sits near novelty 1.0, so epsilon degenerates into a second
anti-similarity term. Shrink K and the price of halving a target's novelty
becomes exactly K device cookies. **Calibration and attack cost are the same
number**, so no K is both useful and safe. A midrank percentile has no such
constant: scale-free, relative (suppressing an item means out-viewing the
pool), and on day one — every count zero — it returns 0.5 for everything,
uniform and honest rather than a fabricated ordering.

Delta's own constants are unchanged in VALUE and changed in UNIT (people, not
events), which moves them strictly conservative — eight distinct people is a
far higher bar than eight clicks. The neutral prior is now keyed on EVIDENCE
and blended rather than branched: it used to trigger only when the row was
ABSENT, and the feed's impression write created a row for every served item,
so in production the "neutral prior" was already dead and unproven items
scored 0.0. Removing that write would have silently resurrected it
catalog-wide — a ranking change smuggled inside a security fix.

Supporting rules: `popularity_contributors` PK (item_id, identity_hash) IS the
bound, so no per-identity cap is needed; there is deliberately **no cap on
viewers** (unlike CONTRIB_CAP for edges — novelty is monotone DECREASING, so a
cap would install a permanent novelty floor beneath the most-exposed items and
manufacture the monoculture epsilon exists to prevent); exposure is counted
from the r19 examined-slot beacon where identity is known; account deletion
erases ledger rows and recomputes; `/hotlist` and `/stats` rank and label
PEOPLE, or a forged leaderboard would stay published after ranking was fixed;
raw eng/imp are retained as diagnostics and as an abuse fingerprint, since a
120:1 event-to-people ratio is a signature.

**Honest limit**: this does not abolish suppression. It raises the price of one
unit of novelty damage from one HTTP request to one distinct signed device
identity, and leaves the damage function unchanged — the residual risk
concentrates on cold-start items, exactly the population epsilon protects.
Identity issuance prices the remainder. Measured price is published in the
battery output and the PR.

`BRAIN_POPULARITY_DEDUP=0` restores raw-event scoring AND the feed-side write
as one coupled behaviour (a switch restoring only half would create a third
mode nobody has tested). Battery: scripts/measure-popularity-people.mjs.