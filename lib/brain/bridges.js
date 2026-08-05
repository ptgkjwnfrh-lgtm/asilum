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

export function activeSplit(epsilonActive, safeMode = false) {
  if (safeMode) return SPLIT_SAFE;
  return epsilonActive ? SPLIT_EPSILON : SPLIT_BASE;
}

// (r15) Measurement-only candidate policy: a validated six-bridge weight
// object that the replay/calibration harness may pass through buildFeed's
// state. NO ROUTE may ever forward user input here — the feed API builds its
// own state and does not read a split from the request (asserted in tests by
// the route's byte-identity to defaults). Returns null unless the override
// is exactly the six bridges with finite non-negative weights summing > 0.
const BRIDGE_KEYS = ["alpha", "beta", "gamma", "delta", "epsilon", "ad"];
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
    const s = (w / (w + 3)) * recency;
    if (s > best) best = s;
  }
  return best;
}

// DELTA: global popularity — engagement volume blended with engagement rate
// (engagements per impression), so quality beats raw exposure.
function deltaScore(item, popularity) {
  const pop = popularity ? popularity[item.id] : null;
  if (!pop) return 0.3; // neutral prior for unproven items
  const volume = pop.eng / (pop.eng + 8);
  const rate = Math.min(1, pop.eng / (pop.imp + 5));
  return volume * 0.6 + rate * 0.4;
}

// EPSILON: exploration — favor under-exposed items (cold-start boost) that sit
// outside the current taste. This is the filter-bubble breaker.
function epsilonScore(item, alphaSim, popularity) {
  const pop = popularity ? popularity[item.id] : null;
  const imp = pop ? pop.imp : 0;
  const novelty = 25 / (imp + 25);
  return novelty * (0.5 + 0.5 * (1 - alphaSim));
}

// Blend all six bridges for one item using the active split.
export function blendedScore(item, taste, ctx = {}) {
  const split = ctx.splitOverride || activeSplit(!!ctx.epsilonActive, !!ctx.safeMode);
  const alpha = vecSim(item.tags || {}, taste || {});
  const parts = {
    alpha,
    beta: betaScore(item, taste || {}),
    gamma: gammaScore(item, ctx.recent, ctx.edges),
    delta: deltaScore(item, ctx.popularity),
    epsilon: epsilonScore(item, alpha, ctx.popularity),
    ad: sponsorshipEligible(item, alpha) ? 1 : 0,
  };
  let total = 0, wsum = 0;
  for (const k in split) {
    total += (parts[k] || 0) * split[k];
    wsum += split[k];
  }
  return { score: total / (wsum || 1), parts };
}

// Assemble a feed page: score everything, then fill zoned slots with diversity
// rules — recently-served items are down-ranked (feed rotation) and no brand
// may flood a page. Core slots serve what they already like; every 5th slot is
// a discovery (adjacent taste they'll probably like); a few spread slots are
// far-reach explorers. Items carry _zone so the UI can explain each one.
export function assembleFeed(pool, taste, ctx = {}) {
  const limit = ctx.limit || 60;
  const seen = ctx.seen || new Set();
  const adjacent = expandTaste(taste);
  const hasTaste = Object.keys(taste || {}).some((k) => taste[k] > 0.2);

  const scored = (pool || []).map((it) => {
    const { score, parts } = blendedScore(it, taste, ctx);
    const direct = parts.alpha;
    const rot = seen.has(it.id) ? SEEN_PENALTY : 1;
    const pop = ctx.popularity ? ctx.popularity[it.id] : null;
    const novelty = 25 / ((pop ? pop.imp : 0) + 25);
    // Probably-like wants a "bridge piece": strong pull toward the adjacent
    // taste PLUS a thread of familiarity — but never a clone of what they
    // already love (that's core's job).
    const bridge = direct >= 0.75 ? 0 : Math.min(direct / 0.5, 1);
    // Cross-user layer (taste-graph law: relevance and DISCOVERY only, never
    // addiction mechanics): items taste-neighbors engaged with lift the
    // discovery score. Recorded in parts as xu so explanations stay honest.
    const xu = ctx.crossUser ? ctx.crossUser[it.id] || 0 : 0;
    if (xu) parts.xu = +xu.toFixed(3);
    return {
      it, parts, direct,
      contextMatch: ctx.contextVec ? vecSim(it.tags || {}, ctx.contextVec) : 0,
      score: score * rot,
      discovery: (vecSim(it.tags || {}, adjacent) * (0.35 + 0.65 * bridge) +
        xu * XU_DISCOVERY_BOOST) * rot,
      // Far reach: novel AND far from current taste.
      reach: novelty * (1 - Math.abs(direct)) * rot,
    };
  });

  const byScore = scored.slice().sort((a, b) => b.score - a.score);
  const byDiscovery = scored.slice().sort((a, b) => b.discovery - a.discovery);
  const byReach = scored
    .filter((s) => s.direct < REACH_MAX_SIM)
    .sort((a, b) => b.reach - a.reach);

  // Far-reach slots, spread evenly through the page (only once taste exists —
  // for a cold user everything is already a reach).
  const reachN = hasTaste && !ctx.safeMode ? (ctx.epsilonActive ? REACH_BORED : REACH_BASE) : 0;
  const discoveryEvery = ctx.safeMode ? 8 : DISCOVERY_EVERY;
  const reachSlots = new Set();
  for (let k = 1; k <= reachN; k++) reachSlots.add(Math.floor((k * limit) / (reachN + 1)));

  const picked = [];
  const pickedIds = new Set();
  const brandCount = {};
  const fits = (s) => {
    if (pickedIds.has(s.it.id)) return false;
    const brand = s.it.brand || "";
    return (brandCount[brand] || 0) < BRAND_CAP;
  };
  // (r14) attribution: WHY is this item on the page — the dominant weighted
  // bridge for core slots, the sourcing pathway for zoned slots. Instrumentation
  // only: never read by scoring, so the feed is byte-identical with it.
  const split = ctx.splitOverride || activeSplit(!!ctx.epsilonActive, !!ctx.safeMode);
  const attributeBridge = (s, zone) => {
    if (zone === "reach") return "reach";
    if (zone === "discovery") {
      const xuPart = (s.parts.xu || 0) * XU_DISCOVERY_BOOST;
      return xuPart > s.discovery / 2 ? "discovery-crossuser" : "discovery-adjacent";
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
    const brand = s.it.brand || "";
    brandCount[brand] = (brandCount[brand] || 0) + 1;
  };

  let i = 0, d = 0, r = 0;
  while (picked.length < limit) {
    const slot = picked.length;
    if (reachSlots.has(slot)) {
      while (r < byReach.length && !fits(byReach[r])) r++;
      if (r < byReach.length) { take(byReach[r], "reach"); continue; }
    }
    if (hasTaste && (slot + 1) % discoveryEvery === 0) {
      while (d < byDiscovery.length && !fits(byDiscovery[d])) d++;
      if (d < byDiscovery.length && byDiscovery[d].discovery >= DISCOVERY_FLOOR) {
        take(byDiscovery[d], "discovery");
        continue;
      }
    }
    while (i < byScore.length && !fits(byScore[i])) i++;
    if (i < byScore.length) { take(byScore[i], "core"); continue; }
    break;
  }
  return picked;
}
