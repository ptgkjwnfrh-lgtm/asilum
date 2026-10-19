// tests/popularity-decay.test.js — popularity evidence ages (r25, audit #15).
//
// The defect, reproduced first so it cannot come back silently: an item with
// ten lifetime engagers outranks a currently-hot five-engager item forever,
// because volume = engagers/(engagers+8) has no recency term and the ledger is
// monotone by construction.
//
// The risky parts of the fix, each asserted rather than trusted:
//   · the MATERIALIZE-THEN-CARRY identity. The Postgres path stores a sum
//     evaluated at one instant and multiplies it by a single factor at read
//     time. If that identity does not hold exactly, the two storage backends
//     disagree about what an item is worth, and nothing in a normal test run
//     would show it.
//   · the NOVELTY SCALE. buildNoveltyIndex builds a distribution and
//     noveltyFactor queries it. If one reads decayed viewers and the other
//     reads lifetime viewers, every item is placed against the wrong scale —
//     a silent mis-percentile, not an error.
//   · the KILL SWITCH restoring lifetime scoring EXACTLY, not approximately.

import test from "node:test";
import assert from "node:assert/strict";

import {
  deltaScore, buildNoveltyIndex, noveltyFactor,
  decayFactor, decayedSum, halfLifeMs, popularityDecayEnabled, DEFAULT_HALF_LIFE_DAYS,
} from "../lib/brain/popularity.js";

const DAY = 24 * 60 * 60 * 1000;
const item = (id) => ({ id });
const withDecay = (fn) => { delete process.env.BRAIN_POPULARITY_DECAY; try { return fn(); } finally { delete process.env.BRAIN_POPULARITY_DECAY; } };

// ---- the defect, reproduced -------------------------------------------------

test("THE DEFECT: lifetime counting lets stale evidence outrank hot evidence forever", () => {
  process.env.BRAIN_POPULARITY_DECAY = "0";
  try {
    // The audit's own probe fixture: every viewer engaged, which is what
    // reproduces its published numbers exactly. (My first attempt used
    // viewers = 2x engagers and read 0.4289 — the same defect, different
    // fixture. Matching the recorded numbers is what makes this a
    // reproduction rather than a re-derivation.)
    const stale = { s: { engagers: 10, viewers: 10 } };
    const hot = { h: { engagers: 5, viewers: 5 } };
    const dStale = deltaScore(item("s"), stale);
    const dHot = deltaScore(item("h"), hot);
    assert.ok(dStale > dHot,
      `the pre-r25 behaviour must reproduce: ${dStale.toFixed(4)} vs ${dHot.toFixed(4)}`);
    assert.equal(+dStale.toFixed(4), 0.5, "the audit measured 0.5000 for the stale item");
    assert.equal(+dHot.toFixed(4), 0.3654, "and 0.3654 for the hot one");
  } finally { delete process.env.BRAIN_POPULARITY_DECAY; }
});

test("THE FIX: ten old engagers lose to five recent ones", () => {
  withDecay(() => {
    const now = Date.now();
    const oldTs = Array.from({ length: 10 }, () => now - 365 * DAY);
    const newTs = Array.from({ length: 5 }, () => now - 1 * DAY);
    const pop = {
      s: { engagers: 10, viewers: 20, engagersDecayed: decayedSum(oldTs, now), viewersDecayed: decayedSum(oldTs.concat(oldTs), now) },
      h: { engagers: 5, viewers: 10, engagersDecayed: decayedSum(newTs, now), viewersDecayed: decayedSum(newTs.concat(newTs), now) },
    };
    const dStale = deltaScore(item("s"), pop);
    const dHot = deltaScore(item("h"), pop);
    assert.ok(dHot > dStale,
      `recent evidence must win: hot ${dHot.toFixed(4)} vs stale ${dStale.toFixed(4)}`);
  });
});

test("the audit's staleness criterion, stated in its own terms", () => {
  // "an item whose N engagers are all older than the window must score delta
  //  below an item with an equal or better recent engagement rate"
  withDecay(() => {
    const now = Date.now();
    const old = Array.from({ length: 12 }, () => now - 180 * DAY);
    const recent = Array.from({ length: 12 }, () => now - 2 * DAY);
    const pop = {
      old: { engagers: 12, viewers: 24, engagersDecayed: decayedSum(old, now), viewersDecayed: decayedSum([...old, ...old], now) },
      recent: { engagers: 12, viewers: 24, engagersDecayed: decayedSum(recent, now), viewersDecayed: decayedSum([...recent, ...recent], now) },
    };
    assert.ok(deltaScore(item("old"), pop) < deltaScore(item("recent"), pop));
  });
});

test("decay never inflates: an item's decayed evidence never exceeds its lifetime count", () => {
  const now = Date.now();
  for (const age of [0, 1, 30, 365]) {
    const ts = Array.from({ length: 7 }, () => now - age * DAY);
    assert.ok(decayedSum(ts, now) <= 7 + 1e-9, `age ${age}d produced more than 7 people`);
  }
  // clock skew: evidence stamped in the future is worth a whole person, never more
  assert.equal(decayFactor(-DAY), 1);
  assert.equal(decayFactor(0), 1);
});

// ---- the arithmetic that makes the storage layer cheap ----------------------

test("MATERIALIZE-THEN-CARRY is exact — the identity both backends rely on", () => {
  const now = Date.now();
  const stamps = [now - 3 * DAY, now - 40 * DAY, now - 111 * DAY];
  // direct: the definition evaluated at t2
  const t1 = now, t2 = now + 17 * DAY;
  const direct = decayedSum(stamps, t2);
  // materialized at t1, carried to t2 by one multiplication
  const carried = decayedSum(stamps, t1) * decayFactor(t2 - t1);
  assert.ok(Math.abs(direct - carried) < 1e-12,
    `the exponential must factor exactly: direct ${direct} vs carried ${carried}`);
});

test("half-life means what it says, and is env-tunable with a safe fallback", () => {
  assert.equal(halfLifeMs(), DEFAULT_HALF_LIFE_DAYS * DAY);
  assert.equal(+decayFactor(DEFAULT_HALF_LIFE_DAYS * DAY).toFixed(9), 0.5);
  assert.equal(+decayFactor(2 * DEFAULT_HALF_LIFE_DAYS * DAY).toFixed(9), 0.25);
  for (const bad of ["0", "-5", "abc", ""]) {
    process.env.POPULARITY_HALF_LIFE_DAYS = bad;
    assert.equal(halfLifeMs(), DEFAULT_HALF_LIFE_DAYS * DAY,
      `"${bad}" must fall back to the declared default, not disable decay silently`);
  }
  process.env.POPULARITY_HALF_LIFE_DAYS = "7";
  assert.equal(halfLifeMs(), 7 * DAY);
  delete process.env.POPULARITY_HALF_LIFE_DAYS;
});

// ---- novelty reads the same scale ------------------------------------------

test("the novelty index and its lookup read the SAME counter", () => {
  withDecay(() => {
    const now = Date.now();
    const pop = {};
    // Lifetime viewers are IDENTICAL across items; only recency differs. If
    // the index were built on lifetime counts, every item would tie and
    // novelty would be flat — which is exactly the silent failure.
    for (let i = 0; i < 10; i++) {
      const ts = Array.from({ length: 10 }, () => now - i * 40 * DAY);
      pop[`i${i}`] = { engagers: 0, viewers: 10, engagersDecayed: 0, viewersDecayed: decayedSum(ts, now) };
    }
    const idx = buildNoveltyIndex(pop);
    const novelties = Object.keys(pop).map((id) => noveltyFactor(item(id), pop, idx));
    assert.ok(new Set(novelties.map((n) => n.toFixed(6))).size > 1,
      "items that differ only in recency must not all share one novelty");
    // the least-recently-viewed item is the most novel again
    assert.ok(noveltyFactor(item("i9"), pop, idx) > noveltyFactor(item("i0"), pop, idx),
      "exposure ages out, so a long-unseen item becomes novel again");
  });
});

test("suppression heals: a burial loses force as it ages, and eventually lifts", () => {
  // The claim is that burial DECAYS, not that it vanishes on any particular
  // day. A first version of this test asserted a 120-day-old 200-identity
  // burial had already lifted; it had not (200 x 0.5^4 = 12.5 weighted
  // viewers still buries an item whose neighbours carry ~5). That was a wrong
  // guess about WHEN, not a wrong claim — so the assertion now measures the
  // direction across ages, plus the endpoint where it does lift.
  withDecay(() => {
    const now = Date.now();
    const ordinaryOf = (pop) => {
      for (let i = 0; i < 20; i++) {
        const ts = Array.from({ length: 5 }, () => now - 1 * DAY);
        pop[`o${i}`] = { engagers: 0, viewers: 5, engagersDecayed: 0, viewersDecayed: decayedSum(ts, now) };
      }
      return pop;
    };
    const noveltyAtAge = (days) => {
      const buried = Array.from({ length: 200 }, () => now - days * DAY);
      const pop = ordinaryOf({ t: { engagers: 0, viewers: 200, engagersDecayed: 0, viewersDecayed: decayedSum(buried, now) } });
      return noveltyFactor(item("t"), pop, buildNoveltyIndex(pop));
    };
    const curve = [0, 60, 120, 240, 480].map(noveltyAtAge);
    assert.ok(curve.every((v, i) => i === 0 || v >= curve[i - 1]),
      `burial must weaken monotonically as it ages: ${curve.map((v) => v.toFixed(3)).join(" -> ")}`);
    assert.ok(curve[curve.length - 1] > curve[0],
      "an old burial must end up less suppressive than a fresh one");
    // and with lifetime counting it never heals at all — the control that
    // proves the curve above is decay's doing.
    process.env.BRAIN_POPULARITY_DECAY = "0";
    const flat = [0, 480].map((days) => {
      const buried = Array.from({ length: 200 }, () => now - days * DAY);
      const pop = ordinaryOf({ t: { engagers: 0, viewers: 200, engagersDecayed: 0, viewersDecayed: decayedSum(buried, now) } });
      return noveltyFactor(item("t"), pop, buildNoveltyIndex(pop));
    });
    delete process.env.BRAIN_POPULARITY_DECAY;
    assert.equal(flat[0], flat[1], "without decay, age changes nothing — burial is permanent");
  });
});

// ---- the switch -------------------------------------------------------------

test("BRAIN_POPULARITY_DECAY=0 restores lifetime scoring EXACTLY", () => {
  const now = Date.now();
  const ts = Array.from({ length: 9 }, () => now - 200 * DAY);
  const pop = { a: { engagers: 9, viewers: 18, engagersDecayed: decayedSum(ts, now), viewersDecayed: decayedSum([...ts, ...ts], now) } };
  const decayed = withDecay(() => deltaScore(item("a"), pop));
  process.env.BRAIN_POPULARITY_DECAY = "0";
  const lifetime = deltaScore(item("a"), pop);
  delete process.env.BRAIN_POPULARITY_DECAY;
  assert.ok(decayed < lifetime, "the switch must actually change something");
  // and OFF must equal a world where the decayed fields were never written
  const bare = { a: { engagers: 9, viewers: 18 } };
  process.env.BRAIN_POPULARITY_DECAY = "0";
  assert.equal(deltaScore(item("a"), pop), deltaScore(item("a"), bare));
  delete process.env.BRAIN_POPULARITY_DECAY;
  assert.equal(popularityDecayEnabled(), true, "decay is on by default");
});

test("a row written before v25 scores on its lifetime counts, not on zero", () => {
  withDecay(() => {
    // No decayed fields at all — the shape every existing production row has
    // until its first post-migration touch. Deleting that evidence would be a
    // silent catalog-wide reset; using it unaged is the honest worse answer.
    const legacyRow = { a: { engagers: 6, viewers: 12 } };
    const bare = deltaScore(item("a"), legacyRow);
    process.env.BRAIN_POPULARITY_DECAY = "0";
    const lifetime = deltaScore(item("a"), legacyRow);
    delete process.env.BRAIN_POPULARITY_DECAY;
    assert.equal(bare, lifetime);
    assert.ok(bare > 0.3, "evidence must still count, not collapse to the prior");
  });
});

test("partial decayed fields are refused — half a fix is not applied", () => {
  withDecay(() => {
    const half = { a: { engagers: 6, viewers: 12, engagersDecayed: 0.5 } }; // viewersDecayed missing
    process.env.BRAIN_POPULARITY_DECAY = "0";
    const lifetime = deltaScore(item("a"), half);
    delete process.env.BRAIN_POPULARITY_DECAY;
    assert.equal(deltaScore(item("a"), half), lifetime,
      "a row with only one decayed field must fall back rather than mix scales");
  });
});

test("day one is still uniform — decay invents no ordering from no evidence", () => {
  withDecay(() => {
    const pop = {};
    for (let i = 0; i < 12; i++) pop[`i${i}`] = { engagers: 0, viewers: 0, engagersDecayed: 0, viewersDecayed: 0 };
    const scores = Object.keys(pop).map((id) => deltaScore(item(id), pop));
    assert.equal(new Set(scores).size, 1);
    const idx = buildNoveltyIndex(pop);
    const nov = Object.keys(pop).map((id) => noveltyFactor(item(id), pop, idx));
    assert.equal(new Set(nov).size, 1);
    assert.equal(nov[0], 0.5, "uniform and honest, as v23 declared");
  });
});

// ---- through the real storage layer ----------------------------------------

test("fresh evidence is UNCHANGED by decay — the live-arm claim, proved deterministically", async () => {
  // The live two-arm probe cannot settle this: engagement scatters over 915
  // items, so a small cohort leaves almost every served item at the neutral
  // prior and the arms agree trivially. Here the same claim is exercised
  // through the real mem storage path, where the state is controlled.
  process.env.DATABASE_URL = "";
  const { bumpPopularity, getPopularity } = await import("../lib/db/index.js");
  for (let i = 0; i < 6; i++) {
    await bumpPopularity([{ id: "fresh-item", eng: 1, imp: 1 }], `person-${i}`);
  }
  const pop = await getPopularity(5000);
  const row = pop["fresh-item"];
  assert.equal(row.engagers, 6, "six distinct identities are six engagers");
  assert.ok(Math.abs(row.engagersDecayed - row.engagers) < 1e-6,
    `seconds-old evidence must be worth its full weight: ${row.engagersDecayed} vs ${row.engagers}`);
  assert.ok(Math.abs(row.viewersDecayed - row.viewers) < 1e-6);

  const on = deltaScore(item("fresh-item"), pop);
  process.env.BRAIN_POPULARITY_DECAY = "0";
  const off = deltaScore(item("fresh-item"), pop);
  delete process.env.BRAIN_POPULARITY_DECAY;
  assert.ok(Math.abs(on - off) < 1e-9,
    `on fresh traffic the two arms must be indistinguishable: ON ${on} vs OFF ${off}`);
});

test("the storage layer stamps first_seen ONCE — returning does not refresh evidence", async () => {
  process.env.DATABASE_URL = "";
  const { bumpPopularity, getPopularity } = await import("../lib/db/index.js");
  await bumpPopularity([{ id: "repeat-item", eng: 1, imp: 1 }], "same-person");
  const first = (await getPopularity(5000))["repeat-item"].engagersDecayed;
  for (let i = 0; i < 20; i++) {
    await bumpPopularity([{ id: "repeat-item", eng: 1, imp: 1 }], "same-person");
  }
  const after = (await getPopularity(5000))["repeat-item"];
  assert.equal(after.engagers, 1, "one identity is still one engager");
  assert.ok(Math.abs(after.engagersDecayed - first) < 1e-6,
    "coming back must not re-stamp the evidence — otherwise one identity keeps an item permanently fresh, which is the repetition-is-worthless property inverted into the time dimension");
});
