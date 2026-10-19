// tests/graph-corroboration.test.js — gamma edge corroboration (Aug 6, 2026).
//
// THE VULNERABILITY: `edges` was a global monotone counter with no per-identity
// dedup. One device cookie could pin edge(A,B) at w≈450 in minutes, and
// gammaScore's w/(w+3) squash then scored B at ≈0.99 — 20% of the core blend —
// in EVERY other user's feed, plus first place on the public /api/related.
//
// THE FIX IS ARITHMETIC: gamma is scored from DISTINCT CONTRIBUTORS and the
// squash half is 2, so one identity scores 0.333 — below the r18 vector floor
// (0.6 × median cosine 0.848 ≈ 0.509). A solo actor cannot lift an item above
// the score it would have had with no edge at all, however hard it engages.

import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalPair, edgeStrength, corroborationEnabled,
  GAMMA_CONTRIB_HALF, CONTRIB_CAP, EDGE_FANOUT_CAP,
} from "../lib/brain/edges.js";
import { bumpEdges, getEdges, purgeMemoryUserData, identityHash } from "../lib/db/index.js";

const VECTOR_FLOOR = 0.6 * 0.848; // r18 discount × measured median neighbour cosine
const gamma = (contributors) => contributors / (contributors + GAMMA_CONTRIB_HALF);

test("one identity can never out-score the no-edge baseline", () => {
  // This is the whole security claim, as arithmetic.
  assert.ok(gamma(1) < VECTOR_FLOOR,
    `solo contributor scores ${gamma(1)}, must be below the ${VECTOR_FLOOR} floor`);
  assert.ok(gamma(3) > VECTOR_FLOOR, "genuine consensus must still earn weight");
  assert.equal(GAMMA_CONTRIB_HALF, 2);
});

test("canonical pair ordering is stable in both directions", () => {
  assert.deepEqual(canonicalPair("b", "a"), canonicalPair("a", "b"));
  assert.deepEqual(canonicalPair("a", "b"), { a: "a", b: "b" });
});

test("repetition by one identity buys nothing; distinct people accumulate", async () => {
  const A = "corr-A", B = "corr-B";
  // The exact attack: one identity, the same pair, over and over.
  for (let i = 0; i < 40; i++) await bumpEdges([{ a: A, b: B, w: 2 }], "attacker");
  let edges = await getEdges([A]);
  assert.equal(edges[A][B], 1, "40 forged engagements must remain ONE contributor");
  assert.ok(gamma(edges[A][B]) < VECTOR_FLOOR, "and must stay below the no-edge floor");

  for (const who of ["person-2", "person-3"]) await bumpEdges([{ a: A, b: B, w: 1 }], who);
  edges = await getEdges([A]);
  assert.equal(edges[A][B], 3, "three distinct people corroborate to 3");
  assert.ok(gamma(edges[A][B]) > VECTOR_FLOOR, "real consensus clears the floor");
});

test("a contributor's best action wins, and repeats never re-add weight", async () => {
  const A = "best-A", B = "best-B";
  await bumpEdges([{ a: A, b: B, w: 1 }], "u1");   // favorite
  await bumpEdges([{ a: A, b: B, w: 2 }], "u1");   // upgrades to a bag
  await bumpEdges([{ a: A, b: B, w: 1 }], "u1");   // downgrade must not stack
  const edges = await getEdges([A]);
  assert.equal(edges[A][B], 1, "still one contributor — repeats and upgrades alike");
});

test("contributor count is capped so the ledger cannot grow without bound", async () => {
  const A = "cap-A", B = "cap-B";
  for (let i = 0; i < CONTRIB_CAP + 12; i++) await bumpEdges([{ a: A, b: B, w: 1 }], "capper-" + i);
  const edges = await getEdges([A]);
  assert.equal(edges[A][B], CONTRIB_CAP, `strength caps at ${CONTRIB_CAP}`);
});

test("reads are bounded per anchor and deterministic", async () => {
  const hub = "hub-1";
  for (let n = 0; n < EDGE_FANOUT_CAP + 25; n++) {
    // vary corroboration so ordering is meaningful, not incidental
    const people = 1 + (n % 4);
    for (let k = 0; k < people; k++) await bumpEdges([{ a: hub, b: "leaf-" + n, w: 1 }], `p${k}`);
  }
  const first = await getEdges([hub]);
  const second = await getEdges([hub]);
  const neighbours = Object.keys(first[hub]);
  assert.ok(neighbours.length <= EDGE_FANOUT_CAP, `fan-out ${neighbours.length} exceeds the cap`);
  assert.deepEqual(first, second, "same state must return the same map");
  // The cap must keep the STRONGEST edges — an unordered LIMIT would silently
  // delete the best legitimate signal on hot nodes.
  const strengths = Object.values(first[hub]);
  assert.equal(Math.max(...strengths), 4, "the most-corroborated neighbour survives the cap");
});

test("erasure removes a contributor and recomputes what remains", async () => {
  const A = "erase-A", B = "erase-B";
  for (const who of ["keep-1", "keep-2", "leaver"]) await bumpEdges([{ a: A, b: B, w: 1 }], who);
  assert.equal((await getEdges([A]))[A][B], 3);
  purgeMemoryUserData("leaver");
  assert.equal((await getEdges([A]))[A][B], 2,
    "a departed identity must stop corroborating the edge");
  assert.equal(identityHash("leaver").length, 64, "ledger identity is hashed, not raw");
});

test("kill switch restores the legacy summed-weight rule", async () => {
  process.env.BRAIN_EDGE_CORROBORATION = "0";
  try {
    assert.equal(corroborationEnabled(), false);
    const A = "legacy-A", B = "legacy-B";
    for (let i = 0; i < 5; i++) await bumpEdges([{ a: A, b: B, w: 2 }], "solo");
    const edges = await getEdges([A]);
    assert.ok(edges[A][B] >= 10, "legacy path accumulates raw weight again");
    assert.equal(edgeStrength({ contributors: 1, w: 42 }), 42);
  } finally {
    delete process.env.BRAIN_EDGE_CORROBORATION;
  }
});
