// lib/brain/bridges.js
// ASiLUM brain — THE SIX BRIDGES.
// Each bridge scores a catalog item for a user from a different angle, then
// the feed is a weighted blend, assembled TikTok-style with diversity rules.
//
//   alpha   — direct content match (item tags vs blended taste vector)
//   beta    — dominant-trait match (rewards a strong single shared trait)
//   gamma   — connections (Pinterest-style co-engagement graph: items linked
//             to pieces the user recently favorited/saved/shared)
//   delta   — popularity (TikTok-style global engagement rate + volume)
//   epsilon — exploration (under-exposed items outside the current taste;
//             always on a little, amplified when the user seems bored)
//   ad      — sponsored slot
//
// Items carry a flat `tags` vector (e.g. { UTILITARIAN: 0.8, GORP: 0.6 });
// the taste vector is the same shape.
//
// The assembled page is zoned:
//   core      — pieces they already like (blended six-bridge score)
//   discovery — pieces they'll PROBABLY like: adjacent aesthetics reached by
//               expanding taste one hop through the tag-affinity matrix,
//               damped where taste is already known (every 5th slot)
//   reach     — the explorer: a few pieces deliberately FAR from their taste,
//               favoring under-exposed items (2 per page, 5 when bored)

import { expandTaste } from "./tags.js";
import VECTOR_NEIGHBORS from "./vector-neighbors.json" with { type: "json" };
import { GAMMA_CONTRIB_HALF } from "./edges.js";
import { imageSim, IMAGE_EMBED_DIM } from "../vision/embed.js";
import { deltaScore, noveltyFactor, buildNoveltyIndex } from "./popularity.js";
import {
  catalogLaneEnabled, chunkQuotas, chunkLayout, listingOrder, decodeCursor, catalogLane,
  encodeCursor, normalizeTaste, cursorIndex,
} from "./chunk.js";

// (r18) Precomputed item-item vector nearness (scripts/build-vector-neighbors
// .mjs — top-12 cosine neighbors in the text-v1 embedding space, vendored;
// zero query-time API calls). Two bounded uses, both inert for users with no
// recent engagements and both killed by BRAIN_VECTOR_NEIGHBORS=0:
//   - gamma sparse-graph fallback: where the co-engagement graph has no edge,
//     vector nearness to the user's recents stands in at a DISCOUNT —
//     behavior stays worth more than similarity.
//   - reach coherence: far-reach slots prefer items far in TAG space but
//     near in VECTOR space to something the user loved — novelty with a
//     thread of coherence instead of a dice roll.
const VEC_GAMMA_DISCOUNT = 0.6;
const VEC_REACH_BOOST = 0.5;
// (21 Aug, OWNER RULING — docs/vector-gamma-ruling-2026-08-21.md, option 2)
// THE CORE SLATE RANKS UNCORROBORATED SIMILARITY LOWER. IT DOES NOT SCORE IT
// LOWER. The distinction is the whole ruling.
//
// measure-vector-feed said the feature costs the slate: top-24 affinity fell
// 0.5393 -> 0.5226 at paired sigma 0.0053, three sigma of harm, and the flat
// GATE read FAIL. A discount sweep found the harm lives entirely in items with
// NO behavioural edge, promoted into core slots on text/image similarity
// alone. The obvious fix — discount those in `parts.gamma` — was measured,
// dominated on every axis, and REFUSED by three tests, correctly: a strong
// visual match with no edge scores 0.8 x 0.45 = 0.36 against one unverified
// person's click at 1/(1+2) = 0.333, and that 0.027 is the documented rung
// that stops a forged identity outranking genuine similarity evidence.
// Discounting the uncorroborated side inverts it.
//
// So the two jobs are separated. `parts.gamma` is untouched: the ordering law
// holds, `_parts` still explains the piece, attribution still names the bridge
// that earned it, and `_score` still reconciles with both. Only the CORE
// SLATE'S RANKING KEY discounts uncorroborated similarity — the one place the
// harm was measured, and a place no law speaks about. Discovery and reach are
// untouched; reach never used this bridge anyway (its gain is VEC_REACH_BOOST,
// which survives at discount 0).
//
// 0.25 is the sweep's highest safe level expressed as a ratio: 0.6 x 0.25 =
// 0.15, the largest discount whose top-24 delta sat inside its own noise.
const SLATE_UNCORROBORATED = 0.25;

// (r27) VISUAL gamma — a third source for the same bridge, from pixels.
//
// The hierarchy this joins, and why it sits where it does. Gamma answers "does
// this go WITH the pieces you engaged with", and it now has three kinds of
// evidence, ranked by how much they actually know:
//
//   behaviour   people co-engaged with these two            up to 0.8
//   text        the descriptions are near in embedding      up to 0.6
//   VISUAL      the photographs look alike                  up to 0.45
//
// Visual is discounted hardest because v0 has NO SEMANTICS (lib/vision/embed
// .js): it cannot tell a black wool coat from a black leather one, so a high
// score is weaker evidence than a text-embedding match of the same magnitude.
//
// THE FLOOR IS THE LOAD-BEARING PART. Below IMG_GAMMA_FLOOR a visual match
// contributes NOTHING — not a discounted something. A colour-dominated
// descriptor scoring 0.5 means "both are darkish", which as a recommendation
// reason is noise wearing a number. Only a strong match participates.
//
// A consequence worth stating because it was derived rather than chosen: the
// weakest visual match that counts scores 0.80 x 0.45 = 0.36, just above the
// 0.333 a SOLO-identity behavioural edge scores (#121). So a genuinely strong
// visual likeness narrowly outranks one unverified person's click, and nothing
// weaker than that gets a say at all — which is the same ordering r18
// established for text vectors, one rung lower.
const IMG_GAMMA_DISCOUNT = 0.45;
const IMG_GAMMA_FLOOR = 0.80;
/** Feature flag: visual likeness may contribute to the gamma bridge. ON unless `BRAIN_IMAGE_GAMMA=0` — a missing
 *  variable means enabled, so a deployment that never heard of this flag gets
 *  the current behaviour rather than silently losing it. */
export function imageGammaEnabled() {
  return process.env.BRAIN_IMAGE_GAMMA !== "0";
}
/**
 * candidateId → max VISUAL similarity to any of the user's recent items.
 * `vectors` is id → Float64Array, supplied by the caller exactly as `edges`
 * and `popularity` are — the brain never fetches.
 *
 * Returns null, and therefore changes nothing, whenever there is nothing to
 * see: no vectors, no recents, no anchor with a vector, or the switch off.
 * The catalog carries zero images today, so null is the production answer and
 * the feed is byte-identical to r26 — asserted in tests/image-gamma.test.js
 * rather than assumed.
 */
export function buildImgNear(recent = [], vectors = null) {
  if (!imageGammaEnabled() || !recent.length || !vectors) return null;
  const get = (id) => (vectors instanceof Map ? vectors.get(id) : vectors[id]);
  const ok = (v) => !!v && v.length === IMAGE_EMBED_DIM;
  // Provenance guard, the r18/#135 lesson: a vector of the wrong width is a
  // vector from another model or another version. Skipped, never coerced —
  // silently scoring against a stale embedding space is the failure that
  // artifact hashing exists to prevent.
  const anchorIds = recent.slice(0, 20);
  const anchors = anchorIds.map(get).filter(ok);
  if (!anchors.length) return null;
  // An anchor is visually identical to ITSELF, so without this it would score
  // a perfect 1.0 against its own map and gamma would recommend the reader the
  // exact piece they just engaged with. Gamma answers "what goes WITH this",
  // and a thing does not go with itself. (The text-vector source never had to
  // handle this: its precomputed neighbour lists exclude self by construction.)
  const isAnchor = new Set(anchorIds);
  const entries = vectors instanceof Map ? vectors.entries() : Object.entries(vectors);
  const near = new Map();
  for (const [id, vec] of entries) {
    if (isAnchor.has(id) || !ok(vec)) continue;
    let best = 0;
    for (const a of anchors) {
      const s = imageSim(a, vec);
      if (s > best) best = s;
    }
    if (best >= IMG_GAMMA_FLOOR) near.set(id, best);
  }
  return near.size ? near : null;
}
/** Feature flag: precomputed text-vector neighbours widen the candidate pool. ON unless `BRAIN_VECTOR_NEIGHBORS=0` — a missing
 *  variable means enabled, so a deployment that never heard of this flag gets
 *  the current behaviour rather than silently losing it. */
export function vectorNeighborsEnabled() {
  return process.env.BRAIN_VECTOR_NEIGHBORS !== "0";
}
/** candidateId → max cosine to any of the user's recent items (via the
 * recents' own neighbor lists). Built once per feed assembly. */
export function buildVecNear(recent = []) {
  if (!vectorNeighborsEnabled() || !recent.length) return null;
  const near = new Map();
  for (const rid of recent.slice(0, 20)) {
    for (const [id, sim] of VECTOR_NEIGHBORS.neighbors[rid] || []) {
      if (sim > (near.get(id) || 0)) near.set(id, sim);
    }
  }
  return near.size ? near : null;
}

// Split ratios (percentages, summing to 100).
const SPLIT_BASE = { alpha: 30, beta: 15, gamma: 20, delta: 10, epsilon: 15, ad: 10 };
// (r16) read-only copy for the tuner — the shipped constants stay the law here.
export function baseSplit() { return { ...SPLIT_BASE }; }
const SPLIT_EPSILON = { alpha: 20, beta: 10, gamma: 15, delta: 10, epsilon: 35, ad: 10 };
const SPLIT_SAFE = { alpha: 45, beta: 20, gamma: 20, delta: 5, epsilon: 5, ad: 5 };

// Page-assembly rules (TikTok-style diversity guarantees).
const BRAND_CAP = 2;          // max items per brand per page
const SEEN_PENALTY = 0.3;     // score multiplier for items served recently
const DISCOVERY_EVERY = 5;    // every Nth slot is a "you'll probably like this"
const DISCOVERY_FLOOR = 0.15; // minimum discovery score to claim a slot
const XU_DISCOVERY_BOOST = 0.3; // cross-user candidates lift discovery, never core
const REACH_BASE = 2;         // far-reach pieces per page...
const REACH_BORED = 5;        // ...more when the user seems bored
const REACH_MAX_SIM = 0.15;   // "far" means at most this direct similarity
const SPONSORED_RELEVANCE_FLOOR = 0.2;

// A database boolean alone can never buy a slot. Campaign state, disclosure,
// availability, and a relevance floor are all required. This keeps future ads
// from becoming a backdoor around the recommendation system.
export function sponsorshipEligible(item, directTasteSimilarity) {
  return !!(
    item?.sponsored === true &&
    item?.sponsorship_status === "active" &&
    typeof item?.sponsor_disclosure === "string" && item.sponsor_disclosure.trim() &&
    item?.is_available !== false &&
    !["sold", "removed"].includes(item?.availability_status) &&
    directTasteSimilarity >= SPONSORED_RELEVANCE_FLOOR
  );
}

/**
 * Which set of six-bridge weights this feed assembly runs on.
 *
 * Three fixed splits, not a computed blend: SPLIT_SAFE when the caller asks
 * for safe mode, SPLIT_EPSILON when exploration has fired (the reader is
 * bored and novelty is worth more), otherwise SPLIT_BASE.
 */
export function activeSplit(epsilonActive, safeMode = false) {
  if (safeMode) return SPLIT_SAFE;
  return epsilonActive ? SPLIT_EPSILON : SPLIT_BASE;
}

// A discovery slot is labeled "discovery-crossuser" when the cross-user
// contribution outweighs the adjacent-taste part, else "discovery-adjacent".
// Both inputs are PRE-rotation (audit #24): the seen-penalty scales both parts
// equally, so it must not enter a comparison between them. Instrumentation
// only — never read by scoring. Exported so the rot-independence is testable.
export function discoveryPathwayLabel(xuBoosted, discoveryRaw) {
  return xuBoosted > (discoveryRaw || 0) / 2 ? "discovery-crossuser" : "discovery-adjacent";
}

// (r15) Measurement-only candidate policy: a validated six-bridge weight
// object that the replay/calibration harness may pass through buildFeed's
// state. NO ROUTE may ever forward user input here — the feed API builds its
// own state and does not read a split from the request (asserted in tests by
// the route's byte-identity to defaults). Returns null unless the override
// is exactly the six bridges with finite non-negative weights summing > 0.
const BRIDGE_KEYS = ["alpha", "beta", "gamma", "delta", "epsilon", "ad"];
/**
 * Validate a caller-supplied bridge split, or return null.
 *
 * FOR THE MEASUREMENT HARNESS ONLY. No route may forward user input here: a
 * request that could choose its own bridge weights could rank the feed for
 * itself, and /api/feed builds its own state and never reads a split from the
 * request — a property the route's tests assert by byte-identity to defaults.
 *
 * Deliberately strict, and null on ANY doubt: exactly the six bridge keys, no
 * extras and none missing, every weight finite and non-negative, and a total
 * above zero. Returning null rather than a repaired object is the point —
 * silently correcting a malformed split would hide the caller's mistake.
 */
export function normalizeSplit(override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return null;
  const keys = Object.keys(override);
  if (keys.length !== BRIDGE_KEYS.length || !BRIDGE_KEYS.every((k) => keys.includes(k))) return null;
  let sum = 0;
  for (const k of BRIDGE_KEYS) {
    const v = Number(override[k]);
    if (!Number.isFinite(v) || v < 0) return null;
    sum += v;
  }
  return sum > 0 ? Object.fromEntries(BRIDGE_KEYS.map((k) => [k, Number(override[k])])) : null;
}

// Cosine-like similarity between two flat tag vectors.
export function vecSim(a, b) {
  a = a || {};
  b = b || {};
  let dot = 0, na = 0, nb = 0;
  for (const k in a) {
    const av = a[k];
    na += av * av;
    const bv = b[k];
    if (bv) dot += av * bv;
  }
  for (const k in b) nb += b[k] * b[k];
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// BETA: reward items whose dominant tag is strong in the taste vector.
function betaScore(item, taste) {
  const t = item.tags || {};
  let best = 0;
  for (const k in t) {
    const contrib = (t[k] || 0) * (taste[k] || 0);
    if (contrib > best) best = contrib;
  }
  return Math.min(1, best);
}

// GAMMA: co-engagement graph affinity. How strongly is this item connected to
// the pieces the user recently engaged with? Recency-weighted max over the
// user's recent items; edge weights are squashed into 0..1.
function gammaScore(item, recent, edges) {
  if (!recent || !recent.length || !edges) return 0;
  let best = 0;
  for (let i = 0; i < recent.length; i++) {
    const nbrs = edges[recent[i]];
    const w = nbrs ? nbrs[item.id] : 0;
    if (!w) continue;
    const recency = 1 - (i / recent.length) * 0.5; // newest engagements count most
    // (Aug 6) `w` here is the DISTINCT-CONTRIBUTOR count, not a summed weight
    // — getEdges resolves that, and lib/brain/edges.js explains why. The half
    // constant is 2 so one contributor scores 0.333, strictly below the r18
    // vector floor (0.6 × 0.848 ≈ 0.509): a solo identity can never lift an
    // item above the score it would have had with no edge at all.
    const s = (w / (w + GAMMA_CONTRIB_HALF)) * recency;
    if (s > best) best = s;
  }
  return best;
}

// DELTA and EPSILON's exposure factor live in lib/brain/popularity.js — ONE
// implementation, deliberately. The reach-zone ranking below used to carry a
// second inline copy of the novelty curve, so a fix applied here alone would
// have left the reach zone (the exact slots a suppression attack targets)
// still ranking on raw impressions.

// EPSILON: exploration — favor under-exposed items (cold-start boost) that sit
// outside the current taste. This is the filter-bubble breaker.
function epsilonScore(item, alphaSim, popularity, noveltyIndex) {
  return noveltyFactor(item, popularity, noveltyIndex) * (0.5 + 0.5 * (1 - alphaSim));
}

// Blend all six bridges for one item using the active split.
export function blendedScore(item, taste, ctx = {}) {
  const split = ctx.splitOverride || activeSplit(!!ctx.epsilonActive, !!ctx.safeMode);
  const alpha = vecSim(item.tags || {}, taste || {});
  // (r18) gamma sparse-graph fallback: with no behavioral edge, discounted
  // vector nearness to the recents stands in. A WELL-CORROBORATED edge still
  // wins — but since #121 gammaScore counts distinct contributors, a solo
  // identity scores 0.333, strictly below the vector floor (~0.509), so the
  // vector nearness deliberately OUTRANKS a single-identity edge. The
  // max() below is the floor a lone forger cannot beat, not a guarantee that
  // any behavioral edge wins.
  const behavioralGamma = gammaScore(item, ctx.recent, ctx.edges);
  const vecNear = ctx.vecNear ? ctx.vecNear.get(item.id) || 0 : 0;
  // (r27) and the same bridge can now also be earned by LOOKING alike.
  const imgNear = ctx.imgNear ? ctx.imgNear.get(item.id) || 0 : 0;
  const parts = {
    alpha,
    beta: betaScore(item, taste || {}),
    gamma: Math.max(
      behavioralGamma,
      vecNear * VEC_GAMMA_DISCOUNT,
      imgNear * IMG_GAMMA_DISCOUNT
    ),
    delta: deltaScore(item, ctx.popularity),
    epsilon: epsilonScore(item, alpha, ctx.popularity, ctx.noveltyIndex),
    ad: sponsorshipEligible(item, alpha) ? 1 : 0,
  };
  let total = 0, wsum = 0;
  for (const k in split) {
    total += (parts[k] || 0) * split[k];
    wsum += split[k];
  }
  // The core slate's ranking key: the same blend, with gamma-by-similarity-
  // alone discounted. Identical to `score` for every item that carries a
  // behavioural edge, and for every item whose gamma came from behaviour.
  const slateGamma = behavioralGamma > 0
    ? parts.gamma
    : parts.gamma * SLATE_UNCORROBORATED;
  const slateTotal = total - (parts.gamma - slateGamma) * (split.gamma || 0);
  return { score: total / (wsum || 1), slateScore: slateTotal / (wsum || 1), parts };
}

// Assemble one CHUNK of the feed: score everything, then fill zoned slots
// with diversity rules — recently-served items are down-ranked (feed
// rotation) and no brand may flood a page. The chunk is cut to the shares in
// chunk.js: a fixed 25% CATALOG lane (the listing in cursor order, taste-free),
// core slots for what they already like, discovery slots (adjacent taste
// they'll probably like) and far-reach explorers. Items carry _zone so the UI
// can explain each one. BRAIN_CATALOG_LANE=0 restores the pre-chunk layout
// (discovery every 5th slot, two spread reaches, no lane).
//
// ctx.catalog = { cursor: <opaque string|null>, ordered?: [...], enabled?: bool }
// The lane walks `ordered` (default: the pool in listing order) from the
// cursor, skipping ids the chunk already holds or the reader was already
// served, deferring brand-capped listings to the next chunk instead of
// dropping them. assembleChunk returns { items, catalog }; assembleFeed is the
// items-only view every older caller and test still uses.
export function assembleFeed(pool, taste, ctx = {}) {
  return assembleChunk(pool, taste, ctx).items;
}

// FNV-1a over the id — a stable, order-free tie-break for equal scores.
function idHash(id) {
  const s = String(id);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function tieBreak(a, b) {
  const ha = idHash(a), hb = idHash(b);
  return ha - hb || (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
}

export function assembleChunk(pool, taste, ctx = {}) {
  const limit = ctx.limit || 60;
  const seen = ctx.seen || new Set();
  const adjacent = expandTaste(taste);
  // (r18) one nearness map per assembly; null for cold users (inert).
  ctx.vecNear = ctx.vecNear || buildVecNear(ctx.recent);
  ctx.imgNear = ctx.imgNear || buildImgNear(ctx.recent, ctx.imageVectors);
  // One novelty ranking per assembly — a percentile is a property of the
  // POOL, so it must not be recomputed per item, and it must be RANKED OVER
  // THAT POOL (21 Aug): the popularity table also counts entities no pool can
  // serve, and ranking against them shifts every item's exposure percentile.
  ctx.noveltyIndex = ctx.noveltyIndex
    || buildNoveltyIndex(ctx.popularity, (pool || []).map((it) => it.id));
  const hasTaste = Object.keys(taste || {}).some((k) => taste[k] > 0.2);

  const scored = (pool || []).map((it) => {
    const { score, slateScore, parts } = blendedScore(it, taste, ctx);
    const direct = parts.alpha;
    const rot = seen.has(it.id) ? SEEN_PENALTY : 1;
    const novelty = noveltyFactor(it, ctx.popularity, ctx.noveltyIndex);
    // Probably-like wants a "bridge piece": strong pull toward the adjacent
    // taste PLUS a thread of familiarity — but never a clone of what they
    // already love (that's core's job).
    const bridge = direct >= 0.75 ? 0 : Math.min(direct / 0.5, 1);
    // Cross-user layer (taste-graph law: relevance and DISCOVERY only, never
    // addiction mechanics): items taste-neighbors engaged with lift the
    // discovery score. Recorded in parts as xu so explanations stay honest.
    const xu = ctx.crossUser ? ctx.crossUser[it.id] || 0 : 0;
    if (xu) parts.xu = +xu.toFixed(3);
    // Pre-rotation discovery, kept so the crossuser/adjacent LABEL is
    // independent of the seen-penalty (audit #24). rot scales the adjacent
    // and cross-user contributions equally, so it must cancel out of a
    // comparison BETWEEN them — comparing the un-rotted xuPart against the
    // rot-scaled total made the crossuser label win ~5.7x too easily on a
    // seen item. Ranking still uses the rotted `discovery`.
    const discoveryRaw = vecSim(it.tags || {}, adjacent) * (0.35 + 0.65 * bridge) +
      xu * XU_DISCOVERY_BOOST;
    return {
      it, parts, direct, discoveryRaw,
      contextMatch: ctx.contextVec ? vecSim(it.tags || {}, ctx.contextVec) : 0,
      score: score * rot,
      // Ranking key for the core slate only (owner ruling, option 2). `score`
      // above stays the honest blend — it is what `_score` reports and what
      // `_parts` reconciles with.
      slate: slateScore * rot,
      discovery: discoveryRaw * rot,
      // Far reach: novel AND far from current taste.
      // (r18) reach coherence: far in tag space AND near in vector space to
      // something the user loved beats a pure dice roll.
      reach: novelty * (1 - Math.abs(direct)) * rot *
        (1 + VEC_REACH_BOOST * (ctx.vecNear ? ctx.vecNear.get(it.id) || 0 : 0)),
    };
  });

  // Ties are broken by a hash of the id, not by pool position. A cold reader
  // (empty popularity, no taste) ties EVERY item, and pool position is the
  // listing order — which the catalog lane walks. Left to pool order, a cold
  // core slate is the listing head, and the lane's next chunk re-serves it
  // to a reader whose consent keeps no rotation memory. Deterministic, so two
  // identical requests still build the same page (audit #28's concern).
  const byScore = scored.slice().sort((a, b) => b.slate - a.slate || tieBreak(a.it.id, b.it.id));
  const byDiscovery = scored.slice().sort((a, b) => b.discovery - a.discovery || tieBreak(a.it.id, b.it.id));
  const byReach = scored
    .filter((s) => s.direct < REACH_MAX_SIM)
    .sort((a, b) => b.reach - a.reach || tieBreak(a.it.id, b.it.id));

  // The chunk layout: one zone per slot. With the lane on, the shares in
  // chunk.js decide the counts and spreadSlots spaces every zone through the
  // page; with it off, the legacy rules (reach spread, discovery every Nth).
  const laneOn = catalogLaneEnabled() && !(ctx.catalog && ctx.catalog.enabled === false);
  const quotas = chunkQuotas(limit, {
    hasTaste, epsilonActive: !!ctx.epsilonActive, safeMode: !!ctx.safeMode, catalog: laneOn,
  });
  const legacyEvery = ctx.safeMode ? 8 : DISCOVERY_EVERY;
  let layout;
  if (laneOn) {
    layout = chunkLayout(limit, quotas);
  } else {
    const reachN = hasTaste && !ctx.safeMode ? (ctx.epsilonActive ? REACH_BORED : REACH_BASE) : 0;
    const reachSlots = new Set();
    for (let k = 1; k <= reachN; k++) reachSlots.add(Math.floor((k * limit) / (reachN + 1)));
    layout = Array.from({ length: limit }, (_, slot) => (
      reachSlots.has(slot) ? "reach"
        : hasTaste && (slot + 1) % legacyEvery === 0 ? "discovery" : "core"));
  }

  const scoredById = new Map(scored.map((s) => [s.it.id, s]));
  const cursor = laneOn ? decodeCursor(ctx.catalog && ctx.catalog.cursor) : null;
  // Rotation of the TASTE lanes. "memory": the server persists what it served
  // and the seen penalty rotates (OBSERVE consent). "cursor": it persists
  // nothing (GENERAL, anonymous), so the cursor's taste offsets say how far
  // earlier chunks got down each lane and this chunk continues from there —
  // unless the caller asks for a fresh ranking (a re-chunk after the taste
  // moved), which restarts the taste lanes at the top while the listing lane
  // keeps its place. Offsets past the end of a lane wrap: a small pool
  // rotates rather than serving a short page.
  const rotation = ctx.rotation === "memory" ? "memory" : "cursor";
  const offsets = rotation === "cursor" && !ctx.freshTaste && cursor
    ? normalizeTaste(cursor.taste) : normalizeTaste(null);
  // Under cursor rotation, what earlier chunks already walked past in ANY
  // lane is consumed for every lane: the taste orderings are three views of
  // one candidate set, and the listing is a fourth, so an item served as
  // discovery in chunk one must not come back as core in chunk two. This is
  // the same fact the seen penalty records under memory rotation, derived
  // from the cursor instead of from a stored profile.
  const consumed = new Set();
  // Candidates earlier chunks walked past for the brand cap alone: not
  // consumed, retried first for core slots this chunk (retry queue), and
  // recorded again if the cap still refuses them.
  const retry = [];
  if (rotation === "cursor") {
    for (const s of byScore.slice(0, offsets.core)) consumed.add(s.it.id);
    for (const s of byDiscovery.slice(0, offsets.discovery)) consumed.add(s.it.id);
    for (const s of byReach.slice(0, offsets.reach)) consumed.add(s.it.id);
    for (const id of offsets.passed) {
      consumed.delete(id);
      if (scoredById.has(id)) retry.push(scoredById.get(id));
    }
  }
  const passed = new Set();
  // Advance a lane pointer past everything that does not fit, remembering the
  // ones refused ONLY by the brand cap.
  const advance = (list, idx) => {
    while (idx < list.length && !fits(list[idx])) {
      const s = list[idx];
      if (!pickedIds.has(s.it.id) && !consumed.has(s.it.id)) passed.add(s.it.id);
      idx++;
    }
    return idx;
  };
  const picked = [];
  const pickedIds = new Set();
  const brandCount = {};
  const fits = (s) => {
    if (pickedIds.has(s.it.id) || consumed.has(s.it.id)) return false;
    const brand = s.it.brand || "";
    return (brandCount[brand] || 0) < BRAND_CAP;
  };
  // (r14) attribution: WHY is this item on the page — the dominant weighted
  // bridge for core slots, the sourcing pathway for zoned slots. Instrumentation
  // only: never read by scoring, so the feed is byte-identical with it.
  const split = ctx.splitOverride || activeSplit(!!ctx.epsilonActive, !!ctx.safeMode);
  const attributeBridge = (s, zone) => {
    if (zone === "reach") return "reach";
    if (zone === "catalog") return "catalog";
    if (zone === "discovery") {
      return discoveryPathwayLabel((s.parts.xu || 0) * XU_DISCOVERY_BOOST, s.discoveryRaw);
    }
    let best = "alpha", bestW = -1;
    for (const k in split) {
      const w = (s.parts[k] || 0) * split[k];
      if (w > bestW) { bestW = w; best = k; }
    }
    return best;
  };
  const take = (s, zone) => {
    picked.push({
      ...s.it, _score: s.score, _parts: s.parts, _zone: zone,
      _bridge: attributeBridge(s, zone),
      _contextMatch: +s.contextMatch.toFixed(3),
    });
    pickedIds.add(s.it.id);
    // Lane items registered their brand when the lane was walked (below), so
    // the taste lanes could see them before their slot came up.
    if (zone === "catalog") return;
    const brand = s.it.brand || "";
    brandCount[brand] = (brandCount[brand] || 0) + 1;
  };

  // The catalog lane is walked FIRST so its items hold their slots — and their
  // brand budget — before any taste lane picks. It obeys the same brand cap
  // (a deferred listing resumes next chunk, never dropped) and skips what the
  // reader was already served, so a lane item is never a repeat.
  const laneQueue = [];
  let catalogOut = null;
  let laneNext = null;
  if (laneOn) {
    const ordered = (ctx.catalog && ctx.catalog.ordered) || listingOrder(pool);
    if (rotation === "cursor" && cursor && !ctx.freshTaste) {
      // Listings before the cursor were served by the lane (or skipped as
      // consumed); the deferred one AT the cursor and everything after are
      // still to come.
      const upTo = cursorIndex(ordered, cursor);
      for (let k = 0; k < upTo; k++) consumed.add(ordered[k].id);
    }
    const lane = catalogLane(ordered, cursor, quotas.catalog, {
      exclude: (it) => pickedIds.has(it.id) || seen.has(it.id) || consumed.has(it.id) || !scoredById.has(it.id),
      defer: (it) => (brandCount[it.brand || ""] || 0) >= BRAND_CAP,
    });
    for (const it of lane.items) {
      pickedIds.add(it.id);
      const brand = it.brand || "";
      brandCount[brand] = (brandCount[brand] || 0) + 1;
      laneQueue.push(scoredById.get(it.id));
    }
    laneNext = lane.next;
    catalogOut = {
      cursor: (ctx.catalog && ctx.catalog.cursor) || null,
      nextCursor: lane.nextCursor,
      exhausted: lane.exhausted,
      quota: quotas.catalog,
      count: lane.items.length,
      rotation,
    };
  }

  const wrap = (n, len) => (len > 0 ? n % len : 0);
  let i = wrap(offsets.core, byScore.length);
  let d = wrap(offsets.discovery, byDiscovery.length);
  let r = wrap(offsets.reach, byReach.length);
  let c = 0;
  for (let slot = 0; slot < limit; slot++) {
    const zone = layout[slot];
    if (zone === "catalog" && c < laneQueue.length) {
      take(laneQueue[c++], "catalog");
      continue;
    }
    if (zone === "reach") {
      r = advance(byReach, r);
      if (r < byReach.length) { take(byReach[r++], "reach"); continue; }
    }
    // An unfillable reach slot in the legacy layout still tried discovery at
    // an every-Nth position; the lane layout gives each slot one zone.
    const tryDiscovery = zone === "discovery"
      || (!laneOn && zone === "reach" && hasTaste && (slot + 1) % legacyEvery === 0);
    if (tryDiscovery) {
      d = advance(byDiscovery, d);
      if (d < byDiscovery.length && byDiscovery[d].discovery >= DISCOVERY_FLOOR) {
        take(byDiscovery[d++], "discovery");
        continue;
      }
    }
    // Every zone falls back to core rather than leaving a hole: a short lane
    // (filtered pool, exhausted cursor) or a thin discovery still fills the page.
    // Retry what an earlier chunk passed for the brand cap, before walking on.
    let retried = false;
    while (retry.length) {
      const s = retry.shift();
      if (fits(s)) { take(s, "core"); retried = true; break; }
      if (!pickedIds.has(s.it.id)) passed.add(s.it.id);
    }
    if (retried) continue;
    i = advance(byScore, i);
    if (i < byScore.length) { take(byScore[i++], "core"); continue; }
    // Core is dry. Under memory rotation that means the pool is dry (core
    // ranks every item) and the remaining slots stay empty, as before. Under
    // cursor rotation the other lanes may still hold never-served items —
    // any of those beats a repeat — so the page is not abandoned here; the
    // fill pass below repeats only what is left after that.
    d = advance(byDiscovery, d);
    if (d < byDiscovery.length) { take(byDiscovery[d++], "core"); continue; }
    r = advance(byReach, r);
    if (r < byReach.length) { take(byReach[r++], "core"); continue; }
  }
  // Anything left in the retry queue was never reconsidered: carry it on.
  for (const s of retry) if (!pickedIds.has(s.it.id)) passed.add(s.it.id);
  // A pool smaller than what the cursor has consumed cannot fill a page with
  // new items. Under memory rotation the seen penalty simply re-serves at a
  // discount; under cursor rotation the same happens here: fill the remainder
  // from the top of the core ranking, ignoring `consumed` but never repeating
  // an id already on this page or breaking the brand cap.
  if (picked.length < limit && consumed.size) {
    for (let k = 0; k < byScore.length && picked.length < limit; k++) {
      const s = byScore[k];
      if (pickedIds.has(s.it.id)) continue;
      if ((brandCount[s.it.brand || ""] || 0) >= BRAND_CAP) continue;
      take(s, "core");
    }
  }
  // Lane items that lost their slot to an earlier break (pool smaller than
  // the chunk) are not silently dropped: report exactly how many were served.
  if (catalogOut) {
    catalogOut.count = c;
    // The cursor the client carries forward: the listing position AND, under
    // cursor rotation, how far each taste lane was consumed. Under memory
    // rotation the offsets are zero — the server's own record rotates.
    const taste = rotation === "cursor" ? { core: i, discovery: d, reach: r, passed: [...passed] } : null;
    catalogOut.taste = normalizeTaste(taste);
    catalogOut.nextCursor = encodeCursor({ ...(laneNext || { end: true }), taste });
  }
  return { items: picked, catalog: catalogOut };
}
