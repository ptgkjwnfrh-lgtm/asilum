#!/usr/bin/env node
// scripts/measure-rerank.mjs — A/B measurement for bounded semantic
// re-ranking (r5). Runs each probe through searchProducts twice (rerank off /
// on) and reports what moved. The embedText memo means each unique query costs
// ONE provider call — safe on the unpaid Voyage tier when paced.
//
//   set -a; source .env.local; set +a
//   ~/.local/node-v20.18.1-darwin-arm64/bin/node scripts/measure-rerank.mjs
//
// Success criteria are DECLARED HERE, before the run:
//   improve probes — a target-class item must reach top 3 in the ON arm
//     (target classes are semantically-right items the literal engine buries
//     behind generic category bonuses), with zero category violations added.
//   hold probes — the top-3 set must be unchanged between arms (exact-name
//     and append-channel behavior is already right; re-ranking must not
//     disturb it).
// If any hold probe breaks, the experiment fails regardless of improvements.

import { searchProducts } from "../lib/search/index.js";
import { embeddingsConfigured } from "../lib/embeddings/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

if (!embeddingsConfigured()) {
  console.error("EMBEDDINGS_PROVIDER / EMBEDDINGS_API_KEY not set — cannot measure.");
  process.exit(1);
}

const byTitle = (re) => new Set(CATALOG.filter((it) => re.test(it.title || "")).map((it) => it.id));

const PROBES = [
  {
    q: "jacket that survives a storm", kind: "improve",
    targets: byTitle(/GORE-TEX shell|hardshell parka|anorak/i), targetName: "shell/parka/anorak",
  },
  {
    q: "waterproof jacket for hiking", kind: "improve",
    targets: byTitle(/GORE-TEX shell|hardshell parka|anorak/i), targetName: "shell/parka/anorak",
  },
  {
    q: "pants for scrambling up a mountain", kind: "improve",
    targets: byTitle(/climbing pants/i), targetName: "climbing pants",
  },
  { q: "something slinky for a night out", kind: "hold" },  // append channel already right
  { q: "slip dress", kind: "hold" },                        // exact name matches must not move
  // canonical probes (algorithm-evaluation skill) — behavior that already
  // caught real ranking bugs must survive byte-identical:
  { q: "trashed jeans", kind: "hold", assert: (res) => res.results.slice(0, 3).every((r) => r.category === "bottoms") || "non-bottoms in top 3" },
  { q: "good blanks", kind: "hold", assert: (res) => res.results[0]?.brand === "Helmut Lang" || `top is ${res.results[0]?.brand}, want Helmut Lang` },
  { q: "like rick owens", kind: "hold", assert: (res) => res.results.slice(0, 5).every((r) => r.brand !== "Rick Owens") || "Rick Owens in own similar-to top 5" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (r, targets) =>
  `${targets?.has(r.id) ? "→" : " "} ${r.id} ${String(r.title).slice(0, 44).padEnd(44)} ${r.matchReason} (${r.confidenceScore})`;

// One probe arm; retries while the semantic layer reports not-engaged
// (rate limit surfaces as a silent no-op — silence must not be measured).
async function arm(q, opts) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await searchProducts(q, { limit: 48, ...opts });
    if (res.semantic?.engaged) return res;
    console.error(`  [${q}] semantic layer not engaged (likely 429) — waiting 25s`);
    await sleep(25_000);
  }
  throw new Error(`semantic layer never engaged for "${q}" — aborting, do not trust partial numbers`);
}

// v3 arms: improve probes measure the r6 title-equiv fix ON TOP of the
// shipped r5 rerank (OFF = r5 alone, ON = r5 + r6). Hold probes bracket the
// widest span: OFF = original r4 behavior, ON = everything enabled.
let improveWins = 0, improveTotal = 0, holdBreaks = 0;
for (const probe of PROBES) {
  const isImprove = probe.kind === "improve";
  const off = await arm(probe.q, isImprove
    ? { semanticRerank: true, garmentTitleEquiv: false }
    : { semanticRerank: false, garmentTitleEquiv: false });
  const on = await arm(probe.q, { semanticRerank: true, garmentTitleEquiv: true }); // memo: no second provider call
  const offTop = off.results.slice(0, 3), onTop = on.results.slice(0, 3);

  console.log(`\n=== "${probe.q}" [${probe.kind}] · reranked ${on.semantic.reranked}, appended ${on.semantic.appended}`);
  console.log("  OFF top3:"); offTop.forEach((r) => console.log("   " + line(r, probe.targets)));
  console.log("  ON  top3:"); onTop.forEach((r) => console.log("   " + line(r, probe.targets)));

  if (probe.kind === "improve") {
    improveTotal++;
    const offRank = off.results.findIndex((r) => probe.targets.has(r.id));
    const onRank = on.results.findIndex((r) => probe.targets.has(r.id));
    const win = onRank !== -1 && onRank < 3;
    if (win) improveWins++;
    console.log(`  first ${probe.targetName}: rank ${offRank + 1 || "—"} → ${onRank + 1 || "—"}  ${win ? "WIN" : "no win"}`);
  } else {
    // v2 holds are strict: the re-rank must not have fired at all, the top-3
    // must be IDENTICAL in order, and the canonical assertion must pass.
    const identical = offTop.map((r) => r.id).join() === onTop.map((r) => r.id).join();
    const fired = on.semantic.reranked > 0;
    const assertMsg = probe.assert ? probe.assert(on) : true;
    const ok = identical && !fired && assertMsg === true;
    if (!ok) holdBreaks++;
    console.log(`  hold: ${identical ? "top-3 identical" : "top-3 CHANGED"} · rerank ${fired ? "FIRED — regression" : "did not fire"}${assertMsg !== true ? ` · assert FAILED: ${assertMsg}` : probe.assert ? " · assert passed" : ""}`);
  }
  await sleep(21_000); // unpaid tier: 3 RPM, one unique embed per probe
}

console.log(`\n==== VERDICT: ${improveWins}/${improveTotal} improve probes won · ${holdBreaks} hold regressions`);
console.log(holdBreaks === 0 && improveWins === improveTotal
  ? "SHIPPABLE by the declared criteria."
  : holdBreaks === 0
    ? "PARTIAL — no regressions, but not every improve probe won. Judgment call."
    : "NOT SHIPPABLE — hold probes regressed.");
process.exit(0);
