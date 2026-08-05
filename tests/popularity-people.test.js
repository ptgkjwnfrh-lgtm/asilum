// tests/popularity-people.test.js — delta/epsilon counters count PEOPLE.
//
// The vulnerability: popularity was a global monotone counter with no
// per-identity dedup, in both directions. Upward, 120 forged engagements from
// one cookie drove delta to 0.96. Downward — worse, because exploration floors
// protect the ZONE and not a specific ITEM — one identity aimed ~3600
// impressions a minute through GET /api/feed and collapsed a chosen item's
// novelty to 0.007 for everyone, permanently.

import test from "node:test";
import assert from "node:assert/strict";

import { deltaScore, noveltyFactor, buildNoveltyIndex, popularityDedupEnabled } from "../lib/brain/popularity.js";
import { bumpPopularity, getPopularity, purgeMemoryUserData } from "../lib/db/index.js";

const legacy = async (fn) => {
  process.env.BRAIN_POPULARITY_DEDUP = "0";
  try { return await fn(); } finally { delete process.env.BRAIN_POPULARITY_DEDUP; }
};

test("repetition by one identity buys nothing in either direction", async () => {
  const id = "pop-item-1";
  for (let i = 0; i < 50; i++) await bumpPopularity([{ id, eng: 1, imp: 1 }], "one-identity");
  const pop = await getPopularity();
  assert.equal(pop[id].engagers, 1, "50 engagements from one person is one engager");
  assert.equal(pop[id].viewers, 1, "50 views from one person is one viewer");
  assert.equal(pop[id].eng, 50, "raw events retained as the abuse fingerprint");
});

test("distinct people accumulate", async () => {
  const id = "pop-item-2";
  for (const who of ["a", "b", "c"]) await bumpPopularity([{ id, eng: 1, imp: 1 }], who);
  const pop = await getPopularity();
  assert.equal(pop[id].engagers, 3);
  assert.equal(pop[id].viewers, 3);
});

test("novelty is scale-free: day one is uniform, never fabricated", () => {
  const zero = { a: { viewers: 0 }, b: { viewers: 0 }, c: { viewers: 0 } };
  const idx = buildNoveltyIndex(zero);
  const vals = new Set(["a", "b", "c"].map((id) => noveltyFactor({ id }, zero, idx)));
  assert.equal(vals.size, 1, "no evidence must not produce an ordering");
  assert.equal([...vals][0], 0.5);
});

test("a percentile cannot be out-scaled the way K/(V+K) can", () => {
  // The trap this design avoids: with novelty = 25/(V+25), one identity's
  // 3600 impressions bought novelty 0.0069. Under a percentile, exposure is
  // relative to the pool, so a single viewer cannot leave the top of it.
  const pool = {};
  for (let i = 0; i < 100; i++) pool["i" + i] = { viewers: (i % 12) + 1 };
  pool.target = { viewers: 1 };
  const idx = buildNoveltyIndex(pool);
  assert.ok(noveltyFactor({ id: "target" }, pool, idx) > 0.5,
    "one viewer must leave the item in the least-exposed half");
});

test("delta shrinks toward the prior instead of cliff-jumping", () => {
  const at = (engagers, viewers) => deltaScore({ id: "x" }, { x: { engagers, viewers } });
  assert.equal(at(0, 0), 0.3, "no evidence is exactly the neutral prior");
  let prev = at(0, 0);
  for (let n = 1; n <= 20; n++) {
    const d = at(n, n * 2);
    assert.ok(Math.abs(d - prev) <= 0.06, `step at ${n} moved ${Math.abs(d - prev)}`);
    prev = d;
  }
});

test("the prior is keyed on EVIDENCE, not on row absence", () => {
  // Pre-fix the prior triggered only when the row was missing — and the feed's
  // own impression write created a row for every served item, so in production
  // the "neutral prior" was already dead and unproven items scored 0.0.
  const absent = deltaScore({ id: "nope" }, {});
  const presentButUnproven = deltaScore({ id: "x" }, { x: { engagers: 0, viewers: 0 } });
  assert.equal(absent, presentButUnproven);
  const seenButUnloved = deltaScore({ id: "y" }, { y: { engagers: 0, viewers: 50 } });
  assert.ok(seenButUnloved <= presentButUnproven, "exposure without response must not score above unproven");
});

test("erasure removes a person from both counters", async () => {
  const id = "pop-item-3";
  for (const who of ["keep-a", "keep-b", "leaver"]) await bumpPopularity([{ id, eng: 1, imp: 1 }], who);
  assert.equal((await getPopularity())[id].engagers, 3);
  purgeMemoryUserData("leaver");
  const after = (await getPopularity())[id];
  assert.equal(after.engagers, 2, "a departed person stops counting");
  assert.equal(after.viewers, 2);
});

test("getPopularity returns copies, not live references", async () => {
  const id = "pop-item-4";
  await bumpPopularity([{ id, eng: 1, imp: 1 }], "someone");
  const snap = await getPopularity();
  snap[id].engagers = 999;
  const fresh = await getPopularity();
  assert.equal(fresh[id].engagers, 1,
    "mutating a snapshot must not change stored state — it is the scoring input");
});

test("the kill switch restores the old rule, including the vulnerability", async () => {
  await legacy(async () => {
    assert.equal(popularityDedupEnabled(), false);
    assert.ok(noveltyFactor({ id: "z" }, { z: { eng: 0, imp: 3600 } }) < 0.01,
      "legacy novelty collapses under raw impressions again");
    assert.ok(deltaScore({ id: "z" }, { z: { eng: 120, imp: 10 } }) > 0.95,
      "legacy delta is farmable again");
  });
});
