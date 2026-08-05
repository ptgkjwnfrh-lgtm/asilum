// tests/bridge-tuning.test.js — r16 bounded bridge self-tuning.
// The law under test: evidence gates make cold users byte-identical; drift
// is bounded; alpha/epsilon floors and the monoculture cap always hold; ads
// never self-amplify; safety modes suppress tuning; the kill switch kills.

import test from "node:test";
import assert from "node:assert/strict";

import { tunedSplit, bridgeEngagementFromEvents, explainMix, MIN_IMPRESSIONS, MIN_ENGAGEMENTS } from "../lib/brain/tuning.js";
import { baseSplit } from "../lib/brain/bridges.js";
import { buildFeed } from "../lib/brain/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const share = (split, k) => split[k] / Object.values(split).reduce((s, v) => s + v, 0);
const RICH_IMP = { alpha: 200, beta: 100, gamma: 150, delta: 80, epsilon: 90 };

test("evidence gates: under-evidenced users get null (inert)", () => {
  assert.equal(tunedSplit({}, { eng: {}, evidence: 0 }, baseSplit()), null);
  assert.equal(tunedSplit({ alpha: MIN_IMPRESSIONS - 1 }, { eng: { alpha: 50 }, evidence: 50 }, baseSplit()), null);
  assert.equal(tunedSplit(RICH_IMP, { eng: { alpha: 2 }, evidence: MIN_ENGAGEMENTS - 1 }, baseSplit()), null);
});

test("lift drifts toward over-performing bridges, bounded", () => {
  const eng = { eng: { gamma: 30, alpha: 5 }, evidence: 35 };
  const tuned = tunedSplit(RICH_IMP, eng, baseSplit());
  assert.ok(tuned, "should tune with rich evidence");
  assert.ok(share(tuned, "gamma") > share(baseSplit(), "gamma"), "gamma should rise");
  for (const k of ["alpha", "beta", "gamma", "delta", "epsilon"]) {
    assert.ok(tuned[k] <= baseSplit()[k] * 1.5 + 1e-9, `${k} exceeds 1.5x lift`);
    assert.ok(tuned[k] >= baseSplit()[k] * 0.5 - 1e-9 || ["alpha", "epsilon"].includes(k), `${k} below 0.5x lift`);
  }
});

test("alpha and epsilon floors hold under hostile evidence", () => {
  // Everything engages EXCEPT alpha and epsilon — the floors must still hold.
  const eng = { eng: { gamma: 40, delta: 40, beta: 40 }, evidence: 120 };
  const tuned = tunedSplit(RICH_IMP, eng, baseSplit());
  assert.ok(share(tuned, "alpha") >= 0.20 - 1e-9, `alpha share ${share(tuned, "alpha")}`);
  assert.ok(share(tuned, "epsilon") >= 0.05 - 1e-9, `epsilon share ${share(tuned, "epsilon")}`);
});

test("monoculture cap: no bridge exceeds half the blend", () => {
  const eng = { eng: { gamma: 500 }, evidence: 500 };
  const tuned = tunedSplit(RICH_IMP, eng, baseSplit());
  for (const k of Object.keys(tuned)) {
    assert.ok(share(tuned, k) <= 0.5 + 1e-9, `${k} share ${share(tuned, k)}`);
  }
});

test("ads never self-amplify", () => {
  const eng = { eng: { ad: 400, gamma: 10 }, evidence: 410 };
  const tuned = tunedSplit({ ...RICH_IMP, ad: 100 }, eng, baseSplit());
  assert.equal(tuned.ad, baseSplit().ad);
});

test("kill switch restores the shipped split", () => {
  process.env.BRAIN_BRIDGE_TUNING = "0";
  try {
    assert.equal(tunedSplit(RICH_IMP, { eng: { gamma: 30 }, evidence: 30 }, baseSplit()), null);
  } finally {
    delete process.env.BRAIN_BRIDGE_TUNING;
  }
});

test("safety modes suppress the tuned split in buildFeed", () => {
  const profile = { long: { MINIMAL: 0.8 }, session: {}, _meta: { recent: [], seen: [] } };
  const tuned = tunedSplit(RICH_IMP, { eng: { gamma: 30, alpha: 5 }, evidence: 35 }, baseSplit());
  const base = buildFeed({ profile: structuredClone(profile), epsilonActive: true, limit: 60 }, CATALOG);
  const withTuned = buildFeed({ profile: structuredClone(profile), epsilonActive: true, limit: 60, tunedSplit: tuned }, CATALOG);
  assert.deepEqual(
    base.items.map((it) => [it.id, it._score]),
    withTuned.items.map((it) => [it.id, it._score]),
    "epsilon-active feed must ignore tuning"
  );
});

test("cold users are byte-identical (tunedSplit null path)", () => {
  const profile = { long: { MINIMAL: 0.8 }, session: {}, _meta: { recent: [], seen: [] } };
  const a = buildFeed({ profile: structuredClone(profile), limit: 60 }, CATALOG);
  const b = buildFeed({ profile: structuredClone(profile), limit: 60, tunedSplit: null }, CATALOG);
  assert.deepEqual(a.items.map((it) => [it.id, it._score]), b.items.map((it) => [it.id, it._score]));
});

test("bridgeEngagementFromEvents reads only whitelisted attributed events", () => {
  const { eng, evidence } = bridgeEngagementFromEvents([
    { type: "USER_BAGGED_ITEM", payload: { bridge: "gamma" } },
    { type: "USER_SKIPPED_ITEM", payload: { bridge: "epsilon" } },
    { type: "USER_BAGGED_ITEM", payload: { bridge: "not-a-bridge" } },
    { type: "USER_SEARCHED_QUERY", payload: { bridge: "alpha" } },
    { type: "USER_BAGGED_ITEM", payload: {} },
  ]);
  assert.equal(eng.gamma, 2);
  assert.equal(eng.epsilon, -1);
  assert.equal(evidence, 3);
});

test("explainMix speaks plainly in both states", () => {
  const inert = explainMix(baseSplit(), null);
  assert.equal(inert.active, false);
  assert.match(inert.line, /house blend/);
  const tuned = tunedSplit(RICH_IMP, { eng: { gamma: 30, alpha: 5 }, evidence: 35 }, baseSplit());
  const mix = explainMix(baseSplit(), tuned);
  assert.equal(mix.active, true);
  assert.ok(mix.bridges.find((b) => b.bridge === "gamma").direction === "boosted");
  assert.ok(mix.bridges.find((b) => b.bridge === "ad").direction === "fixed");
});
