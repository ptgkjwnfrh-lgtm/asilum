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
engages. No gate, no per-viewer bifurcation, no tail deletion, and the public
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

`BRAIN_EDGE_CORROBORATION=0` restores the legacy summed-weight rule with no
deploy. Battery: scripts/measure-graph-corroboration.mjs (6 declared criteria,
one declared amendment) — the forged item sits at rank 37 of the victim's
60-slot page under the legacy rule and is absent under the fix.