// lib/brain/replay.js — offline replay harness (r15).
//
// Purpose: evaluate candidate bridge-weight policies WITHOUT serving them to
// anyone. Two evaluation modes over the same deterministic simulated world:
//
//   live(policy)    — bots actually browse feeds built under the policy;
//                     their satisfaction is ground truth in the sim world.
//   replay(policy)  — bots' LOGGED sessions (recorded under the behavior
//                     policy) are held fixed; at each logged page-state the
//                     candidate feed is rebuilt and the logged outcomes are
//                     scored by where the candidate slate would have put
//                     them (rank-weighted, absent = 0). Counterfactual
//                     estimation, no new behavior invented.
//
// r15's calibration claim: replay's RANKING of policies must agree with
// live's ranking. Once that holds, r16 can search policy space offline.
//
// Determinism law: no Math.random / Date.now — a seeded PRNG (mulberry32)
// and caller-supplied seeds; identical inputs give identical outputs across
// processes. Bots judge by AFFINITY-EXPANDED latent taste (the stress-
// harness doctrine, tests/stress_test.py) — never raw persona match.

import { buildFeed, learn, markSeen, migrateProfile } from "./index.js";
import { TAGS, expandTaste } from "./tags.js";
import { vecSim, baseSplit } from "./bridges.js";
import { tunedSplit } from "./tuning.js";

// ---- deterministic PRNG -----------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- bot model --------------------------------------------------------------
// Latent taste: two anchor tags; judgment happens against the one-hop
// affinity expansion. Thresholds are fixed and declared; the seeded jitter
// only breaks ties so bots aren't clones.
const POS_T = 0.55;   // affinity ≥ → favorite
const BAG_T = 0.75;   // affinity ≥ → bag (strongest signal)
const NEG_T = 0.2;    // affinity < → fast skip
const SLOTS_VIEWED = 24; // bots read the first N slots of each page

export function makeBots(n, seed) {
  const rnd = mulberry32(seed);
  const bots = [];
  for (let i = 0; i < n; i++) {
    const t1 = TAGS[Math.floor(rnd() * TAGS.length)];
    let t2 = TAGS[Math.floor(rnd() * TAGS.length)];
    if (t2 === t1) t2 = TAGS[(TAGS.indexOf(t1) + 3) % TAGS.length];
    const latent = { [t1]: 0.9, [t2]: 0.6 };
    bots.push({ id: `bot-${i}`, latent, expanded: expandTaste(latent), jitterSeed: Math.floor(rnd() * 1e9) });
  }
  return bots;
}

function judge(bot, item, rnd) {
  const a = vecSim(item.tags || {}, bot.expanded);
  const jitter = (rnd() - 0.5) * 0.06;
  const aj = a + jitter;
  if (aj >= BAG_T) return { action: "bag", affinity: a, dwellMs: 4000 };
  if (aj >= POS_T) return { action: "favorite", affinity: a, dwellMs: 2500 };
  if (aj < NEG_T) return { action: "skip", affinity: a, dwellMs: 600 };
  return null; // considered pass — no event
}

// ---- simulated world bookkeeping (mirrors the interaction pipeline) ---------
function bumpEdges(edges, recentPositives, itemId) {
  for (const prev of recentPositives.slice(0, 5)) {
    if (prev === itemId) continue;
    (edges[prev] = edges[prev] || {})[itemId] = (edges[prev][itemId] || 0) + 1;
    (edges[itemId] = edges[itemId] || {})[prev] = (edges[itemId][prev] || 0) + 1;
  }
}

/**
 * A bot browses `pages` pages under `policy` (null = the shipped split).
 * Returns the session log + final satisfaction. The log records, per page,
 * the profile/edge state SNAPSHOT needed to rebuild that page-state feed —
 * which is what makes counterfactual replay exact rather than approximate.
 */
export function simulateSession(bot, policy, { pool, pages = 6, limit = 60, tune = false } = {}) {
  const rnd = mulberry32(bot.jitterSeed);
  let profile = { long: {}, session: {}, _meta: {} };
  const edges = {};
  const popularity = {};
  const recentPositives = [];
  const log = [];
  let positives = 0, fastSkips = 0, affinitySum = 0, viewed = 0;
  // (r16) dynamic-tuning arm: accumulate the same evidence prod accumulates
  // (whole-page bridge impressions + action-weighted engagements) and let
  // the NEXT page's blend drift through the real tunedSplit — floors, caps,
  // and evidence gates all included.
  const SIM_ACTION_W = { bag: 2, favorite: 1, skip: -1 };
  const botImp = {};
  const botEng = { eng: {}, evidence: 0 };

  for (let page = 0; page < pages; page++) {
    const tuned = tune ? tunedSplit(botImp, botEng, baseSplit()) : null;
    const stateSnapshot = {
      profile: structuredClone(profile),
      edges: structuredClone(edges),
      popularity: structuredClone(popularity),
    };
    const { items } = buildFeed({ ...stateSnapshot, splitOverride: policy || undefined, tunedSplit: tuned || undefined, limit }, pool);
    // Impressions and zone composition are always recorded — the replay and
    // invariant arms need real evidence, not reconstructions.
    const zones = { core: 0, discovery: 0, reach: 0 };
    const brandCount = {};
    const discoveryPositions = [];
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (it._bridge) botImp[it._bridge] = (botImp[it._bridge] || 0) + 1;
      zones[it._zone] = (zones[it._zone] || 0) + 1;
      brandCount[it.brand || ""] = (brandCount[it.brand || ""] || 0) + 1;
      if (it._zone === "discovery") discoveryPositions.push(idx);
    }
    const structure = {
      brandMax: Math.max(0, ...Object.values(brandCount)),
      reach: zones.reach,
      discoveryPositions,
    };
    const interactions = [];
    for (let slot = 0; slot < Math.min(SLOTS_VIEWED, items.length); slot++) {
      const it = items[slot];
      popularity[it.id] = popularity[it.id] || { eng: 0, imp: 0 };
      popularity[it.id].imp += 1;
      viewed++;
      const verdict = judge(bot, it, rnd);
      if (!verdict) continue;
      interactions.push({ itemId: it.id, action: verdict.action, affinity: verdict.affinity, bridge: it._bridge || null, slot });
      if (tune && it._bridge) {
        const w = SIM_ACTION_W[verdict.action] || 0;
        if (w) { botEng.eng[it._bridge] = (botEng.eng[it._bridge] || 0) + w; botEng.evidence += Math.abs(w); }
      }
      profile = learn(profile, it, verdict.action, { dwellMs: verdict.dwellMs });
      if (verdict.action === "bag" || verdict.action === "favorite") {
        positives++; affinitySum += verdict.affinity;
        popularity[it.id].eng += 1;
        bumpEdges(edges, recentPositives, it.id);
        recentPositives.unshift(it.id);
      } else if (verdict.action === "skip") {
        fastSkips++;
      }
    }
    profile = markSeen(profile, items.map((it) => it.id));
    log.push({ stateSnapshot, interactions, zones, structure });
  }

  // Declared satisfaction metric: engaged-affinity mass minus a skip penalty,
  // normalized by slots viewed. Same formula scores live AND replay.
  const satisfaction = viewed ? (affinitySum - 0.2 * fastSkips) / viewed : 0;
  return { botId: bot.id, log, satisfaction, positives, fastSkips, viewed, bridgeImpressions: botImp };
}

const positionWeight = (rank, limit) => (rank < 0 || rank >= limit ? 0 : 1 - rank / limit);

/**
 * Counterfactual replay: score `policy` against sessions LOGGED under the
 * behavior policy — ADVANTAGE form (amendment 1, measured 8/4): each logged
 * interaction contributes the DIFFERENCE between the candidate slate's
 * position weight for that item and the behavior slate's (the logged slot).
 * Raw position-weight scoring biased toward the behavior policy (its slates
 * cover its own outcomes perfectly); the shared term cancels in the
 * difference. The behavior policy itself scores ~0 by construction;
 * candidates score relative to it. Nothing about behavior is re-invented.
 */
export function replayEstimate(sessions, policy, { pool, limit = 60 } = {}) {
  let score = 0, n = 0;
  for (const session of sessions) {
    for (const pageLog of session.log) {
      const { items } = buildFeed({ ...structuredClone(pageLog.stateSnapshot), splitOverride: policy || undefined, limit }, pool);
      const rankOf = new Map(items.map((it, i) => [it.id, i]));
      for (const ix of pageLog.interactions) {
        const wCand = positionWeight(rankOf.has(ix.itemId) ? rankOf.get(ix.itemId) : -1, limit);
        const wBehavior = positionWeight(ix.slot, limit);
        const adv = wCand - wBehavior;
        if (ix.action === "bag" || ix.action === "favorite") { score += adv * ix.affinity; n++; }
        else if (ix.action === "skip") { score -= 0.2 * adv; n++; }
      }
    }
  }
  return n ? score / n : 0;
}

/** Rank agreement between two policy→score maps: pairwise order matches. */
export function rankAgreement(a, b) {
  const names = Object.keys(a);
  let agree = 0, pairs = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    pairs++;
    const da = Math.sign(a[names[i]] - a[names[j]]);
    const db = Math.sign(b[names[i]] - b[names[j]]);
    if (da === db) agree++;
  }
  return pairs ? agree / pairs : 1;
}
