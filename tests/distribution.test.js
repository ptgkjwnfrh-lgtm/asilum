// tests/distribution.test.js — distributional-health metrics (r23, audit #12).
//
// Two layers, because the failure this battery exists to prevent lives in
// both:
//
//   1. THE METRICS THEMSELVES, against closed-form cases. `measure-
//      distribution.mjs` is the only caller, so an unasserted metric here is
//      an unasserted implementation exactly like the simulator's counting rule
//      was — a wrong Gini is indistinguishable from a healthy catalog.
//   2. THE LOOP, end to end: cohorts of strangers sharing one world, with an
//      injected concentrator (delta x3) that the concentration metric must
//      catch. A distributional battery that has never seen concentration is
//      the same decoration as a suite that has never failed on a mutant.
//
// The calibration metric is deliberately NOT asserted to detect the
// concentrator. It does not — see amendment 2 in the script — and writing a
// test that pretends otherwise is how a known-powerless metric gets treated as
// a passing gate later.

import test from "node:test";
import assert from "node:assert/strict";

import {
  gini, topShare, exposureVector, normalizeMass, slateMass,
  calibrationError, pagesToAlignment,
} from "../lib/brain/distribution.js";
import { makeBots, simulatePopulation, WORLDS } from "../lib/brain/replay.js";
import { baseSplit, normalizeSplit } from "../lib/brain/bridges.js";
import { CATALOG } from "../lib/ingest/catalog.js";

// ---- 1. the metrics, against cases with known answers -----------------------

test("gini: even is 0, one-takes-all approaches 1, order does not matter", () => {
  assert.equal(gini([5, 5, 5, 5]), 0);
  assert.equal(gini([]), 0);
  assert.equal(gini([0, 0, 0]), 0, "an empty world is not maximally unequal");
  const winner = gini([0, 0, 0, 0, 0, 0, 0, 0, 0, 100]);
  assert.ok(winner > 0.85 && winner < 1, `one-takes-all should approach 1, got ${winner}`);
  assert.equal(gini([1, 9, 3]), gini([9, 3, 1]), "must not depend on input order");
  assert.ok(gini([1, 2, 3, 94]) > gini([10, 20, 30, 40]));
});

test("gini counts the unseen tail — dropping zeros is how concentration hides", () => {
  const shown = [25, 25, 25, 25];
  const withTail = [...shown, ...Array(96).fill(0)];
  assert.equal(gini(shown), 0);
  assert.ok(gini(withTail) > 0.9,
    "an engine showing 4 of 100 items is concentrated even if those 4 share evenly");
});

test("topShare: a decile of an even world takes a tenth", () => {
  const even = Array(100).fill(1);
  assert.equal(+topShare(even, 0.1).toFixed(6), 0.1);
  const skewed = [...Array(10).fill(9), ...Array(90).fill(0)];
  assert.equal(+topShare(skewed, 0.1).toFixed(6), 1);
  assert.equal(topShare([0, 0, 0]), 0);
});

test("exposureVector reports every pool item, zero included", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const v = exposureVector(pool, { a: { imp: 4 }, c: { imp: 1 } });
  assert.deepEqual(v, [4, 0, 1]);
});

test("normalizeMass sums to 1 and floors negatives", () => {
  const n = normalizeMass({ A: 3, B: 1, C: -5 });
  assert.equal(+Object.values(n).reduce((s, x) => s + x, 0).toFixed(9), 1);
  assert.equal(n.C, undefined, "a negative weight is not a share of anything");
  assert.deepEqual(normalizeMass({}), {});
  assert.deepEqual(normalizeMass({ A: 0 }), {});
});

test("calibrationError: 0 when proportions match, 2 when disjoint", () => {
  const items = [{ tags: { A: 1 } }, { tags: { B: 1 } }];
  assert.equal(+calibrationError(items, { A: 1, B: 1 }).toFixed(9), 0);
  assert.equal(+calibrationError(items, { A: 3, B: 1 }).toFixed(9), 0.5);
  assert.equal(+calibrationError([{ tags: { A: 1 } }], { B: 1 }).toFixed(9), 2, "disjoint is the maximum");
  assert.equal(calibrationError(items, {}), null, "a reader with no taste has no proportions to match");
});

test("calibrationError sees proportion, not just presence", () => {
  const taste = { A: 0.5, B: 0.5 };
  const balanced = [{ tags: { A: 1 } }, { tags: { B: 1 } }];
  const lopsided = [{ tags: { A: 1 } }, { tags: { A: 1 } }, { tags: { A: 1 } }, { tags: { B: 1 } }];
  assert.ok(calibrationError(lopsided, taste) > calibrationError(balanced, taste),
    "serving the right aesthetics in the wrong ratio must cost something");
});

test("slateMass sums tag weights across a slate", () => {
  assert.deepEqual(slateMass([{ tags: { A: 0.5 } }, { tags: { A: 0.25, B: 1 } }]), { A: 0.75, B: 1 });
  assert.deepEqual(slateMass([{}]), {});
});

test("pagesToAlignment is 1-indexed and returns null for never", () => {
  assert.equal(pagesToAlignment([0.1, 0.3, 0.6], 0.45), 3);
  assert.equal(pagesToAlignment([0.9], 0.45), 1);
  assert.equal(pagesToAlignment([0.1, 0.2], 0.45), null,
    "never reaching it must not be reported as reaching it on the last page");
});

// ---- 2. the loop, end to end ------------------------------------------------

const POOL = CATALOG;
// TWO WORLDS, ON PURPOSE (21 Aug). They were one constant, and the two jobs
// pull in opposite directions.
//
// SMALL — the carry test below needs an UNSATURATED pool: its whole assertion
// is that a fresh world touches fewer items than a carried one, which is only
// true while the catalog has corners nobody has reached. Raise it and both
// worlds touch everything, and the invariant becomes unprovable rather than
// false.
const PER_COHORT = 12, COHORTS = 2, PAGES = 3, SEED = 20260806;

// POWER — the concentration tests need the opposite. At the small size this
// world could not tell the fault from nothing: the injected delta-x3
// concentrator moved top-decile share by +0.0017 while the MUTANT arm — an
// UNMODIFIED split, the thing that must not trip the metric — moved it 0.0041.
// The null was larger than the signal, and the two concentration measures
// disagreed about the sign of a ~0.005 effect that measure-distribution itself
// documents a 0.0066 noise band for at a LARGER sample. Both assertions were
// riding luck.
//
// At 30x3x5 the arms separate about five to one — injected +0.0396 top-share /
// +0.0583 gini against a null of 0.0082 — and gini agrees with top-share
// again. Measured at head as well as on the branch that exposed it, so the
// size is tailored to neither: head reads +0.0179 / +0.0285 injected against
// the same 0.0082 null. The cost is seconds of suite time; the alternative was
// a test that passes whichever way the coin lands.
const LOAD = { perCohort: 30, cohorts: 3, pages: 5 };

function runCohorts(policy) {
  const { perCohort, cohorts, pages } = LOAD;
  const bots = makeBots(cohorts * perCohort, SEED);
  let carry = null;
  const drift = [];
  for (let c = 0; c < cohorts; c++) {
    const run = simulatePopulation(bots.slice(c * perCohort, (c + 1) * perCohort), {
      pool: POOL, pages, policy, world: WORLDS.flat, carry,
    });
    carry = { popularity: run.popularity, edges: run.edges };
    drift.push(topShare(exposureVector(POOL, run.popularity)));
  }
  return { drift, popularity: carry.popularity };
}

test("cohorts share one world — a stranger arrives to what the crowd left", () => {
  const bots = makeBots(2 * PER_COHORT, SEED);
  const first = simulatePopulation(bots.slice(0, PER_COHORT), { pool: POOL, pages: PAGES });
  const touchedFirst = Object.keys(first.popularity).length;
  const second = simulatePopulation(bots.slice(PER_COHORT), {
    pool: POOL, pages: PAGES, carry: { popularity: first.popularity, edges: first.edges },
  });
  assert.ok(Object.keys(second.popularity).length >= touchedFirst,
    "carrying a world forward must never lose what the first cohort saw");
  assert.ok(Math.max(...Object.values(second.popularity).map((c) => c.viewers)) > 1,
    "a carried world must accumulate viewers across cohorts");
  // and without carry the second cohort starts from nothing — the control
  // that proves the assertion above is about `carry` and not about bot count.
  const fresh = simulatePopulation(bots.slice(PER_COHORT), { pool: POOL, pages: PAGES });
  assert.ok(Object.keys(fresh.popularity).length < Object.keys(second.popularity).length,
    "a fresh world must be smaller than a carried one");
});

test("the concentration metric catches an injected concentrator (delta x3)", () => {
  const b = baseSplit();
  const concentrator = { ...b, delta: b.delta * 3 };
  assert.ok(normalizeSplit(concentrator), "the injected fault must be a VALID split, or the feed silently ignores it and the test proves nothing");

  const loopFree = runCohorts({ ...b, delta: 0 });
  const injected = runCohorts(concentrator);
  const last = (r) => r.drift[r.drift.length - 1];

  assert.ok(last(injected) > last(loopFree),
    `top-decile share must rise under a delta concentrator: loop-free ${last(loopFree).toFixed(4)} vs injected ${last(injected).toFixed(4)}`);
  assert.ok(gini(exposureVector(POOL, injected.popularity)) > gini(exposureVector(POOL, loopFree.popularity)),
    "gini must agree with top-decile share about which world is more concentrated");
});

test("MUTANT: a concentrator that isn't one must NOT trip the metric", () => {
  // delta x1 is the shipped split under another name. If the assertion above
  // fires for this too, it is detecting the arm label rather than the fault.
  const b = baseSplit();
  const loopFree = runCohorts({ ...b, delta: 0 });
  const notInjected = runCohorts({ ...b, delta: b.delta * 1 });
  const last = (r) => r.drift[r.drift.length - 1];
  assert.ok(Math.abs(last(notInjected) - last(loopFree)) < 0.05,
    `an unmodified split must not read as concentrated: loop-free ${last(loopFree).toFixed(4)} vs base ${last(notInjected).toFixed(4)}`);
});

test("drift is deterministic across cohorts", () => {
  const a = runCohorts(null);
  const b2 = runCohorts(null);
  assert.deepEqual(a.drift, b2.drift);
});
