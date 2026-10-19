// tests/bridge-tuning.test.js — r16 bounded bridge self-tuning.
// The law under test: evidence gates make cold users byte-identical; drift
// is bounded; alpha/epsilon floors and the monoculture cap always hold; ads
// never self-amplify; safety modes suppress tuning; the kill switch kills.

import test from "node:test";
import assert from "node:assert/strict";

import { tunedSplit, bridgeEngagementFromEvents, explainMix, weightedEventTypes, MIN_IMPRESSIONS, MIN_ENGAGEMENTS } from "../lib/brain/tuning.js";
import { EVENTS, eventFromInteraction } from "../lib/events/index.js";
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
    { type: EVENTS.USER_ADDED_TO_BAG, payload: { bridge: "gamma" } },
    { type: EVENTS.USER_SKIPPED_PRODUCT, payload: { bridge: "epsilon" } },
    { type: EVENTS.USER_ADDED_TO_BAG, payload: { bridge: "not-a-bridge" } },
    { type: EVENTS.USER_SEARCHED_QUERY, payload: { bridge: "alpha" } },
    { type: EVENTS.USER_ADDED_TO_BAG, payload: {} },
  ]);
  assert.equal(eng.gamma, 2);
  assert.equal(eng.epsilon, -1);
  assert.equal(evidence, 3);
});

// The defect this guards: EVENT_ACTION_WEIGHT was keyed on four names that do
// not exist in the frozen vocabulary (USER_BAGGED_ITEM / USER_DWELLED_ITEM /
// USER_SKIPPED_ITEM / USER_HID_ITEM), so bag — the strongest signal — and BOTH
// negative weights silently scored zero. Weights must key on real event types,
// or the declared law "skips count against" cannot hold.
test("every weighted action is a real event type, and every interaction action is weighted", () => {
  const weighted = weightedEventTypes();
  for (const type of weighted) {
    assert.ok(EVENTS[type], `EVENT_ACTION_WEIGHT keys a non-existent event type: ${type}`);
  }
  for (const action of ["bag", "share", "save", "favorite", "dwell", "skip", "hide"]) {
    const ev = eventFromInteraction("u-x", action, { id: "i1", _bridge: "gamma" }, 5000);
    assert.ok(ev, `no canonical event for action ${action}`);
    const { evidence } = bridgeEngagementFromEvents([ev]);
    assert.ok(evidence > 0, `action ${action} (${ev.type}) carries zero tuning weight`);
  }
});

test("skips and hides count AGAINST their bridge (the declared negative law)", () => {
  const skip = eventFromInteraction("u-x", "skip", { id: "i1", _bridge: "delta" });
  const hide = eventFromInteraction("u-x", "hide", { id: "i2", _bridge: "delta" });
  const { eng, evidence } = bridgeEngagementFromEvents([skip, hide]);
  assert.equal(eng.delta, -2, "two negatives must sum to -2, not 0");
  assert.equal(evidence, 2, "negatives are evidence too (|weight|)");
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
