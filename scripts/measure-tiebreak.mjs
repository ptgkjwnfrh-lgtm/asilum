#!/usr/bin/env node
// scripts/measure-tiebreak.mjs — declared-criteria measurement for r7
// semantic tie-breaking. OFF = r5+r6 shipped behavior, ON = + tie-break.
//
//   set -a; source .env.local; set +a
//   ~/.local/node-v20.18.1-darwin-arm64/bin/node scripts/measure-tiebreak.mjs
//
// Criteria (DECLARED HERE, before the run — note these are deliberately NOT
// the r5/r6 "top-3 identical" holds: changing within-tie order is the point):
//   1. CLUSTER INVARIANCE — the (confidenceScore, matchReason) sequence is
//      identical OFF vs ON, and each (conf, reason) level's membership SET
//      is unchanged. Items may move only within their tie cluster.
//      (Resolution caveat: conf rounds _score/12 to 2dp, so distinct scores
//      can collide at one conf level; movement inside such a collision is
//      below this harness's resolution and accepted.)
//   2. CANONICAL ASSERTS — Helmut Lang top for "good blanks", bottoms-only
//      top-3 for "trashed jeans", no Rick Owens in its own similar-to top 5.
//   3. DETERMINISM — the ON arm run twice returns byte-identical id order.
//   4. Tie clusters are printed for qualitative judgment in the PR.

import { searchProducts } from "../lib/search/index.js";
import { embeddingsConfigured } from "../lib/embeddings/index.js";

if (!embeddingsConfigured()) {
  console.error("EMBEDDINGS_PROVIDER / EMBEDDINGS_API_KEY not set — cannot measure.");
  process.exit(1);
}

const PROBES = [
  { q: "slip dress", note: "name-match tie cluster (11 items, conf 1)" },
  { q: "jacket", note: "r6-levelled category-wide tie" },
  { q: "jacket that survives a storm", note: "r5+r6 already orders — expect near-inert" },
  { q: "something slinky for a night out", note: "append-only channel — appends already sim-ordered" },
  {
    q: "trashed jeans", note: "canonical",
    assert: (res) => res.results.slice(0, 3).every((r) => r.category === "bottoms") || "non-bottoms in top 3",
  },
  {
    q: "good blanks", note: "canonical",
    assert: (res) => res.results[0]?.brand === "Helmut Lang" || `top is ${res.results[0]?.brand}`,
  },
  {
    q: "like rick owens", note: "canonical",
    assert: (res) => res.results.slice(0, 5).every((r) => r.brand !== "Rick Owens") || "Rick Owens in own top 5",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function arm(q, opts) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await searchProducts(q, { limit: 2000, ...opts }); // window must cover the FULL result set — a tie cluster straddling the limit fakes invariance breaks
    if (res.semantic?.engaged) return res;
    console.error(`  [${q}] semantic layer not engaged (likely 429) — waiting 25s`);
    await sleep(25_000);
  }
  throw new Error(`semantic layer never engaged for "${q}" — aborting`);
}

const level = (r) => `${r.confidenceScore}·${r.matchReason}`;

let invarianceBreaks = 0, assertFails = 0, determinismBreaks = 0;
for (const probe of PROBES) {
  const off = await arm(probe.q, { semanticTiebreak: false });
  const on = await arm(probe.q, { semanticTiebreak: true });   // memo: no new provider call
  const on2 = await arm(probe.q, { semanticTiebreak: true });  // determinism arm

  // 1. cluster invariance
  const seqOff = off.results.map(level).join("|"), seqOn = on.results.map(level).join("|");
  let membershipOk = true;
  if (seqOff === seqOn) {
    const group = (rs) => {
      const g = new Map();
      rs.forEach((r) => { const k = level(r); if (!g.has(k)) g.set(k, new Set()); g.get(k).add(r.id); });
      return g;
    };
    const gOff = group(off.results), gOn = group(on.results);
    for (const [k, ids] of gOff) {
      const other = gOn.get(k) || new Set();
      if (ids.size !== other.size || [...ids].some((id) => !other.has(id))) { membershipOk = false; break; }
    }
  }
  const invariant = seqOff === seqOn && membershipOk;
  if (!invariant) invarianceBreaks++;

  // 2. canonical assert
  const assertMsg = probe.assert ? probe.assert(on) : true;
  if (assertMsg !== true) assertFails++;

  // 3. determinism
  const deterministic = on.results.map((r) => r.id).join() === on2.results.map((r) => r.id).join();
  if (!deterministic) determinismBreaks++;

  const moved = on.results.filter((r, i) => off.results[i]?.id !== r.id).length;
  console.log(`\n=== "${probe.q}" (${probe.note})`);
  console.log(`  invariance ${invariant ? "OK" : "BROKEN"} · positions changed ${moved}/${on.results.length} · determinism ${deterministic ? "OK" : "BROKEN"}${assertMsg !== true ? ` · assert FAILED: ${assertMsg}` : probe.assert ? " · assert passed" : ""}`);
  console.log("  ON top5:", on.results.slice(0, 5).map((r) => `${r.title} (${level(r)})`).join(" | "));
  await sleep(21_000);
}

console.log(`\n==== VERDICT: ${invarianceBreaks} invariance breaks · ${assertFails} assert fails · ${determinismBreaks} determinism breaks`);
console.log(invarianceBreaks + assertFails + determinismBreaks === 0
  ? "SHIPPABLE by the declared criteria."
  : "NOT SHIPPABLE.");
