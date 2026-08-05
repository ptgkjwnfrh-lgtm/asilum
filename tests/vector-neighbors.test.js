// tests/vector-neighbors.test.js — r18 vectors into the feed.
// The vendored artifact must stay catalog-true; both uses must be inert for
// cold users and killed by the switch; behavioral edges must always beat
// vector similarity.

import test from "node:test";
import assert from "node:assert/strict";

import VECTOR_NEIGHBORS from "../lib/brain/vector-neighbors.json" with { type: "json" };
import { buildVecNear, blendedScore } from "../lib/brain/bridges.js";
import { buildFeed } from "../lib/brain/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const IDS = new Set(CATALOG.map((it) => it.id));

test("artifact provenance and catalog truth", () => {
  assert.equal(VECTOR_NEIGHBORS.space, "text-v1");
  assert.equal(VECTOR_NEIGHBORS.items, CATALOG.length, "artifact is stale — rerun scripts/build-vector-neighbors.mjs");
  for (const [id, list] of Object.entries(VECTOR_NEIGHBORS.neighbors)) {
    assert.ok(IDS.has(id), `unknown source item ${id}`);
    for (const [nid, sim] of list) {
      assert.ok(IDS.has(nid), `unknown neighbor ${nid}`);
      assert.ok(sim > 0 && sim <= 1);
    }
  }
});

test("cold users are inert: no recents → null map → byte-identical feed", () => {
  assert.equal(buildVecNear([]), null);
  const profile = { long: { MINIMAL: 0.8 }, session: {}, _meta: { recent: [], seen: [] } };
  const a = buildFeed({ profile: structuredClone(profile), limit: 60 }, CATALOG);
  process.env.BRAIN_VECTOR_NEIGHBORS = "0";
  let b;
  try { b = buildFeed({ profile: structuredClone(profile), limit: 60 }, CATALOG); }
  finally { delete process.env.BRAIN_VECTOR_NEIGHBORS; }
  assert.deepEqual(a.items.map((it) => [it.id, it._score]), b.items.map((it) => [it.id, it._score]));
});

test("kill switch disables nearness for warm users", () => {
  const anchor = CATALOG[0].id;
  assert.ok(buildVecNear([anchor]) instanceof Map);
  process.env.BRAIN_VECTOR_NEIGHBORS = "0";
  try { assert.equal(buildVecNear([anchor]), null); }
  finally { delete process.env.BRAIN_VECTOR_NEIGHBORS; }
});

test("behavioral edges always beat vector similarity in gamma", () => {
  const anchor = CATALOG[0].id;
  const [nid, sim] = VECTOR_NEIGHBORS.neighbors[anchor][0];
  const item = CATALOG.find((it) => it.id === nid);
  const vecNear = buildVecNear([anchor]);
  const strongEdge = { [anchor]: { [nid]: 50 } };
  const withEdge = blendedScore(item, { MINIMAL: 0.5 }, { recent: [anchor], edges: strongEdge, vecNear });
  const noEdge = blendedScore(item, { MINIMAL: 0.5 }, { recent: [anchor], edges: {}, vecNear });
  assert.ok(withEdge.parts.gamma > noEdge.parts.gamma, "a strong behavioral edge must outrank the vector fallback");
  assert.ok(noEdge.parts.gamma > 0, "vector fallback must contribute when the graph is silent");
  assert.ok(noEdge.parts.gamma <= sim * 0.6 + 1e-9, "fallback must stay discounted");
});

test("warm users get a real nearness map bounded by the artifact", () => {
  const anchor = CATALOG[0].id;
  const near = buildVecNear([anchor]);
  assert.ok(near.size >= 1 && near.size <= 12);
  for (const [id, sim] of near) {
    assert.ok(IDS.has(id));
    assert.ok(sim > 0 && sim <= 1);
  }
});
