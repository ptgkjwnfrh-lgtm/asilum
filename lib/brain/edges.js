// lib/brain/edges.js — co-engagement graph corroboration (Aug 6, 2026).
//
// THE VULNERABILITY THIS CLOSES. `edges` was a global, monotone, unauthenticated
// counter. POST /api/interaction emitted up to 100 pair-writes per request
// (CO_ENGAGE_SPAN 5 × MAX_EVENTS 20) and writeEdges committed them with
// `ON CONFLICT (a,b) DO UPDATE SET w = edges.w + EXCLUDED.w`. Nothing deduped
// by identity, capped, or decayed. One device cookie could pin edge(A,B) at
// w≈450; gammaScore squashes w/(w+3), so B then scored ≈0.99 on the gamma
// bridge — 20% of the core blend — in EVERY other user's feed, and led the
// public GET /api/related for anchor A. Permanently.
//
// WHY NOT A DISTINCT-CONTRIBUTOR THRESHOLD. The obvious fix is "an edge only
// counts once N distinct identities corroborate it". It prices the attack
// wrong: a ledger keyed per (contributor, pair) lets an attacker mint N
// cookies ONCE and reuse them across unlimited pairs — 3 cookies corroborate
// ~36k pairs/hour, and N=2 vs N=3 is the cost of one extra cookie. A hard
// threshold also deletes the graph's honest tail (the median pair has exactly
// one contributor) while doing nothing to a determined attacker.
//
// THE ACTUAL FIX IS ARITHMETIC. Gamma is scored from the count of DISTINCT
// identities that corroborated a pair, and the squash constant is retuned so
// that one identity lands BELOW the floor the item already had without any
// edge at all. r18 supplies vector nearness at VEC_GAMMA_DISCOUNT 0.6 ×
// median neighbour cosine 0.848 ≈ 0.509, and blendedScore takes
// Math.max(behavioural, vector). With GAMMA_CONTRIB_HALF = 2:
//
//     contributors : 1      2      3      4      6      8
//     gamma        : 0.333  0.500  0.600  0.667  0.750  0.800
//
// One identity (0.333) cannot beat 0.509, so a solo actor can never lift an
// item above its no-edge baseline no matter how hard it engages. Two genuine
// people barely clear it; real consensus earns real weight. No gate, no
// per-viewer bifurcation, no tail deletion — and /api/related, which has no
// viewer identity by design (it is a public deep link), needs no special case.
//
// The ledger stores each contributor's BEST weight for a pair, so the
// deliberate action hierarchy survives (bag 2 > share 1.5 > save/favorite 1,
// board co-membership 2) while repetition buys nothing. edges.w remains the
// sum of those bests — a diagnostic, no longer the ranking input.

/** Squash half-life in CONTRIBUTORS. See the table above for why it is 2. */
export const GAMMA_CONTRIB_HALF = 2;

/**
 * Past this many distinct contributors the curve is flat (0.800 → 0.818 for
 * the 9th), so further ledger rows buy no ranking and cost storage. Bounds the
 * ledger at C(915,2) × 8 ≈ 3.3M rows worst case instead of unbounded.
 */
export const CONTRIB_CAP = 8;

/** Per-anchor neighbour cap on reads. A GLOBAL limit would let one hot anchor
 * starve the other 99 requested ids; gammaScore takes a max over anchors, so
 * per-anchor top-K is near-lossless. */
export const EDGE_FANOUT_CAP = 32;

/** In-memory graph bound, mirroring MEM_EVENTS_CAP / MEM_OPERATIONS_CAP. The
 * mem path is what preview deploys, local dev and most tests run on, and
 * mem.edges had no cap or eviction at all. */
export const MEM_EDGES_CAP = 20_000;

/** Feature flag: a co-engagement edge must be corroborated by more than one identity. ON unless `BRAIN_EDGE_CORROBORATION=0` — a missing
 *  variable means enabled, so a deployment that never heard of this flag gets
 *  the current behaviour rather than silently losing it. */
export function corroborationEnabled() {
  return process.env.BRAIN_EDGE_CORROBORATION !== "0";
}

/** Canonical undirected key. MUST agree with lib/db edgeKey and the SQL
 * canonicalization in writeEdges — a one-character ordering slip silently
 * defeats the per-identity dedup by creating two rows per pair. */
export function canonicalPair(a, b) {
  const x = String(a), y = String(b);
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

/**
 * Gamma input for a pair. Under corroboration this is the distinct-contributor
 * count; with the kill switch off it is the legacy summed weight, so the old
 * behaviour is exactly recoverable without a deploy.
 */
export function edgeStrength({ contributors = 0, w = 0 } = {}) {
  return corroborationEnabled() ? Math.min(CONTRIB_CAP, contributors) : w;
}
