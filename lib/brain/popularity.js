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

// ---- (r25) TIME-DECAYED EVIDENCE -------------------------------------------
//
// THE DEFECT. The counters above count people, and they count them FOREVER.
// volume = engagers/(engagers+8) saturates on LIFETIME distinct people with no
// recency term, so — measured — an item with 10 engagers scores delta 0.5000
// permanently and beats a currently-hot 5-engager item at 0.3654 for the rest
// of the catalog's life, no matter when those ten people engaged or whether
// anyone has touched it since. The ledger is monotone by construction
// (`engaged = engaged OR EXCLUDED.engaged`), and although the schema stores
// first_seen per contributor, nothing ever read it for scoring.
//
// That is a permanent head-start for whatever happened to be engaged with
// first. On a pre-launch synthetic catalog it is invisible; it becomes a
// structural monoculture pressure the moment real traffic accumulates, and it
// is the one part of the popularity design that gets WORSE with time rather
// than better.
//
// THE FIX. Evidence ages. An engagement counts for exp(-age / tau) of a
// person instead of a whole one:
//
//     decayed(t) = SUM over contributors of exp(-(t - first_seen) / tau)
//
// Two properties make this cheap and exact rather than approximate:
//
//   1. IT FACTORS. Because exp(-(t2 - t_i)/tau) = exp(-(t2 - t1)/tau) *
//      exp(-(t1 - t_i)/tau), a sum computed at t1 can be carried to any later
//      t2 by ONE multiplication. So the aggregate is materialized on write
//      (when the ledger is being read anyway) and aged at read time by a
//      single factor. No per-read scan over the ledger, and no drift: the
//      materialized value is recomputed from the ledger on every touch.
//   2. IT IS UNIT-COMPATIBLE. The result is still "people", now
//      recency-weighted, so DELTA_VOLUME_HALF = 8 and DELTA_RATE_OFFSET = 5
//      keep their meaning and move strictly in the conservative direction —
//      eight RECENT people is a higher bar than eight people ever. No new
//      calibration constant is invented, exactly as v23 declined to invent one.
//
// A SIDE EFFECT WORTH NAMING: novelty reads decayed viewers too, so the
// suppression residual that v23 documented as an honest limit now HEALS. An
// attacker who spends N identities to bury an item buys a suppression that
// fades on the same half-life instead of lasting forever. That is a security
// improvement arriving as a consequence of a ranking fix, not a claim this
// round set out to make.
//
// HALF-LIFE, DECLARED: 30 days. Chosen against the two neighbours already in
// the system rather than picked from the air — user taste decays on a 6-day
// half-life (lib/brain/memory.js) because a person's mood turns over in days,
// while a garment's standing in a crowd turns over in seasons. 30 days keeps
// roughly a quarter of last quarter's evidence alive and is tunable without a
// deploy. It is NOT calibrated against outcome data, because no real traffic
// exists to calibrate against; that is stated here rather than implied.

/** Kill switch, independent of the dedup switch: "0" restores lifetime
 * counting exactly. The two are separate because they are separate claims —
 * one is about who is counted, this one is about when. */
export function popularityDecayEnabled() {
  return process.env.BRAIN_POPULARITY_DECAY !== "0";
}

export const DEFAULT_HALF_LIFE_DAYS = 30;

/** Half-life in ms. Env-tunable; a non-positive or unparseable value falls
 * back to the declared default rather than disabling decay silently. */
export function halfLifeMs() {
  const d = Number(process.env.POPULARITY_HALF_LIFE_DAYS);
  const days = Number.isFinite(d) && d > 0 ? d : DEFAULT_HALF_LIFE_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/** How much a piece of evidence of this age is still worth. Ages before the
 * reference point (clock skew, a backdated row) are clamped to 1 — evidence
 * must never be worth MORE than fresh. */
export function decayFactor(ageMs, hl = halfLifeMs()) {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  return Math.pow(0.5, ageMs / hl);
}

/** The definition: recency-weighted count of contributors, from their
 * timestamps. Both storage backends compute this same sum. */
export function decayedSum(timestamps, nowMs, hl = halfLifeMs()) {
  let total = 0;
  for (const t of timestamps || []) {
    const at = Number(t);
    if (!Number.isFinite(at)) continue;
    total += decayFactor(nowMs - at, hl);
  }
  return total;
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
  // (r25) Prefer recency-weighted evidence when the storage layer supplies it.
  // A row written before the v25 migration carries no decayed fields, and its
  // lifetime counts are used unchanged — an unaged count is a worse answer
  // than an aged one, but it is a HONEST worse answer, where substituting zero
  // would silently delete evidence the system really has.
  if (popularityDecayEnabled()
      && Number.isFinite(Number(pop.engagersDecayed))
      && Number.isFinite(Number(pop.viewersDecayed))) {
    return { engagers: Number(pop.engagersDecayed), viewers: Number(pop.viewersDecayed), decayed: true };
  }
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
  // (r25) MUST read the same source noveltyFactor looks up with. Building the
  // distribution from lifetime viewers and then querying it with a DECAYED
  // viewer count would place every item against the wrong scale — a silent
  // mis-percentile, not an error. One accessor, both sides.
  const values = ids.map((id) => counts(popularity, id).viewers);
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
