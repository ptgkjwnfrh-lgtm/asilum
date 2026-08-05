// lib/brain/popularity.js — the popularity bridge's counters (Aug 6, 2026).
//
// THE VULNERABILITY THIS CLOSES, in two directions, both crossing every user
// and both permanent:
//
//   UPWARD — POST /api/interaction pushed { id, eng: 1 } per positive action
//   with no per-identity dedup. Favouriting one item 120x/min added eng+120;
//   deltaScore's volume = eng/(eng+8) meant 8 forged engagements already beat
//   the neutral prior.
//
//   DOWNWARD, and worse — GET /api/feed wrote imp+1 for ALL 60 served items on
//   EVERY serve, while caller-controlled category/maxPrice/fit filters chose
//   WHICH items got them: ~3600 impressions/minute, aimed. novelty =
//   25/(imp+25) collapses to 0.007, permanently removing a targeted item from
//   every user's exploration and reach zones. A READ endpoint mutating global
//   ranking state. Exploration floors cannot protect a specific ITEM, which is
//   why suppression is the asymmetric risk.
//
// THE COUNTERS NOW COUNT PEOPLE, NOT EVENTS. A per-(identity,item) ledger
// makes repetition worthless: one identity is one engager and one viewer,
// forever, enforced by the primary key.
//
// WHY NOVELTY BECAME A PERCENTILE. The obvious move — keep novelty =
// K/(V+K) and feed it distinct viewers — cannot work, and the reason is
// worth stating because it is not obvious: K=25 is calibrated to an EVENT
// scale that distinct-people counting compresses by more than an order of
// magnitude. Keep K and every item sits near novelty 1.0, so epsilon
// degenerates into a second anti-similarity term and stops being an
// exposure-aware explorer. Shrink K and the price of halving a target's
// novelty becomes exactly K device cookies. Calibration and attack cost are
// the same number, so no choice of K is both useful and safe.
//
// A midrank PERCENTILE has no such constant. It is scale-free, so it cannot
// be mis-calibrated; it is relative, so suppressing one item requires
// out-viewing the pool rather than clearing an absolute bar; and on day one,
// when every count is zero, it returns 0.5 for everything — uniform and
// honest rather than a fabricated ordering.
//
// HONEST LIMIT, stated here because it belongs next to the code: this does
// NOT make suppression impossible. It raises the price of one unit of
// novelty damage from one HTTP request to one distinct signed device
// identity, and leaves the damage function unchanged. The residual risk
// concentrates on cold-start items — precisely the population epsilon exists
// to protect. Identity issuance is the control that prices the remainder.

/** Kill switch. "0" restores BOTH the raw event-count scoring AND the
 * GET /api/feed impression write, as one coupled behaviour — a switch that
 * restored only half would create a third mode nobody has ever tested. */
export function popularityDedupEnabled() {
  return process.env.BRAIN_POPULARITY_DEDUP !== "0";
}

// Delta constants are UNCHANGED IN VALUE and changed in UNIT: they now count
// people rather than events, which moves them strictly in the conservative
// direction (eight distinct people is a far higher bar than eight clicks).
// No new number is invented here.
const DELTA_VOLUME_HALF = 8;
const DELTA_RATE_OFFSET = 5;
const DELTA_PRIOR = 0.3;
// Shrinkage weight, in the same "people" unit as the evidence it shrinks.
// It replaces a BRANCH, and that matters: the old `if (!pop) return 0.3` was
// keyed on ROW ABSENCE, but the feed's own impression write created a row for
// every served item — so in production the prior was already dead and every
// item scored 0.0 instead of 0.3. Removing that write would have silently
// resurrected the prior catalog-wide, smuggling a ranking change into a
// security fix. Keying on EVIDENCE and blending removes the cliff entirely.
const DELTA_PRIOR_WEIGHT = 5;

/** Counters for one item, defaulting to the honest zero state. */
function counts(popularity, itemId) {
  const pop = popularity ? popularity[itemId] : null;
  // The legacy flag must be decided by the SWITCH, not by whether a row
  // happens to exist: an absent row under the legacy switch used to fall
  // through to the percentile path, which is null in legacy mode — a crash
  // on every feed assembly. The OFF control arm caught it.
  if (!popularityDedupEnabled()) {
    return { engagers: Number(pop?.eng) || 0, viewers: Number(pop?.imp) || 0, legacy: true, missing: !pop };
  }
  if (!pop) return { engagers: 0, viewers: 0 };
  return { engagers: Number(pop.engagers) || 0, viewers: Number(pop.viewers) || 0 };
}

/**
 * DELTA: how many distinct PEOPLE responded to this piece, blended with how
 * often the people who saw it responded. Shrunk toward the neutral prior by
 * DELTA_PRIOR_WEIGHT pseudo-people, so an item with no evidence scores the
 * prior and evidence moves it smoothly.
 */
export function deltaScore(item, popularity) {
  const { engagers, viewers, legacy, missing } = counts(popularity, item.id);
  if (legacy) {
    if (missing) return DELTA_PRIOR;
    const volume = engagers / (engagers + DELTA_VOLUME_HALF);
    const rate = Math.min(1, engagers / (viewers + DELTA_RATE_OFFSET));
    return volume * 0.6 + rate * 0.4;
  }
  const volume = engagers / (engagers + DELTA_VOLUME_HALF);
  const rate = Math.min(1, engagers / (viewers + DELTA_RATE_OFFSET));
  const measured = volume * 0.6 + rate * 0.4;
  return (engagers * measured + DELTA_PRIOR_WEIGHT * DELTA_PRIOR) / (engagers + DELTA_PRIOR_WEIGHT);
}

/**
 * Midrank percentile of exposure, inverted: 1 = least-seen, 0 = most-seen.
 * Built ONCE per popularity snapshot, not per item per assembly.
 * Ties share a midrank, so the whole catalog at zero returns 0.5 for every
 * item — uniform and honest on day one instead of an invented ordering.
 */
export function buildNoveltyIndex(popularity) {
  if (!popularityDedupEnabled()) return null; // legacy path uses the raw curve
  const ids = Object.keys(popularity || {});
  const values = ids.map((id) => Number(popularity[id]?.viewers) || 0);
  const sorted = [...values].sort((x, y) => x - y);
  const n = sorted.length;
  if (!n) return { get: () => 1 };
  // below[v] = how many strictly below v; equal[v] = how many equal to v.
  const below = new Map(), equal = new Map();
  for (let i = 0; i < n; i++) {
    const v = sorted[i];
    if (!equal.has(v)) { equal.set(v, 0); below.set(v, i); }
    equal.set(v, equal.get(v) + 1);
  }
  const rankOf = (v) => {
    if (equal.has(v)) return (below.get(v) + 0.5 * equal.get(v)) / n;
    // A value absent from the snapshot (an item outside the window): place it
    // by counting, rather than guessing.
    let lower = 0;
    for (const s of sorted) { if (s < v) lower++; else break; }
    return lower / n;
  };
  const cache = new Map();
  return {
    get(viewers) {
      const v = Number(viewers) || 0;
      if (cache.has(v)) return cache.get(v);
      const novelty = 1 - rankOf(v);
      cache.set(v, novelty);
      return novelty;
    },
  };
}

/**
 * EPSILON's exposure factor. THE ONLY implementation — the reach-zone ranking
 * previously carried its own inline copy of the curve, so a fix applied to
 * the bridge alone would have left the reach zone (the exact slots a
 * suppression attack targets) still ranking on raw impressions.
 */
export function noveltyFactor(item, popularity, noveltyIndex = null) {
  const { viewers, legacy } = counts(popularity, item.id);
  if (legacy) return 25 / (viewers + 25);
  if (noveltyIndex) return noveltyIndex.get(viewers);
  return buildNoveltyIndex(popularity).get(viewers);
}
