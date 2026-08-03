// lib/brain/index.js
// The orchestrator. Ties tags + lexicon + knowledge base + bridges into a
// single "brain" that can resolve any token (word, designer, era, mood, or
// non-clothing concept) into a tag vector, deduce a product profile, rank a
// feed, and learn from user interactions.
//
// LEARNING MODEL (two timescales, TikTok-style):
//   profile = {
//     long:    { TAG: w },   // long-term taste; decays slowly
//     session: { TAG: w },   // in-the-moment interest; learns fast, fades fast
//     _meta:   { streak, streakTag, dir, fatigue,
//                recent: [itemIds],  // last engaged items (graph anchors)
//                seen:   [itemIds] } // recently served items (feed rotation)
//   }
// Older flat profiles are migrated on read. The scoring taste vector is a
// blend of long + session, so a burst of interest shifts the feed immediately
// without wiping out long-term taste.

import { TAGS, zeroVec, tagSim } from "./tags.js";
import { lexiconVector } from "./lexicon.js";
import { kbResolve, tagsToVec } from "./kb.js";
import { activeSplit, assembleFeed } from "./bridges.js";
import { CATALOG, catalogByAffinity } from "../ingest/catalog.js";

// ---- Tuning knobs (kept few on purpose) --------------------------------
const LONG_DECAY = 0.98;        // long-term taste fades gently
const SESSION_DECAY = 0.82;     // session interest fades fast
const SESSION_RATE = 2.5;       // session learns this much faster than long-term
const TASTE_LONG = 0.6;         // blend: long-term share of the taste vector
const TASTE_SESSION = 0.4;      //        session share
const HALO = 0.35;              // how much a strong positive bleeds into adjacent tags
const MOMENTUM_BOOST = 0.15;    // temporary lean toward a hot streak tag
const STREAK_TRIGGER = 3;       // consecutive same-direction hits = "on a roll"
const FATIGUE_TRIGGER = 3;      // consecutive skips / dry spell = "bored"
const SKIP_BETA_PENALTY = 0.2;  // extra deduction from a skipped item's top tag
const FAST_SKIP_MS = 1200;      // skipped faster than this = strong rejection
const FAST_SKIP_MULT = 1.75;
const DWELL_MAX_W = 0.12;       // dwell weight saturates here...
const DWELL_SAT_MS = 8000;      // ...after this much viewing time
const RECENT_CAP = 20;          // engaged-item ids kept as graph anchors
const SEEN_CAP = 200;           // served-item ids kept for feed rotation
const FEED_LIMIT = 60;          // max items returned per feed build

// Engagement hierarchy: bag intent beats sharing beats saving beats liking.
const ACTION_WEIGHT = {
  bag: 0.7,
  share: 0.6,
  save: 0.5,
  favorite: 0.4,
  dwell: 0,        // computed from dwellMs
  skip: -0.15,
  hide: -0.5,
};
const STRONG_POSITIVE = new Set(["bag", "favorite", "save", "share"]);

// ---- Profile shape -------------------------------------------------------

// Migrate any stored profile (old flat vector or v2) into the v2 shape.
export function migrateProfile(raw) {
  const meta = { streak: 0, streakTag: null, dir: 0, fatigue: 0, recent: [], seen: [] };
  if (!raw) return { long: {}, session: {}, _meta: meta };
  if (raw.long || raw.session) {
    return {
      long: { ...(raw.long || {}) },
      session: { ...(raw.session || {}) },
      _meta: { ...meta, ...(raw._meta || {}) },
    };
  }
  // Old flat shape: tag keys at the top level + optional _meta.
  const long = {};
  for (const k in raw) if (k.charAt(0) !== "_") long[k] = raw[k];
  return { long, session: {}, _meta: { ...meta, ...(raw._meta || {}) } };
}

// Blend long-term + session into the single taste vector used for scoring.
export function tasteVector(profile) {
  const p = profile.long ? profile : migrateProfile(profile);
  const taste = {};
  for (const k in p.long) taste[k] = p.long[k] * TASTE_LONG;
  for (const k in p.session) taste[k] = (taste[k] || 0) + p.session[k] * TASTE_SESSION;
  for (const k in taste) {
    if (taste[k] > 1) taste[k] = 1;
    if (taste[k] < -1) taste[k] = -1;
  }
  return taste;
}

// ---- Token resolution -----------------------------------------------------

// Resolve a single token into a tag vector, trying knowledge base first
// (designers/genres/eras), then the non-clothing lexicon, then a neutral vec.
export function resolveToken(token) {
  const kb = kbResolve(token);
  if (kb) return tagsToVec(kb.tags);
  return lexiconVector(token) || zeroVec();
}

// Combine many tokens (a query, a moodboard, a caption) into one profile.
export function deduceProduct(tokens = []) {
  const vec = zeroVec();
  let n = 0;
  for (const tok of tokens) {
    const v = resolveToken(tok);
    let has = false;
    for (const k in v) if (v[k]) { vec[k] += v[k]; has = true; }
    if (has) n++;
  }
  if (n > 0) for (const k in vec) vec[k] /= n;
  return vec;
}

// Return the single strongest tag on an item (the "beta" signal).
function dominantTag(item) {
  const t = item && item.tags ? item.tags : {};
  let best = null, bestV = 0;
  for (const k in t) {
    if (t[k] > bestV) { bestV = t[k]; best = k; }
  }
  return best;
}

// ---- Learning loop ---------------------------------------------------------
// Update the profile from a single interaction.
// action in {"share","save","favorite","dwell","skip","hide"};
// opts.dwellMs scales dwell weight and detects fast skips.

export function learn(profile, item, action, opts = {}) {
  const p = migrateProfile(profile);
  const meta = p._meta;
  if (!item || !item.tags) return p;

  let w = ACTION_WEIGHT[action] ?? 0;
  if (action === "dwell") {
    w = DWELL_MAX_W * Math.min(1, (opts.dwellMs || 0) / DWELL_SAT_MS);
    if (w <= 0) return p;
  }
  // A fast skip is a much stronger "not for me" than a considered pass.
  if (action === "skip" && opts.dwellMs != null && opts.dwellMs < FAST_SKIP_MS) {
    w *= FAST_SKIP_MULT;
  }

  // Recency decay: old taste fades a little before the new signal lands.
  for (const k in p.long) p.long[k] *= LONG_DECAY;
  for (const k in p.session) p.session[k] *= SESSION_DECAY;

  // Fold the interaction across the item's tags — session learns faster.
  for (const k in item.tags) {
    p.long[k] = (p.long[k] || 0) + item.tags[k] * w;
    p.session[k] = (p.session[k] || 0) + item.tags[k] * w * SESSION_RATE;
  }

  // Halo: a strong positive also nudges long-term tags that are aesthetically
  // adjacent (via the tag-affinity matrix), so the brain generalizes like a
  // stylist instead of a keyword matcher.
  if (STRONG_POSITIVE.has(action)) {
    for (const itemTag in item.tags) {
      const strength = item.tags[itemTag];
      for (const cand of TAGS) {
        if (cand === itemTag) continue;
        const sim = tagSim(itemTag, cand);
        if (sim > 0) p.long[cand] = (p.long[cand] || 0) + strength * w * HALO * sim;
      }
    }
  }

  // Skip deducts extra from the dominant tag -> pushes back on the beta signal.
  const dom = dominantTag(item);
  if (action === "skip" && dom) {
    p.long[dom] = (p.long[dom] || 0) - SKIP_BETA_PENALTY;
    p.session[dom] = (p.session[dom] || 0) - SKIP_BETA_PENALTY * SESSION_RATE;
  }

  // Clamp every tag into [-1, 1] so one interaction can't dominate.
  for (const vec of [p.long, p.session]) {
    for (const k in vec) {
      if (vec[k] > 1) vec[k] = 1;
      if (vec[k] < -1) vec[k] = -1;
    }
  }

  // ---- Momentum + fatigue + graph-anchor bookkeeping ----
  if (STRONG_POSITIVE.has(action)) {
    if (dom && dom === meta.streakTag && meta.dir > 0) meta.streak += 1;
    else if (dom) { meta.streak = 1; meta.streakTag = dom; }
    meta.dir = 1;
    meta.fatigue = 0;
    meta.recent = [item.id, ...(meta.recent || []).filter((id) => id !== item.id)].slice(0, RECENT_CAP);
  } else if (action === "skip" || action === "hide") {
    meta.dir = -1;
    meta.fatigue = (meta.fatigue || 0) + 1;
  }

  return p;
}

// ---- Feed building -----------------------------------------------------------
// state = { profile, epsilonActive:bool, edges:{}, popularity:{}, boardVec:{}, limit }
// `edges` is the co-engagement neighborhood of profile._meta.recent;
// `popularity` is the global engagement/impression map;
// `boardVec` (optional) seeds/blends taste from a shared moodboard link.

export function buildFeed(state = {}, pool = CATALOG) {
  const p = migrateProfile(state.profile);
  const meta = p._meta;

  // Fatigue-aware epsilon: fire exploration automatically when the user seems
  // bored (a run of skips / no recent favorites), even if the toggle is off.
  const epsilonAuto = (meta.fatigue || 0) >= FATIGUE_TRIGGER;
  const epsilonActive = !!state.epsilonActive || epsilonAuto;
  const safeMode = state.novelty === "safe";
  const split = activeSplit(epsilonActive, safeMode);

  // Taste = blended long+session, with a momentum boost on a hot streak.
  const taste = tasteVector(p);
  if ((meta.streak || 0) >= STREAK_TRIGGER && meta.streakTag) {
    taste[meta.streakTag] = Math.min(1, (taste[meta.streakTag] || 0) + MOMENTUM_BOOST);
  }

  // A current craving is an ephemeral overlay, not durable learning. It gets
  // the deciding vote for this feed while retaining a thread of stable taste.
  const contextVec = state.contextVec || null;
  if (contextVec && Object.keys(contextVec).length) {
    const hasStableTaste = Object.keys(taste).length > 0;
    for (const k of new Set([...Object.keys(taste), ...Object.keys(contextVec)])) {
      taste[k] = hasStableTaste
        ? (taste[k] || 0) * 0.4 + (contextVec[k] || 0) * 0.6
        : contextVec[k] || 0;
    }
  }

  // Taste transfer: a shared board blends into (or seeds) the taste vector.
  if (state.boardVec) {
    const own = Object.keys(taste).length > 0;
    for (const k in state.boardVec) {
      taste[k] = own ? (taste[k] || 0) * 0.5 + state.boardVec[k] * 0.5 : state.boardVec[k];
    }
  }

  const items = assembleFeed(pool, taste, {
    epsilonActive,
    safeMode,
    recent: meta.recent || [],
    seen: new Set(meta.seen || []),
    edges: state.edges || {},
    popularity: state.popularity || {},
    contextVec,
    crossUser: state.crossUser || null,
    limit: state.limit || FEED_LIMIT,
  });
  const zones = { core: 0, discovery: 0, reach: 0 };
  for (const it of items) zones[it._zone] = (zones[it._zone] || 0) + 1;
  return { split, items, epsilonActive, epsilonAuto, safeMode, zones };
}

// Record served item ids on the profile (feed rotation memory). Returns the
// updated profile for the caller to persist.
export function markSeen(profile, itemIds = []) {
  const p = migrateProfile(profile);
  p._meta.seen = [...itemIds, ...(p._meta.seen || [])].slice(0, SEEN_CAP);
  return p;
}

// ---- Related items (Pinterest-style "more like this") -------------------------
// Graph neighbors first (people who saved this also saved...), then tag-similar
// catalog items to fill out the row when the graph is still sparse.

export function relatedItems(sourceItem, { edges, pool = CATALOG, limit = 8 } = {}) {
  const out = [];
  const seen = new Set([sourceItem.id]);
  const byId = new Map(pool.map((it) => [it.id, it]));

  const nbrs = edges && edges[sourceItem.id] ? edges[sourceItem.id] : {};
  const ranked = Object.entries(nbrs).sort((a, b) => b[1] - a[1]);
  for (const [id] of ranked) {
    const it = byId.get(id);
    if (it && !seen.has(id)) { out.push({ ...it, _via: "graph" }); seen.add(id); }
    if (out.length >= limit) return out;
  }
  const tagRanked = pool
    .filter((it) => !seen.has(it.id))
    .map((it) => ({
      item: it,
      score: Object.entries(it.tags || {}).reduce(
        (sum, [tag, weight]) => sum + (sourceItem.tags?.[tag] || 0) * (Number(weight) || 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2)
    .map((entry) => entry.item);
  for (const it of tagRanked) {
    if (!seen.has(it.id)) { out.push({ ...it, _via: "tags" }); seen.add(it.id); }
    if (out.length >= limit) break;
  }
  return out;
}

// Mean tag vector of a set of items (used to turn a board into taste).
export function itemsVector(items = []) {
  const vec = {};
  if (!items.length) return vec;
  for (const it of items) {
    for (const k in it.tags || {}) vec[k] = (vec[k] || 0) + it.tags[k];
  }
  for (const k in vec) vec[k] = Math.min(1, vec[k] / items.length);
  return vec;
}

// ---- Cold start ----------------------------------------------------------------
// Seed a feed from a text prompt.
export function coldStart(promptText = "") {
  const tokens = String(promptText)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const profile = deduceProduct(tokens);
  const items = catalogByAffinity(profile, 8);
  return { profile, items };
}
