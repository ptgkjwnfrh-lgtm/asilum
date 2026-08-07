// lib/brain/noise.js — noise-floor estimators for the measurement batteries
// (r26, audit #26).
//
// THE DEFECT. Every battery in the repo estimated its own noise floor from
// exactly ONE deterministic half-split:
//
//     noise = |mean(first half) − mean(second half)|
//
// That is a single draw from a distribution, used as if it were that
// distribution's width. It is unbiased for nothing in particular: on one seed
// the two halves happen to land close and the floor collapses toward zero
// (everything reads as decided/degraded), on the next they land apart and the
// floor swallows real effects. Nothing about it is wrong on average — the
// problem is that no battery ever runs it on average. Each runs it once and
// treats the answer as the scale of sampling noise.
//
// The consequences were not symmetric, and both directions were live:
//   · measure-replay classified policy pairs decided/undecided at 2x that one
//     draw, and UNDECIDED PAIRS ARE NEVER SCORED. An over-wide floor therefore
//     shrinks the evidence base silently, with no criterion to trip.
//   · measure-tuning computed a COHORT-MEAN floor — a sigma/sqrt(n)-scale
//     quantity — and applied it as a PER-BOT threshold. Those are different
//     scales by a factor of sqrt(60), so "degraded" mostly counted the
//     behavioural divergence any two arms produce, not minority harm.
//
// THE FIX. Both harnesses are deterministic and cheap, so the distribution can
// simply be sampled: R seeded shuffles, a half-split difference from each, and
// the SPREAD of those differences as the floor. No wall clock, no Math.random
// — the shuffle is driven by the same mulberry32 the bot world uses, so a
// battery is still byte-identical run to run.
//
// A NOTE ON DIRECTION, because this round can only be read honestly with it in
// view: replacing a single draw with a stable estimate MOVES PASS/FAIL
// BOUNDARIES, so it has to prove it is not laundering a failure into a pass.
//
// I expected the per-bot fix to loosen measure-tuning's degradation criterion
// uniformly — the sqrt(n) argument says the old cohort-mean threshold was ~7.7x
// too small as a per-bot number. MEASURED, that is wrong. Because the old floor
// came from ONE draw it was erratic rather than biased: over four bot seeds it
// ranged 0.00675 to 0.04195, a 6x spread, landing both above and below the
// per-bot band, and the degraded count moves in BOTH directions when replaced
// (1->2, 0->1, 0->2, 3->2). The defect being fixed is instability, not a
// systematic direction — which is a better reason to fix it, and a different
// one from the one this round started with.
//
// scripts/measure-noise-stability.mjs carries the proof either way: it reports
// every verdict under both estimators across several bot seeds, states any
// flip, and checks that the new band still fails a policy that genuinely harms
// bots (it flags epsilon-heavy at 98-100% degraded against a 25% cap).

import { mulberry32 } from "./replay.js";

/** Fisher-Yates against a seeded PRNG. Returns a new array. */
export function seededShuffle(items, seed) {
  const rnd = mulberry32(seed >>> 0);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Sample standard deviation (n−1). Zero for fewer than two values. */
export function stdev(xs) {
  if (!xs || xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

export function percentile(xs, p) {
  if (!xs || !xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}

/**
 * Rounds, CALIBRATED rather than picked. Worst-case deviation of the estimate
 * from a 1600-round reference, swept over 24 datasets x 3 resample seeds:
 *
 *     rounds   25 -> 41.9%     50 -> 27.4%     100 -> 18.6%     200 -> 17.2%
 *
 * 25 (the first guess) was not good enough — a battery's threshold is 2x this
 * number, so a 42% error moves a pass/fail boundary by 42%. 100 halves that
 * and 200 buys almost nothing, so 100 is where the curve flattens.
 *
 * The residual is stated rather than hidden: this estimate can still be ~19%
 * off in the worst case. That is the honest comparison — not "accurate", but
 * an order of magnitude steadier than the single draw it replaces, which
 * swings by more than 10x on identical-in-distribution data
 * (tests/noise-floors.test.js).
 */
export const DEFAULT_ROUNDS = 100;

/**
 * The floor, resampled: split `values` in half R times under different seeded
 * shuffles, take the difference of half-means each time, return the spread.
 *
 * Returns the STANDARD DEVIATION of that difference rather than its mean
 * absolute value, because the batteries' rule of thumb is "beyond 2x noise" —
 * a two-sigma rule needs a sigma, and |D| from one draw is neither.
 */
export function resampledSigma(values, { seed = 1, rounds = DEFAULT_ROUNDS } = {}) {
  if (!values || values.length < 4) return 0;
  const half = values.length >> 1;
  const diffs = [];
  for (let r = 0; r < rounds; r++) {
    const shuffled = seededShuffle(values, seed + r * 7919);
    diffs.push(mean(shuffled.slice(0, half)) - mean(shuffled.slice(half)));
  }
  return stdev(diffs);
}

/**
 * The same, for a DIFFERENCE of two per-subject series (policy A minus policy
 * B, arm-on minus arm-off). The pairing is preserved through the shuffle: a
 * subject's two values move together, which is the whole point — an unpaired
 * resample would measure between-subject spread instead of the spread of the
 * contrast under test.
 */
export function resampledPairSigma(a, b, { seed = 1, rounds = DEFAULT_ROUNDS } = {}) {
  const n = Math.min(a?.length || 0, b?.length || 0);
  if (n < 4) return 0;
  const paired = Array.from({ length: n }, (_, i) => [a[i], b[i]]);
  const half = n >> 1;
  const diffs = [];
  for (let r = 0; r < rounds; r++) {
    const s = seededShuffle(paired, seed + r * 7919);
    const dA = mean(s.slice(0, half).map((p) => p[0])) - mean(s.slice(half).map((p) => p[0]));
    const dB = mean(s.slice(0, half).map((p) => p[1])) - mean(s.slice(half).map((p) => p[1]));
    diffs.push(dA - dB);
  }
  return stdev(diffs);
}

/**
 * The pre-r26 estimator, kept and EXPORTED on purpose: every claim this round
 * makes is a comparison against it, and a battery that cannot still compute
 * the old number cannot demonstrate what changed.
 */
export function singleSplitNoise(values) {
  if (!values || values.length < 2) return 0;
  const half = values.length >> 1;
  return Math.abs(mean(values.slice(0, half)) - mean(values.slice(half)));
}

/**
 * A PER-SUBJECT threshold, which is a different quantity from a cohort floor
 * and was the second half of the defect. Given the per-subject differences a
 * behaviourally NEUTRAL change produces (a control arm), the threshold is the
 * p-th percentile of their magnitudes: a subject counts as harmed only when it
 * loses more than a signal-free change of comparable magnitude would cost it.
 *
 * Falls back to the cohort sigma when no control is supplied, so a caller that
 * has not built a control arm degrades to something explicable rather than to
 * zero.
 */
export function perSubjectThreshold(controlDeltas, { p = 0.9, fallback = 0 } = {}) {
  if (!controlDeltas || controlDeltas.length < 4) return fallback;
  return percentile(controlDeltas.map(Math.abs), p);
}
