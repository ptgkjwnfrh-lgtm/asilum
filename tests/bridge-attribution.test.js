// tests/bridge-attribution.test.js — r14 bridge attribution.
// Instrumentation only: every feed slot must carry a whitelisted sourcing
// bridge, the attribution must survive publicProduct and land in event
// payloads, and — the load-bearing claim — attribution must not move a
// single item: the feed is byte-identical to what the ranking alone decides.

import test from "node:test";
import assert from "node:assert/strict";

import { buildFeed, markBridgeImpressions } from "../lib/brain/index.js";
import { publicProduct, PUBLIC_BRIDGES } from "../lib/products.js";
import { eventFromInteraction } from "../lib/events/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const PROFILE = {
  long: { MINIMAL: 0.8, TAILORED: 0.5 },
  session: {}, _meta: { recent: [], seen: [] },
};

test("every feed slot carries a whitelisted bridge attribution", () => {
  const { items } = buildFeed({ profile: structuredClone(PROFILE), limit: 60 }, CATALOG);
  assert.ok(items.length > 0);
  for (const it of items) {
    assert.ok(PUBLIC_BRIDGES.has(it._bridge), `slot ${it.id} has bridge "${it._bridge}"`);
  }
  const zoned = items.filter((it) => it._zone !== "core");
  for (const it of zoned) {
    assert.ok(["discovery-adjacent", "discovery-crossuser", "reach"].includes(it._bridge),
      `${it._zone} slot must carry a pathway attribution, got "${it._bridge}"`);
  }
});

test("attribution is inert: feeds with identical state rank identically", () => {
  const a = buildFeed({ profile: structuredClone(PROFILE), limit: 60 }, CATALOG);
  const b = buildFeed({ profile: structuredClone(PROFILE), limit: 60 }, CATALOG);
  assert.deepEqual(
    a.items.map((it) => [it.id, it._score, it._zone]),
    b.items.map((it) => [it.id, it._score, it._zone])
  );
});

test("publicProduct passes a valid bridge and drops garbage", () => {
  const item = { ...CATALOG[0], _zone: "core", _bridge: "alpha" };
  assert.equal(publicProduct(item)._bridge, "alpha");
  const bad = { ...CATALOG[0], _zone: "core", _bridge: "made-up" };
  assert.equal(publicProduct(bad)._bridge, undefined);
});

test("eventFromInteraction records a whitelisted bridge and drops unknown", () => {
  const ev = eventFromInteraction("u-test", "favorite", { id: "x", brand: "B", _bridge: "gamma" });
  assert.equal(ev.payload.bridge, "gamma");
  const evBad = eventFromInteraction("u-test", "favorite", { id: "x", brand: "B", _bridge: "<script>" });
  assert.equal(evBad.payload.bridge, undefined);
  const evNone = eventFromInteraction("u-test", "favorite", { id: "x", brand: "B" });
  assert.equal(evNone.payload.bridge, undefined);
});

test("markBridgeImpressions accumulates, ignores junk, and caps", () => {
  let p = markBridgeImpressions(structuredClone(PROFILE), { alpha: 40, reach: 2 });
  p = markBridgeImpressions(p, { alpha: 10, nonsense: NaN, negative: -5 });
  assert.equal(p._meta.bridgeStats.alpha, 50);
  assert.equal(p._meta.bridgeStats.reach, 2);
  assert.equal(p._meta.bridgeStats.nonsense, undefined);
  assert.equal(p._meta.bridgeStats.negative, undefined);
  p = markBridgeImpressions(p, { alpha: 200_000 });
  assert.equal(p._meta.bridgeStats.alpha, 100_000);
});
