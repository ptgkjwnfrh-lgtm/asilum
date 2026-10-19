#!/usr/bin/env node
// scripts/measure-ontology.mjs — declared-criteria measurement for r13: the
// Fashionpedia-informed garment vocabulary (curated crosswalk, CC BY 4.0
// extract vendored).
//
//   set -a; source .env.local; set +a
//   SEARCH_SEMANTIC_RERANK=0 SEARCH_SEMANTIC_TIEBREAK=0 EMBEDDINGS_PROVIDER= \
//     node scripts/measure-ontology.mjs baseline|after
//
// Arms: baseline = feat/r12-typo-bridge via git worktree (r13 stacks on r12);
// after = the r13 branch. Keyed DB path, embedding tiers OFF (declared).
//
// Criteria (DECLARED HERE, before the run):
//   improve — new-noun probes return category-correct top-3 (the noun now
//     carries category evidence). Baseline expectation: mixed/empty. The
//     catalog has no literal jumpsuits/culottes; for those the criterion is
//     category-correct top-3 = the mapped category's items ranking first,
//     NOT literal-item existence (declared: this measures evidence, not
//     inventory).
//   hold — canonical + r10/r11/r12 probes full-list set+score invariant;
//     landmine phrases ("tie dye tee", "high-top", "crop top") must show NO
//     accessories/exclusion-driven category distortion vs baseline
//     (set+score invariant too — the exclusions exist so these stay put).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../lib/search/index.js";

const ARM = process.argv[2];
if (!["baseline", "after"].includes(ARM)) { console.error("usage: measure-ontology.mjs baseline|after"); process.exit(1); }

const IMPROVE = [
  { q: "windbreaker", cat: "outerwear" },
  { q: "lightweight windbreaker", cat: "outerwear" },
  { q: "sweatpants", cat: "bottoms" },
  { q: "grey sweatpants", cat: "bottoms" },
  { q: "leggings", cat: "bottoms" },
  { q: "sweatshirt", cat: "tops" },
  { q: "oversized sweatshirt", cat: "tops" },
  { q: "trench for rainy days", cat: "outerwear" },
  { q: "camisole", cat: "tops" },
  { q: "black culottes", cat: "bottoms" },
];

const HOLD = [
  { q: "trashed jeans", assert: (r) => r.results.slice(0, 3).every((x) => x.category === "bottoms") || "non-bottoms top 3" },
  { q: "good blanks", assert: (r) => r.results[0]?.brand === "Helmut Lang" || `top is ${r.results[0]?.brand}` },
  { q: "like rick owens", assert: (r) => r.results.slice(0, 5).every((x) => x.brand !== "Rick Owens") || "own brand top 5" },
  { q: "hoodie" },
  { q: "black trouser" },
  { q: "sweter" },
  { q: "marilyn manson" },
  { q: "tie dye tee" },
  { q: "canvas high-top" },
  { q: "crop top" },
];

const report = { arm: ARM, improve: [], hold: [] };

for (const { q, cat } of IMPROVE) {
  const r = await searchProducts(q, { limit: 48 });
  const top3 = r.results.slice(0, 3);
  const pass = top3.length === 3 && top3.every((x) => x.category === cat);
  report.improve.push({ q, cat, pass, cats: top3.map((x) => x.category) });
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
fs.writeFileSync(path.join(here, `.ontology-${ARM}.json`), JSON.stringify(report, null, 2));

if (ARM === "after") {
  const base = JSON.parse(fs.readFileSync(path.join(here, ".ontology-baseline.json"), "utf8"));
  let holds = 0;
  for (const h of report.hold) {
    const b = base.hold.find((x) => x.q === h.q);
    const same = b && JSON.stringify(Object.entries(b.scoreMap).sort()) === JSON.stringify(Object.entries(h.scoreMap).sort());
    if (same) holds++; else console.log(`HOLD INVARIANCE BROKEN: "${h.q}"`);
  }
  const improved = report.improve.filter((x) => x.pass).length;
  const baseImproved = base.improve.filter((x) => x.pass).length;
  console.log(`VERDICT: improve ${baseImproved}/${report.improve.length} → ${improved}/${report.improve.length}; holds ${holds}/${report.hold.length} invariant`);
}
console.log("done");
