// tests/bot-realism.test.js — the bot world (r22): shared population + the
// audit-#10 realism knobs.
//
// What this battery exists to prove, in order of how much it cost to learn:
//
//   1. THE DEGENERACY IS REAL AND IS NOW CAUGHT. A bot in a private world
//      leaves every item at viewers = 1, so the delta bridge holds exactly TWO
//      distinct values across the whole catalog. That is not a rounding
//      artifact — it is a bridge with no ranking signal, and it is why the r16
//      replay cross-check FAILed at head after #123 made the counters count
//      people. The first test reproduces the degeneracy deliberately; the
//      second asserts the shared world dissolves it. If someone ever gives the
//      bots private worlds again, test 2 fails loudly instead of a battery
//      quietly ranking policies on a constant.
//   2. THE COUNTING RULE SURVIVED THE FIX. Sharing a world must not undo #123:
//      one identity seeing an item on many pages is still ONE viewer.
//   3. THE FLAT WORLD IS THE OLD WORLD. Every knob factor is 1, nothing drops
//      out, and satisfaction reduces to the pre-r22 formula — so any change in
//      a historical number is attributable to the shared population alone.
//   4. EVERY KNOB DOES SOMETHING, AND THE PROOF CAN FAIL. Each knob assertion
//      is paired with a MUTANT: the same world with that knob's strength
//      neutralised, asserted to behave like the knob-off world. A knob test
//      that passes against its own mutant is decoration.

import test from "node:test";
import assert from "node:assert/strict";

import {
  makeBots, simulatePopulation, replayEstimate, dominantTag,
  attentionAt, priceFactor, satiationFactor, REALISM, WORLDS,
} from "../lib/brain/replay.js";
import { deltaScore } from "../lib/brain/popularity.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const POOL = CATALOG;
const PAGES = 4;
const SEED = 20260806;
const distinctDeltas = (popularity) =>
  new Set(POOL.map((it) => +deltaScore(it, popularity).toFixed(6))).size;

// ---- 1. the degeneracy, reproduced then dissolved ---------------------------

test("a lone bot's world is delta-degenerate — exactly two scores pool-wide", () => {
  const { popularity } = simulatePopulation(makeBots(1, SEED), { pool: POOL, pages: 8 });
  const counts = Object.values(popularity);
  assert.ok(counts.length > 50, `the bot must actually browse (touched ${counts.length})`);
  assert.equal(Math.max(...counts.map((c) => c.viewers)), 1, "one identity can only ever be one viewer");
  // THE measured mechanism behind the 8/6 measure-tuning FAIL.
  assert.equal(distinctDeltas(popularity), 2,
    "a private world must collapse delta to two values — if this ever reads higher, the reproduction is broken, not fixed");
});

test("a shared population dissolves it — delta becomes a real ranking signal", () => {
  const { popularity } = simulatePopulation(makeBots(40, SEED), { pool: POOL, pages: PAGES });
  const counts = Object.values(popularity);
  assert.ok(Math.max(...counts.map((c) => c.viewers)) > 1, "items must accumulate distinct viewers");
  assert.ok(Math.max(...counts.map((c) => c.engagers)) > 1, "items must accumulate distinct engagers");
  assert.ok(distinctDeltas(popularity) >= 20,
    `delta must carry ranking signal, got ${distinctDeltas(popularity)} distinct scores`);
});

// ---- 2. the #123 counting rule survives the shared world ---------------------

test("one identity across many pages is still one viewer and one engager", () => {
  const [session] = simulatePopulation(makeBots(1, SEED), { pool: POOL, pages: 12 }).sessions;
  const counts = Object.values(session.popularity);
  assert.equal(Math.max(...counts.map((c) => c.viewers)), 1);
  assert.ok(Math.max(...counts.map((c) => c.engagers)) <= 1);
  // ...while the raw diagnostic exposure counter DOES climb, which is what
  // distinguishes "counts people" from "counts nothing".
  assert.ok(Math.max(...counts.map((c) => c.imp)) > 1, "raw impressions still accumulate per exposure");
});

test("the feed sees only the reader's own edge neighborhood, as the route does", () => {
  const { sessions } = simulatePopulation(makeBots(12, SEED), { pool: POOL, pages: PAGES });
  for (const s of sessions) {
    for (const page of s.log) {
      const recent = (page.stateSnapshot.profile._meta || {}).recent || [];
      for (const id of Object.keys(page.stateSnapshot.edges)) {
        assert.ok(recent.includes(id),
          `edge row ${id} is outside this reader's recent engagements — that is the whole crowd's graph, not getEdges(recent)`);
      }
    }
  }
});

// ---- 3. the flat world is the pre-r22 world ---------------------------------

test("flat world: no knob fires, nothing drops out, satisfaction is the old formula", () => {
  const { sessions } = simulatePopulation(makeBots(8, SEED), { pool: POOL, pages: PAGES, world: WORLDS.flat });
  for (const s of sessions) {
    assert.equal(s.pagesBrowsed, PAGES, "nobody leaves in the flat world");
    assert.equal(s.dropped, false);
    // viewed === the attention brought ⇒ the r22 denominator equals the old
    // one, so satisfaction is algebraically the pre-r22 metric.
    assert.equal(s.viewed, s.attentionBudget);
  }
  const [bot] = makeBots(1, SEED);
  assert.equal(attentionAt(0, WORLDS.flat), 1);
  assert.equal(attentionAt(23, WORLDS.flat), 1);
  assert.equal(priceFactor(bot, { price: 99999 }, WORLDS.flat), 1);
  assert.equal(satiationFactor({ MINIMAL: 9 }, "MINIMAL", WORLDS.flat), 1);
});

test("dropout does not shrink the denominator — retention is credited, not cancelled", () => {
  const { sessions } = simulatePopulation(makeBots(40, SEED), { pool: POOL, pages: PAGES, world: WORLDS.satiating });
  const left = sessions.filter((s) => s.dropped);
  assert.ok(left.length, "the satiating world must actually lose readers, or this proves nothing");
  for (const s of sessions) {
    assert.equal(s.attentionBudget, PAGES * 24,
      "a session that ended early must still be scored over the attention it brought");
  }
});

// ---- 4. every knob does something, and each proof has a mutant --------------

test("attention decay: the eye skips slots, and a neutralised decay does not", () => {
  const flat = simulatePopulation(makeBots(10, SEED), { pool: POOL, pages: PAGES, world: WORLDS.flat });
  const decayed = simulatePopulation(makeBots(10, SEED), {
    pool: POOL, pages: PAGES,
    world: { ...WORLDS.flat, attention: true },
  });
  const viewed = (r) => r.sessions.reduce((n, s) => n + s.viewed, 0);
  assert.ok(viewed(decayed) < viewed(flat), "attention decay must cost examinations");
  // shape: front of the window is read more carefully than the back
  assert.ok(attentionAt(0, WORLDS.satiating) > attentionAt(23, WORLDS.satiating));
  assert.equal(attentionAt(0, WORLDS.satiating), 1, "slot 0 is always examined");
  // MUTANT: a floor of 1 makes the decay a no-op — the assertion above must
  // then be false, i.e. the test is capable of failing.
  const mutant = simulatePopulation(makeBots(10, SEED), {
    pool: POOL, pages: PAGES,
    world: { ...WORLDS.flat, attention: true, attentionFloor: 1 },
  });
  assert.equal(viewed(mutant), viewed(flat), "neutralised decay must reproduce the flat world exactly");
});

test("dropout hazard: frustration ends sessions, and a zeroed hazard does not", () => {
  const opts = { pool: POOL, pages: PAGES };
  const on = simulatePopulation(makeBots(40, SEED), { ...opts, world: { ...WORLDS.flat, dropout: true } });
  assert.ok(on.sessions.some((s) => s.dropped), "some reader must leave");
  // MUTANT: every hazard term zeroed ⇒ nobody leaves.
  const mutant = simulatePopulation(makeBots(40, SEED), {
    ...opts,
    world: { ...WORLDS.flat, dropout: true, dropoutBase: 0, dropoutPerSkip: 0, dropoutPerPositive: 0, dropoutMax: 0 },
  });
  assert.equal(mutant.sessions.filter((s) => s.dropped).length, 0, "a zeroed hazard must never fire");
  for (const s of mutant.sessions) assert.equal(s.pagesBrowsed, PAGES);
});

test("satiation: the same aesthetic is worth less the second time, and satRate 0 undoes it", () => {
  assert.equal(satiationFactor({}, "MINIMAL", WORLDS.satiating), 1, "an untouched aesthetic is undiscounted");
  const once = satiationFactor({ MINIMAL: 1 }, "MINIMAL", WORLDS.satiating);
  const thrice = satiationFactor({ MINIMAL: 3 }, "MINIMAL", WORLDS.satiating);
  assert.ok(once < 1 && thrice < once, `discount must deepen: 1→${once}, 3→${thrice}`);
  assert.equal(satiationFactor({ MINIMAL: 3 }, "GORP", WORLDS.satiating), 1, "satiation is per aesthetic");

  const opts = { pool: POOL, pages: PAGES };
  const off = simulatePopulation(makeBots(20, SEED), { ...opts, world: WORLDS.flat });
  const on = simulatePopulation(makeBots(20, SEED), { ...opts, world: { ...WORLDS.flat, satiation: true } });
  const positives = (r) => r.sessions.reduce((n, s) => n + s.positives, 0);
  assert.ok(positives(on) < positives(off), "a satiating reader engages less over the same slates");
  // MUTANT: rate 0 ⇒ factor 1 everywhere ⇒ identical to satiation off.
  const mutant = simulatePopulation(makeBots(20, SEED), { ...opts, world: { ...WORLDS.flat, satiation: true, satRate: 0 } });
  assert.equal(positives(mutant), positives(off), "satRate 0 must reproduce the no-satiation world exactly");
});

test("price sensitivity: over budget discounts but never zeroes, and a floor of 1 undoes it", () => {
  const bot = { budget: 500 };
  assert.equal(priceFactor(bot, { price: 400 }, WORLDS.satiating), 1, "within budget is undiscounted");
  const dear = priceFactor(bot, { price: 2000 }, WORLDS.satiating);
  assert.ok(dear < 1, "above budget must discount");
  assert.ok(dear >= REALISM.PRICE_FLOOR, "people still favourite what they cannot buy");
  assert.equal(priceFactor(bot, { price: 99999 }, WORLDS.satiating), REALISM.PRICE_FLOOR, "the discount bottoms out");
  // MUTANT: a floor of 1 makes every item affordable.
  assert.equal(priceFactor(bot, { price: 99999 }, { ...WORLDS.satiating, priceFloor: 1 }), 1);
});

test("bots carry budgets, and budgets did not disturb the taste population", () => {
  const bots = makeBots(30, SEED);
  for (const b of bots) {
    assert.ok(b.budget >= REALISM.BUDGET_LO && b.budget <= REALISM.BUDGET_HI);
  }
  assert.ok(new Set(bots.map((b) => Math.round(b.budget))).size > 20, "budgets must vary across the population");
  // The budget is derived from the bot's own seed, so the taste draws are
  // untouched by its introduction: same seed, same personas, same jitter.
  const again = makeBots(30, SEED);
  assert.deepEqual(bots.map((b) => [b.latent, b.jitterSeed]), again.map((b) => [b.latent, b.jitterSeed]));
});

test("dominantTag is deterministic under ties", () => {
  assert.equal(dominantTag({ tags: { MINIMAL: 0.4, GORP: 0.9 } }), "GORP");
  assert.equal(dominantTag({ tags: { TAILORED: 0.5, ARCHIVAL: 0.5 } }), "ARCHIVAL", "ties break on tag name");
  assert.equal(dominantTag({ tags: {} }), null);
});

// ---- determinism and replay exactness in the shared world -------------------

test("both worlds are deterministic run-to-run", () => {
  for (const world of [WORLDS.flat, WORLDS.satiating]) {
    const a = simulatePopulation(makeBots(10, SEED), { pool: POOL, pages: PAGES, world });
    const b = simulatePopulation(makeBots(10, SEED), { pool: POOL, pages: PAGES, world });
    assert.deepEqual(a.sessions.map((s) => s.satisfaction), b.sessions.map((s) => s.satisfaction), `world ${world.name}`);
    assert.deepEqual(a.popularity, b.popularity, `world ${world.name} counters`);
  }
});

test("replay of the behavior policy still scores ~0 in a shared world", () => {
  for (const world of [WORLDS.flat, WORLDS.satiating]) {
    const { sessions } = simulatePopulation(makeBots(6, SEED), { pool: POOL, pages: PAGES, world });
    const self = replayEstimate(sessions, null, { pool: POOL });
    assert.ok(Math.abs(self) < 1e-9,
      `world ${world.name}: behavior policy scored ${self} — the page snapshot no longer reproduces its own slate`);
  }
});
