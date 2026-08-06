import test from "node:test";
import assert from "node:assert/strict";

import { discoveryPathwayLabel, assembleFeed } from "../lib/brain/bridges.js";
import { CATALOG } from "../lib/ingest/catalog.js";

// audit #24: the discovery-slot pathway label compared the UN-rotted cross-user
// part against the ROT-scaled discovery total, so on a seen item (rot 0.3) the
// crossuser label won ~5.7x too easily. The label must depend only on the
// balance between the cross-user and adjacent-taste parts, not on the
// seen-penalty. Labels are instrumentation — the feed order is unaffected.

const SEEN_PENALTY = 0.3; // mirrors bridges.js

test("#24 the label depends on the xu-vs-adjacent balance, never on rotation", () => {
  // adjacent part 0.4 dominates the cross-user part 0.3 → 'adjacent'.
  const adjacentPart = 0.4, xuBoosted = 0.3;
  const discoveryRaw = adjacentPart + xuBoosted; // 0.7
  assert.equal(discoveryPathwayLabel(xuBoosted, discoveryRaw), "discovery-adjacent");
});

test("#24 the OLD rotted comparison would have mislabeled a seen item (regression guard)", () => {
  const adjacentPart = 0.4, xuBoosted = 0.3;
  const discoveryRaw = adjacentPart + xuBoosted; // 0.7
  const rottedDiscovery = discoveryRaw * SEEN_PENALTY; // 0.21 — the old RHS on a seen item
  // Old (buggy) rule: xuBoosted > rottedDiscovery/2  → 0.3 > 0.105 → crossuser (WRONG).
  assert.ok(xuBoosted > rottedDiscovery / 2, "old comparison would have flipped to crossuser");
  // New (correct) rule is unaffected by the seen-penalty:
  assert.equal(discoveryPathwayLabel(xuBoosted, discoveryRaw), "discovery-adjacent");
});

test("#24 cross-user genuinely dominating still labels crossuser", () => {
  const adjacentPart = 0.2, xuBoosted = 0.3;
  const discoveryRaw = adjacentPart + xuBoosted; // 0.5
  assert.equal(discoveryPathwayLabel(xuBoosted, discoveryRaw), "discovery-crossuser");
});

test("#24 no cross-user signal is always adjacent", () => {
  assert.equal(discoveryPathwayLabel(0, 0.6), "discovery-adjacent");
  assert.equal(discoveryPathwayLabel(0, 0), "discovery-adjacent");
});

test("#24 the label change leaves the feed order byte-identical (determinism)", () => {
  const taste = { MINIMAL: 0.8, TAILORED: 0.4 };
  const crossUser = Object.fromEntries(CATALOG.slice(0, 40).map((it, i) => [it.id, 0.5 - i * 0.01]));
  const seen = new Set(CATALOG.slice(0, 20).map((it) => it.id));
  const ctx = { crossUser, seen, popularity: {}, limit: 60 };
  const a = assembleFeed(CATALOG, taste, { ...ctx });
  const b = assembleFeed(CATALOG, taste, { ...ctx });
  assert.deepEqual(
    a.map((it) => [it.id, it._score]),
    b.map((it) => [it.id, it._score]),
    "feed order + scores are deterministic; the label is set after ranking and never perturbs it"
  );
  // Every discovery slot still carries a valid pathway label.
  for (const it of a) {
    if (it._zone === "discovery") {
      assert.ok(["discovery-adjacent", "discovery-crossuser"].includes(it._bridge),
        `discovery slot ${it.id} labeled "${it._bridge}"`);
    }
  }
});
