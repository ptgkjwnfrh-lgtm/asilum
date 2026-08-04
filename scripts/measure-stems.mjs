#!/usr/bin/env node
// scripts/measure-stems.mjs — declared-criteria measurement for r11: the
// stem-indexed garment vocabulary (words/stemmer replaces the strip-s
// heuristic; exact keys always win, stems are an internal index only).
//
//   set -a; source .env.local; set +a
//   SEARCH_SEMANTIC_RERANK=0 SEARCH_SEMANTIC_TIEBREAK=0 EMBEDDINGS_PROVIDER= \
//     node scripts/measure-stems.mjs baseline|after
//
// Arms: baseline = main via git worktree; after = the r11 branch. Same DB
// (keyed path), embedding tiers OFF (declared: no semantic tier changed).
//
// Criteria (DECLARED HERE, before the run):
//   improve — inflections the strip-s heuristic missed now carry category
//     evidence: for each probe below, top 3 all in the expected category.
//     Baseline expectation: these probes lack the category signal (mixed or
//     empty top 3).
//   hold — (a) canonical asserts pass; (b) for every hold probe (token
//     mapping unchanged by r11), the (id → confidenceScore) map of the FULL
//     result list is identical across arms (set+score invariance; rank order
//     within tie clusters is per-process, harness law 3).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../lib/search/index.js";

const ARM = process.argv[2];
if (!["baseline", "after"].includes(ARM)) { console.error("usage: measure-stems.mjs baseline|after"); process.exit(1); }

const IMPROVE = [
  { q: "trouser", cat: "bottoms" },
  { q: "black trouser", cat: "bottoms" },
  { q: "wide leg trouser", cat: "bottoms" },
  { q: "sneaker", cat: "footwear" },
  { q: "chunky sneaker", cat: "footwear" },
  { q: "leather loafer", cat: "footwear" },
  { q: "boot", cat: "footwear" },
  { q: "hoodies", cat: "tops" },
  { q: "gowns", cat: "dresses" },
  { q: "blazers", cat: "tailoring" },
];

const HOLD = [
  { q: "trashed jeans", assert: (r) => r.results.slice(0, 3).every((x) => x.category === "bottoms") || "non-bottoms in top 3" },
  { q: "good blanks", assert: (r) => r.results[0]?.brand === "Helmut Lang" || `top is ${r.results[0]?.brand}` },
  { q: "like rick owens", assert: (r) => r.results.slice(0, 5).every((x) => x.brand !== "Rick Owens") || "own brand in top 5" },
  { q: "hoodie" },
  { q: "warm sweater for brutal winter cold" },
  { q: "jacket that survives a storm" },
  { q: "slip dress" },
  { q: "marilyn manson" }, // r10 cultural read must be untouched
];

const report = { arm: ARM, improve: [], hold: [] };

for (const { q, cat } of IMPROVE) {
  const r = await searchProducts(q, { limit: 48 });
  const top3 = r.results.slice(0, 3);
  const pass = top3.length === 3 && top3.every((x) => x.category === cat);
  report.improve.push({ q, cat, pass, top3: top3.map((x) => `${x.title} [${x.category}]`) });
  console.log(`${ARM} improve "${q}" → ${pass ? "PASS" : "no"} (${top3.map((x) => x.category).join(",") || "empty"})`);
}

for (const { q, assert } of HOLD) {
  const r = await searchProducts(q, { limit: 2000 });
  const scoreMap = {};
  for (const x of r.results) scoreMap[x.id] = x.confidenceScore;
  const verdict = assert ? assert(r) : true;
  report.hold.push({ q, total: r.total, assert: verdict === true ? "pass" : verdict, scoreMap });
  console.log(`${ARM} hold "${q}" total ${r.total} assert ${verdict === true ? "pass" : "FAIL: " + verdict}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(here, `.stems-${ARM}.json`), JSON.stringify(report, null, 2));

if (ARM === "after") {
  const base = JSON.parse(fs.readFileSync(path.join(here, ".stems-baseline.json"), "utf8"));
  let holds = 0;
  for (const h of report.hold) {
    const b = base.hold.find((x) => x.q === h.q);
    const same = b && JSON.stringify(Object.entries(b.scoreMap).sort()) === JSON.stringify(Object.entries(h.scoreMap).sort());
    if (same) holds++;
    else console.log(`HOLD INVARIANCE ${same === undefined ? "MISSING" : "BROKEN"}: "${h.q}"`);
  }
  const improved = report.improve.filter((x) => x.pass).length;
  const baseImproved = base.improve.filter((x) => x.pass).length;
  console.log(`VERDICT: improve ${baseImproved}/${report.improve.length} → ${improved}/${report.improve.length}; holds ${holds}/${report.hold.length} invariant`);
}
console.log("done");
