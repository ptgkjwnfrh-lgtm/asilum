// tests/position-attribution.test.js — examined-impression attribution (r19).
//
// The defect: r16's lift denominator counted every slot the server SENT. A
// page is 60 slots and nobody scrolls 60, so bridges filling deep slots banked
// impressions no eye reached and tuning drifted away from them for reasons
// unrelated to taste. These guard the honest denominator and its bounds.

import test from "node:test";
import assert from "node:assert/strict";

import {
  markBridgeServed, markBridgeImpressions, recordServe,
  applyExaminationReport, examinationCoverage,
} from "../lib/brain/index.js";
import { examinedBridgeCounts, MAX_EXAMINED_PER_SERVE } from "../lib/brain/attribution.js";

const serve = (n, bridge) => Array.from({ length: n }, (_, i) => ({ id: `${bridge}-${i}`, _bridge: bridge }));
const base = () => ({ long: {}, session: {}, _meta: { recent: [], seen: [] } });

test("the client names slots; the SERVER names bridges", () => {
  const servedBridges = { a: "gamma", b: "gamma", c: "epsilon" };
  // A client claiming an id it was never served earns nothing.
  const { counts, examined, dropped } = examinedBridgeCounts(["a", "c", "forged"], servedBridges);
  assert.deepEqual(counts, { gamma: 1, epsilon: 1 });
  assert.equal(examined, 2);
  assert.equal(dropped, 1);
});

test("a slot counts once per serve however often it re-enters view", () => {
  const { counts, examined } = examinedBridgeCounts(["a", "a", "a", "b"], { a: "alpha", b: "alpha" });
  assert.deepEqual(counts, { alpha: 2 }, "scrolling up and down is not extra evidence");
  assert.equal(examined, 2);
});

test("examined reports are capped per serve", () => {
  const ids = Array.from({ length: MAX_EXAMINED_PER_SERVE + 50 }, (_, i) => `i${i}`);
  const bridges = Object.fromEntries(ids.map((id) => [id, "delta"]));
  const { counts } = examinedBridgeCounts(ids, bridges);
  assert.equal(counts.delta, MAX_EXAMINED_PER_SERVE);
});

test("only examined slots reach the tuning denominator", () => {
  // 60 served, 12 examined — the exact shape position bias used to hide.
  const items = serve(60, "gamma");
  let p = markBridgeServed(base(), { gamma: 60 });
  p = recordServe(p, "serve-1", items);
  const { counts } = examinedBridgeCounts(items.slice(0, 12).map((i) => i.id),
    Object.fromEntries(items.map((i) => [i.id, i._bridge])));
  p = applyExaminationReport(p, "serve-1", counts);
  assert.equal(p._meta.bridgeStats.gamma, 12, "denominator is what was looked at");
  assert.equal(p._meta.bridgeServed.gamma, 60, "served stays as the diagnostic");
  const cov = examinationCoverage(p);
  assert.equal(cov.served, 60);
  assert.equal(cov.examined, 12);
  assert.equal(cov.coverage, 0.2);
});

test("a replayed or mismatched report can never inflate the denominator", () => {
  const items = serve(10, "beta");
  let p = recordServe(markBridgeServed(base(), { beta: 10 }), "serve-A", items);
  const counts = { beta: 10 };
  p = applyExaminationReport(p, "serve-A", counts);
  assert.equal(p._meta.bridgeStats.beta, 10);
  // replay of the same serve
  p = applyExaminationReport(p, "serve-A", counts);
  assert.equal(p._meta.bridgeStats.beta, 10, "one report per serve");
  // a report for a serve this profile never made
  p = applyExaminationReport(p, "serve-ZZ", counts);
  assert.equal(p._meta.bridgeStats.beta, 10, "unknown serve is ignored");
});

test("serve-counting fallback still accrues evidence (no report ever arrives)", () => {
  // A JS-disabled or beacon-blocked client must not be frozen out of tuning
  // forever — the fallback is declared, and coverage reports that it was used.
  let p = markBridgeImpressions(markBridgeServed(base(), { alpha: 60 }), { alpha: 60 });
  assert.equal(p._meta.bridgeStats.alpha, 60);
  assert.equal(examinationCoverage(p).coverage, 1);
});

test("recordServe stores ids only, bounded, and replaces per page", () => {
  let p = recordServe(base(), "s1", serve(60, "gamma"));
  assert.equal(Object.keys(p._meta.lastServe.bridges).length, 60);
  p = recordServe(p, "s2", serve(3, "delta"));
  assert.equal(p._meta.lastServe.id, "s2");
  assert.equal(Object.keys(p._meta.lastServe.bridges).length, 3, "one serve at a time");
  assert.equal(p._meta.lastServe.reported, false);
});
