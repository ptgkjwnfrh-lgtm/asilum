// tests/replay-harness.test.js — r15 offline replay harness.
// The split override must be validated-or-ignored and unreachable-by-default;
// the simulator must be deterministic; the advantage estimator must score
// the behavior policy ~0 by construction.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSplit, blendedScore } from "../lib/brain/bridges.js";
import { buildFeed } from "../lib/brain/index.js";
import { makeBots, simulateSession, replayEstimate, rankAgreement, mulberry32 } from "../lib/brain/replay.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const PROFILE = { long: { MINIMAL: 0.8 }, session: {}, _meta: { recent: [], seen: [] } };

test("normalizeSplit accepts exactly the six bridges and rejects everything else", () => {
  assert.ok(normalizeSplit({ alpha: 60, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5 }));
  assert.equal(normalizeSplit({ alpha: 60 }), null);
  assert.equal(normalizeSplit({ alpha: 60, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5, extra: 1 }), null);
  assert.equal(normalizeSplit({ alpha: -1, beta: 10, gamma: 10, delta: 10, epsilon: 5, ad: 5 }), null);
  assert.equal(normalizeSplit({ alpha: 0, beta: 0, gamma: 0, delta: 0, epsilon: 0, ad: 0 }), null);
  assert.equal(normalizeSplit("alpha:60"), null);
  assert.equal(normalizeSplit(null), null);
});

test("an invalid override leaves the feed byte-identical to defaults", () => {
  const a = buildFeed({ profile: structuredClone(PROFILE), limit: 60 }, CATALOG);
  const b = buildFeed({ profile: structuredClone(PROFILE), limit: 60, splitOverride: { junk: 1 } }, CATALOG);
  assert.deepEqual(a.items.map((it) => [it.id, it._score]), b.items.map((it) => [it.id, it._score]));
});

test("a valid override actually changes blending", () => {
  const item = CATALOG.find((it) => Object.keys(it.tags || {}).length);
  const base = blendedScore(item, { MINIMAL: 0.9 }, {});
  const heavy = blendedScore(item, { MINIMAL: 0.9 }, { splitOverride: { alpha: 100, beta: 0, gamma: 0, delta: 0, epsilon: 0, ad: 0 } });
  assert.notEqual(base.score, heavy.score);
  assert.equal(+heavy.score.toFixed(6), +heavy.parts.alpha.toFixed(6));
});

test("simulator is deterministic for identical seeds", () => {
  const [bot] = makeBots(1, 7);
  const a = simulateSession(bot, null, { pool: CATALOG, pages: 2 });
  const b = simulateSession(makeBots(1, 7)[0], null, { pool: CATALOG, pages: 2 });
  assert.equal(a.satisfaction, b.satisfaction);
  assert.deepEqual(a.log[1].interactions, b.log[1].interactions);
});

test("advantage replay scores the behavior policy ~0", () => {
  const bots = makeBots(4, 99);
  const sessions = bots.map((bot) => simulateSession(bot, null, { pool: CATALOG, pages: 2 }));
  const self = replayEstimate(sessions, null, { pool: CATALOG });
  assert.ok(Math.abs(self) < 1e-9, `behavior policy scored ${self}`);
});

test("rankAgreement math", () => {
  assert.equal(rankAgreement({ a: 3, b: 2, c: 1 }, { a: 30, b: 20, c: 10 }), 1);
  assert.equal(rankAgreement({ a: 3, b: 2, c: 1 }, { a: 10, b: 20, c: 30 }), 0);
});

test("mulberry32 is stable across processes", () => {
  const r = mulberry32(1);
  assert.equal(+r().toFixed(9), 0.627073941);
  assert.equal(+r().toFixed(9), 0.002735721);
});
