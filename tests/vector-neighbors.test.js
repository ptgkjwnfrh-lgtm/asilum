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
import { catalogEmbedHash } from "../lib/embeddings/index.js";

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

test("#17 the artifact's catalog content hash matches the current catalog", () => {
  // A count/id check catches structural drift; this catches a same-COUNT
  // CONTENT change (retagged item, changed title) that silently invalidates
  // every embedding. A mismatch means re-run scripts/embed-catalog.mjs +
  // scripts/build-vector-neighbors.mjs in the same PR (the re-embed law).
  assert.ok(VECTOR_NEIGHBORS.catalogHash, "artifact carries a catalog content hash");
  assert.equal(
    VECTOR_NEIGHBORS.catalogHash,
    catalogEmbedHash(CATALOG),
    "vector artifact is STALE — the catalog's embed-relevant content changed since it was built"
  );
});

test("#17 the hash is sensitive to any embed-relevant content change", () => {
  const base = catalogEmbedHash(CATALOG);
  // A retag of a single item must move the hash (else drift would slip past).
  const retagged = CATALOG.map((it, i) =>
    i === 0 ? { ...it, tags: { ...(it.tags || {}), ZZPROVENANCE: 0.99 } } : it);
  assert.notEqual(catalogEmbedHash(retagged), base, "a changed tag must change the hash");
  // A changed title too.
  const retitled = CATALOG.map((it, i) => (i === 1 ? { ...it, title: it.title + " (v2)" } : it));
  assert.notEqual(catalogEmbedHash(retitled), base, "a changed title must change the hash");
  // Order-independence: the hash is over sorted content, so reordering is inert.
  assert.equal(catalogEmbedHash([...CATALOG].reverse()), base, "hash is order-independent");
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
