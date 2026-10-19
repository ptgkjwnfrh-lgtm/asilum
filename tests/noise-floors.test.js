// tests/noise-floors.test.js — resampled noise floors (r26, audit #26).
//
// A noise floor is the number that decides whether every other number in a
// battery counts. If it is wrong, nothing downstream is checkable — the
// battery still prints a verdict, and the verdict is arbitrary. So the
// estimator gets the same treatment the things it judges get: known-answer
// cases, a stability comparison against the estimator it replaces, and a
// determinism law.
//
// The load-bearing claim is NOT "resampling is more accurate" — a single
// half-split is unbiased too. It is that a single draw is UNSTABLE, and that
// instability is invisible because each battery only ever draws once.

import test from "node:test";
import assert from "node:assert/strict";

import {
  seededShuffle, stdev, percentile, resampledSigma, resampledPairSigma,
  singleSplitNoise, perSubjectThreshold, DEFAULT_ROUNDS,
} from "../lib/brain/noise.js";
import { mulberry32 } from "../lib/brain/replay.js";

const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// ---- the primitives ---------------------------------------------------------

test("stdev and percentile against known answers", () => {
  // sample sd (n-1) of 2,4,4,4,5,5,7,9 is sqrt(32/7)
  assert.equal(+stdev([2, 4, 4, 4, 5, 5, 7, 9]).toFixed(6), +Math.sqrt(32 / 7).toFixed(6));
  assert.equal(+stdev([5, 5, 5, 5]).toFixed(9), 0, "no spread is zero spread");
  assert.equal(stdev([]), 0);
  assert.equal(stdev([1]), 0, "one sample has no sample standard deviation");
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
  assert.equal(percentile([3], 0.5), 3);
  assert.equal(percentile([], 0.5), 0);
});

test("seededShuffle is a permutation, deterministic, and actually shuffles", () => {
  const items = series(50, (i) => i);
  const a = seededShuffle(items, 7);
  const b = seededShuffle(items, 7);
  assert.deepEqual(a, b, "same seed, same order");
  assert.deepEqual(a.slice().sort((x, y) => x - y), items, "must be a permutation, losing nothing");
  assert.notDeepEqual(a, items, "a shuffle that returns the input order is not a shuffle");
  assert.notDeepEqual(seededShuffle(items, 8), a, "different seeds must differ");
  assert.deepEqual(items, series(50, (i) => i), "the input array must not be mutated");
});

// ---- the claim: single draws are unstable -----------------------------------

test("THE DEFECT: one half-split is an erratic estimate of its own distribution", () => {
  // Pure noise, no signal: any honest floor should report a similar width
  // whatever the draw. The single-draw estimator does not.
  const draws = [];
  const resampled = [];
  for (let s = 0; s < 40; s++) {
    const rnd = mulberry32(1000 + s);
    const values = series(60, () => rnd());
    draws.push(singleSplitNoise(values));
    resampled.push(resampledSigma(values, { seed: 5 }));
  }
  const spread = (xs) => Math.max(...xs) / Math.max(1e-12, Math.min(...xs));
  assert.ok(spread(draws) > 10,
    `single draws must be shown to swing wildly on identical-in-distribution data (ratio ${spread(draws).toFixed(1)})`);
  assert.ok(spread(resampled) < spread(draws) / 3,
    `the resampled estimate must be far steadier: ${spread(resampled).toFixed(1)} vs ${spread(draws).toFixed(1)}`);
});

test("resampledSigma tracks the true scale — double the spread, double the sigma", () => {
  const rnd = mulberry32(99);
  const base = series(200, () => rnd() - 0.5);
  const a = resampledSigma(base, { seed: 3 });
  const b = resampledSigma(base.map((x) => x * 2), { seed: 3 });
  assert.ok(Math.abs(b / a - 2) < 0.05, `sigma must scale linearly: ratio ${(b / a).toFixed(4)}`);
  assert.equal(resampledSigma(series(80, () => 5), { seed: 3 }), 0, "a constant series has no noise");
});

test("resampledPairSigma keeps subjects paired — an offset copy has no pair noise", () => {
  const rnd = mulberry32(4242);
  const a = series(120, () => rnd());
  // b is a's exact translate: every subject moves by the same amount, so the
  // CONTRAST has zero variance even though each series is noisy. An unpaired
  // resample would report the between-subject spread instead and swamp the
  // real effect.
  const b = a.map((x) => x + 0.25);
  assert.ok(resampledPairSigma(a, b, { seed: 11 }) < 1e-12,
    "a constant shift must produce no pair noise");
  assert.ok(resampledSigma(a, { seed: 11 }) > 0.01,
    "...while the series itself is genuinely noisy — which is the trap");
});

test("estimators refuse to invent a number from too little data", () => {
  assert.equal(resampledSigma([1, 2, 3], { seed: 1 }), 0);
  assert.equal(resampledPairSigma([1, 2], [1, 2], { seed: 1 }), 0);
  assert.equal(singleSplitNoise([1]), 0);
  assert.equal(perSubjectThreshold([1, 2], { fallback: 0.5 }), 0.5, "falls back rather than guessing");
});

test("perSubjectThreshold is a magnitude percentile of the control deltas", () => {
  const deltas = [-0.5, -0.4, 0.1, 0.2, -0.05, 0.3, -0.2, 0.45, 0.02, -0.01];
  const t = perSubjectThreshold(deltas, { p: 0.9 });
  const mags = deltas.map(Math.abs).sort((a, b) => a - b);
  assert.equal(t, mags[8], "p90 of ten magnitudes is the ninth");
  assert.ok(t > 0);
});

// ---- determinism ------------------------------------------------------------

test("every estimator is deterministic — the batteries' determinism law", () => {
  const rnd = mulberry32(7);
  const a = series(100, () => rnd());
  const rnd2 = mulberry32(8);
  const b = series(100, () => rnd2());
  for (let i = 0; i < 3; i++) {
    assert.equal(resampledSigma(a, { seed: 2 }), resampledSigma(a, { seed: 2 }));
    assert.equal(resampledPairSigma(a, b, { seed: 2 }), resampledPairSigma(a, b, { seed: 2 }));
  }
  assert.notEqual(resampledSigma(a, { seed: 2 }), resampledSigma(a, { seed: 3 }),
    "different resample seeds should differ — otherwise the seed is not being used");
});

test("the round count is calibrated, and its residual error is bounded", () => {
  // The first guess of 25 rounds FAILED this test at 29% off, which is what
  // sent me to sweep it: worst-case deviation from a 1600-round reference over
  // 24 datasets x 3 seeds was 41.9% at 25 rounds, 18.6% at 100. The bound
  // asserted here is 25% — margin over the 18.6% that was measured, without
  // being so wide that a regression in the estimator could hide under it.
  assert.equal(DEFAULT_ROUNDS, 100);
  let worst = 0;
  for (let d = 0; d < 12; d++) {
    const rnd = mulberry32(500 + d * 13);
    const values = series(d % 2 ? 60 : 120, () => rnd());
    for (const seed of [1, 4, 26]) {
      const ref = resampledSigma(values, { seed, rounds: 1600 });
      worst = Math.max(worst, Math.abs(resampledSigma(values, { seed }) / ref - 1));
    }
  }
  assert.ok(worst < 0.25, `worst deviation from a converged reference was ${(worst * 100).toFixed(1)}%`);
});
