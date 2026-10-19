// lib/brain/distribution.js — distributional-health metrics (r23, audit #12).
//
// The engine had exactly two diversity laws — brand cap ≤ 2 and zone counts —
// both of which are PER-PAGE and STRUCTURAL. Nothing measured what the feed
// does to a catalog or to a person over time:
//
//   · popularity feedback — the delta bridge ranks by what people engaged
//     with, and then decides what people see. That is a loop, and a loop with
//     positive gain concentrates. Nothing iterated serve → engage → re-serve,
//     so nothing could observe the gain.
//   · calibration — a feed can score well on affinity while systematically
//     over-serving one part of a person's taste. Alignment says "close to
//     what they like"; calibration says "in the PROPORTIONS they like it".
//     They come apart precisely when a bridge over-weights one aesthetic.
//   · time to alignment — how many pages a cold reader waits. Nothing
//     reported it, though the per-page state to compute it was already in
//     every session log.
//
// These functions are pure and take plain data, so the battery can assert the
// metric itself (a metric nobody checks is another unasserted implementation)
// and a script can run them over a simulated population.

/**
 * Gini coefficient of a value list — 0 = perfectly even, 1 = one item takes
 * everything. Zeros are INCLUDED on purpose: an engine that shows 60 of 915
 * items is concentrated even if those 60 share exposure evenly, and dropping
 * the unseen tail is the classic way to make that look healthy.
 */
export function gini(values) {
  const xs = values.slice().sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return 0;
  const total = xs.reduce((s, x) => s + x, 0);
  if (total <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/** Share of total exposure taken by the top `frac` of items (default decile). */
export function topShare(values, frac = 0.1) {
  const xs = values.slice().sort((a, b) => b - a);
  const total = xs.reduce((s, x) => s + x, 0);
  if (total <= 0) return 0;
  const k = Math.max(1, Math.round(xs.length * frac));
  return xs.slice(0, k).reduce((s, x) => s + x, 0) / total;
}

/** Impression counts for EVERY pool item, unseen ones included as zero. */
export function exposureVector(pool, popularity) {
  return pool.map((it) => (popularity[it.id] ? popularity[it.id].imp : 0));
}

/** L1-normalize a tag→weight map; negative weights are floored at 0. */
export function normalizeMass(vec) {
  const out = {};
  let total = 0;
  for (const k in vec) {
    const v = Math.max(0, vec[k] || 0);
    if (v > 0) { out[k] = v; total += v; }
  }
  if (!total) return {};
  for (const k in out) out[k] /= total;
  return out;
}

/** Summed tag mass of a slate of items. */
export function slateMass(items) {
  const mass = {};
  for (const it of items) {
    for (const k in it.tags || {}) mass[k] = (mass[k] || 0) + it.tags[k];
  }
  return mass;
}

/**
 * Calibration error: L1 distance between the served tag distribution and the
 * reader's own taste distribution, both normalized to sum 1. Range 0..2;
 * 0 = the feed's mix of aesthetics matches the person's mix exactly.
 *
 * This is deliberately NOT affinity. A feed that serves one aesthetic the
 * reader loves scores high on affinity and badly here, which is the failure
 * mode a popularity loop actually produces.
 */
export function calibrationError(items, taste) {
  const a = normalizeMass(slateMass(items));
  const b = normalizeMass(taste);
  if (!Object.keys(b).length) return null; // a cold reader has no proportions to match
  let d = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[k] || 0) - (b[k] || 0));
  return d;
}

/**
 * Pages a cold reader waits before its served top-`k` reaches `threshold`
 * mean affinity to its latent taste. Returns null if it never gets there —
 * null is a REAL result and must be reported, not coerced to the page count.
 */
export function pagesToAlignment(curve, threshold) {
  for (let i = 0; i < curve.length; i++) if (curve[i] >= threshold) return i + 1;
  return null;
}
