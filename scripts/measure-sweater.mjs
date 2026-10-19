#!/usr/bin/env node
// scripts/measure-sweater.mjs — declared-criteria measurement for r9: the
// sweater retest. r8's beanie guard rejected sweater → knitwear because
// balaclava beanies were miscategorized AS knitwear; the catalog cleanup
// (shipped with r8) moved them to accessories, unblocking this retest.
//
// BASELINE = scripts/.noun-coverage-v2-after.json — the r8+cleanup state
// this change stacks on (declared; captured by the r8 battery).
//
//   set -a; source .env.local; set +a
//   node scripts/measure-sweater.mjs        # on the r9 branch
//
// Criteria (DECLARED HERE, before the run):
//   improve — "warm sweater for brutal winter cold" and "sweater for a
//     freezing mountain hut": a knitwear item WITHOUT "sweater" in its
//     title (turtleneck / cardigan / crewneck) reaches top 3; top 3 all
//     knitwear; BEANIE GUARD: no balaclava beanie in top 3 (they are
//     accessories now — if one still surfaces, the fix didn't take).
//   hold — cluster invariance vs baseline (r8 rules: ±0.01 on semantic-
//     match conf, semantic-match bucketed by reason) for every probe NOT
//     containing the token "sweater", plus the canonical asserts.
//   assert-only — "distressed mohair sweater" keeps its top-1 assert but
//     is NOT held to invariance: it contains the changed noun, so its
//     below-the-fold ordering legitimately shifts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../lib/search/index.js";
import { embeddingsConfigured } from "../lib/embeddings/index.js";

if (!embeddingsConfigured()) {
  console.error("EMBEDDINGS_PROVIDER / EMBEDDINGS_API_KEY not set — cannot measure.");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(fs.readFileSync(path.join(here, ".noun-coverage-v2-after.json"), "utf8"));

const isSweaterTarget = (r) =>
  r.category === "knitwear" && !/sweater|knit|balaclava/i.test(r.title || "");
const isBeanie = (r) => /balaclava beanie/i.test(r.title || "");

const PROBES = [
  { q: "warm sweater for brutal winter cold", kind: "improve" },
  { q: "sweater for a freezing mountain hut", kind: "improve" },
  { q: "distressed mohair sweater", kind: "assert-only", assert: (res) => /distressed mohair sweater/i.test(res.results[0]?.title || "") || `top is ${res.results[0]?.title}` },
  { q: "cozy knit for cold evenings at home", kind: "hold" },
  { q: "warm knit for a freezing mountain hut", kind: "hold" },
  { q: "hoodie", kind: "hold" },
  { q: "warm hoodie for cold mornings", kind: "hold" },
  { q: "jacket that survives a storm", kind: "hold", assert: (res) => res.results.slice(0, 3).every((r) => /shell|hardshell|anorak/i.test(r.title)) || "non-shell in top 3" },
  { q: "trashed jeans", kind: "hold", assert: (res) => res.results.slice(0, 3).every((r) => r.category === "bottoms") || "non-bottoms in top 3" },
  { q: "good blanks", kind: "hold", assert: (res) => res.results[0]?.brand === "Helmut Lang" || `top is ${res.results[0]?.brand}, want Helmut Lang` },
  { q: "like rick owens", kind: "hold", assert: (res) => res.results.slice(0, 5).every((r) => r.brand !== "Rick Owens") || "Rick Owens in own similar-to top 5" },
  { q: "slip dress", kind: "hold" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (r) => `  ${r.id} ${String(r.title).slice(0, 46).padEnd(46)} ${r.category?.padEnd(11)} ${r.matchReason} (${r.confidenceScore})`;

async function run(q) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await searchProducts(q, { limit: 2000 });
    if (res.semantic?.engaged) return res;
    console.error(`  [${q}] semantic layer not engaged (likely 429) — waiting 25s`);
    await sleep(25_000);
  }
  throw new Error(`semantic layer never engaged for "${q}" — aborting`);
}

const level = (t) => `${t[1]}·${t[2]}`;
function clusterInvariant(a, b) {
  if (a.length !== b.length) return `length ${a.length} → ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const [, ca, ra] = a[i], [, cb, rb] = b[i];
    if (ra !== rb) return `reason diverges at ${i + 1} (${ra} → ${rb})`;
    const tol = ra === "semantic match" ? 0.010001 : 0;
    if (Math.abs(ca - cb) > tol) return `conf diverges at ${i + 1} (${ca} → ${cb}, ${ra})`;
  }
  const group = (ts) => {
    const g = new Map();
    ts.forEach((t) => {
      const k = t[2] === "semantic match" ? "semantic match" : level(t);
      if (!g.has(k)) g.set(k, new Set());
      g.get(k).add(t[0]);
    });
    return g;
  };
  const ga = group(a), gb = group(b);
  for (const [k, ids] of ga) {
    const other = gb.get(k) || new Set();
    if (ids.size !== other.size || [...ids].some((id) => !other.has(id))) return `membership differs at ${k}`;
  }
  return true;
}

let improveWins = 0, improveTotal = 0, holdBreaks = 0, assertFails = 0;
for (const probe of PROBES) {
  const res = await run(probe.q);
  const rows = res.results;
  console.log(`\n=== "${probe.q}" [${probe.kind}] · ${rows.length} results`);
  rows.slice(0, 5).forEach((r) => console.log(line(r)));

  if (probe.kind === "improve") {
    improveTotal++;
    const top3 = rows.slice(0, 3);
    const covered = top3.some(isSweaterTarget);
    const allKnit = top3.every((r) => r.category === "knitwear");
    const beanie = top3.some(isBeanie);
    const win = covered && allKnit && !beanie;
    if (win) improveWins++;
    const b = BASELINE[probe.q];
    const baseRank = b ? b.triples.findIndex((t) => {
      // baseline triples lack category/title — improve delta reported from live rank only
      return false;
    }) : -1;
    console.log(`  first target rank: ${rows.findIndex(isSweaterTarget) + 1 || "—"} · ${covered ? "COVERED" : "not covered"} · ${allKnit ? "all knitwear" : "CATEGORY VIOLATION"} · ${beanie ? "BEANIE IN TOP 3" : "no beanie"} → ${win ? "WIN" : "no win"}`);
  } else if (probe.kind === "hold") {
    const b = BASELINE[probe.q];
    const inv = b ? clusterInvariant(b.triples, rows.map((r) => [r.id, r.confidenceScore, r.matchReason])) : "no baseline entry";
    if (inv !== true) holdBreaks++;
    console.log(`  hold: ${inv === true ? "cluster-invariant" : `BROKEN — ${inv}`}`);
  }
  if (probe.assert) {
    const msg = probe.assert(res);
    if (msg !== true) assertFails++;
    console.log(`  assert: ${msg === true ? "passed" : `FAILED — ${msg}`}`);
  }
  await sleep(21_000);
}

console.log(`\n==== VERDICT: ${improveWins}/${improveTotal} improve · ${holdBreaks} hold breaks · ${assertFails} assert fails`);
console.log(improveWins === improveTotal && holdBreaks === 0 && assertFails === 0
  ? "SHIPPABLE by the declared criteria."
  : "NOT SHIPPABLE.");
