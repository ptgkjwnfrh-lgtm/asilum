#!/usr/bin/env node
// scripts/measure-match-floor.mjs — is ruling 8's match floor still a real gate?
//
//   set -a; source .env.local; set +a
//   npm run floor:check
//
// Keyed DB pool, PURE READS — no probes to clean, and no look is ever served.
//
// WHY THIS EXISTS. Ruling 8 turned `MATCH` from a 24-point band that could never
// reject anything into a real gate, and the number that justified the 75 floor
// was a measured distribution: across 9,000 generated looks the composite ran
// 0.62–0.92, putting 75 at roughly the 27th percentile — "rejects the weakest
// quarter rather than everything or nothing" (§M4).
//
// That measurement was ad-hoc. Nothing re-runs it, and it is a claim about the
// CATALOG as much as about the code: the composite is coherence and taste over
// whatever `getDiscoverablePool()` returns today. Restock the catalog and the
// floor can drift back toward rejecting nothing — which is exactly the inert
// state ruling 8 existed to end — with every test still green, because no test
// asserts a distribution.
//
// WHAT THIS MEASURES, AND WHAT IT DOES NOT. `conf` comes from `buildOutfit` and
// the gate is `conf >= 75`; both are pure and both are measured here exactly as
// production computes them. The per-profile "looks shown / 25" table in §M4 is
// NOT reproduced: it depends on the genre biasing and `rankTrendAware` ordering
// that live INSIDE `app/api/outfits/route.js`, and replicating those here would
// measure a copy that can drift from the route without anything noticing — the
// "real on one path, decoration on the other" defect ruling 8 was itself about.
//
// The cold/warm/rich profiles behind the original table were never written down,
// so this cannot reproduce its exact numbers and does not claim to. It samples
// its own declared sweep and reports where the floor lands in it.
//
// Exit 0 = the floor is still a real gate.
// Exit 1 = it rejects almost nothing (inert again) or so much the stylist starves.

import { TAGS } from "../lib/brain/tags.js";
import { buildSlate } from "../lib/brain/stylist.js";
import { getDiscoverablePool } from "../lib/products.js";

const FLOOR = 75;              // must match MATCH_FLOOR in app/api/outfits/route.js
const LOOKS_PER_SLATE = 10;    // the route builds from 10 candidates per genre
const VECTORS_PER_CLASS = 120;

// A real gate rejects a meaningful minority. Outside this band it is either
// decoration again or it is eating the page; both are failures, in opposite
// directions, and the second is the one a naive "make the floor stricter"
// change would cause.
const REJECT_MIN = 0.05;
const REJECT_MAX = 0.60;

// Deterministic sweep — the same vectors every run, so two runs are comparable
// and a change in the number means a change in the catalog or the code, never
// in the dice. (Scripts here cannot use Math.random anyway.)
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// CHOSEN definitions — the originals were not recorded. Named so the shape of
// the sweep is arguable on its own terms rather than passed off as inherited.
const CLASSES = [
  { name: "cold", active: 1, weight: [0.10, 0.35], note: "a first session: one weak leaning" },
  { name: "warm", active: 3, weight: [0.30, 0.70], note: "a few sessions in" },
  { name: "rich", active: 6, weight: [0.55, 1.00], note: "a long-established reader" },
];

function vectorsFor({ active, weight }, seed) {
  const rand = lcg(seed);
  const out = [];
  for (let i = 0; i < VECTORS_PER_CLASS; i++) {
    const taste = {};
    const pool = [...TAGS];
    for (let k = 0; k < active; k++) {
      const tag = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      taste[tag] = weight[0] + rand() * (weight[1] - weight[0]);
    }
    out.push(taste);
  }
  return out;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const pool = await getDiscoverablePool();
if (!pool?.length) {
  console.log("no discoverable pool — nothing to measure.");
  console.log("  run: set -a; source .env.local; set +a");
  process.exit(0);
}
console.log(`pool: ${pool.length} discoverable items\n`);

const all = [];
const rows = [];
for (const [i, cls] of CLASSES.entries()) {
  const confs = [];
  let starved = 0;
  for (const taste of vectorsFor(cls, 1000 + i * 7919)) {
    const slate = buildSlate(pool, taste, LOOKS_PER_SLATE);
    if (!slate.length) { starved++; continue; }
    for (const look of slate) confs.push(look.conf);
  }
  const rejected = confs.filter((c) => c < FLOOR).length;
  const share = confs.length ? rejected / confs.length : 0;
  rows.push({ name: cls.name, note: cls.note, n: confs.length, share, starved,
              lo: Math.min(...confs), hi: Math.max(...confs) });
  all.push(...confs);
}

const sorted = [...all].sort((a, b) => a - b);
const belowFloor = sorted.filter((c) => c < FLOOR).length;
const floorPercentile = Math.round((belowFloor / sorted.length) * 100);

console.log(`composite MATCH over ${sorted.length.toLocaleString()} generated looks:`);
console.log(`  p01 ${pct(sorted, 1)}   p05 ${pct(sorted, 5)}   p10 ${pct(sorted, 10)}   p25 ${pct(sorted, 25)}`
  + `   median ${pct(sorted, 50)}   p90 ${pct(sorted, 90)}   max ${sorted[sorted.length - 1]}`);
console.log(`  the floor of ${FLOOR} sits at the ${floorPercentile}th percentile`
  + ` — §M4 measured roughly the 27th when ruling 8 shipped.\n`);

for (const r of rows) {
  console.log(`  ${r.name.padEnd(5)} ${String(Math.round(r.share * 100)).padStart(3)}% rejected`
    + `   MATCH ${r.lo}–${r.hi}   (${r.n} looks, ${r.starved} empty slates)   ${r.note}`);
}
console.log("");

if (floorPercentile * 0.01 < REJECT_MIN) {
  console.log(`FAIL: the floor rejects ${floorPercentile}% of looks — under ${REJECT_MIN * 100}% it is`);
  console.log("decoration again, which is the exact state ruling 8 ended. Re-read §M4 before");
  console.log("changing the floor: the fix is the MAPPING, not a higher number.");
  process.exit(1);
}
if (floorPercentile * 0.01 > REJECT_MAX) {
  console.log(`FAIL: the floor rejects ${floorPercentile}% of looks — over ${REJECT_MAX * 100}% the stylist`);
  console.log("starves. §M4's promise is that the page never empties.");
  process.exit(1);
}
console.log(`the floor is a real gate — rejecting ${floorPercentile}% of generated looks.`);
process.exit(0);
