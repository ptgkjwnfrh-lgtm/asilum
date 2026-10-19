#!/usr/bin/env node
// scripts/measure-typo.mjs — declared-criteria measurement for r12: the
// literal-engine typo bridge (fastest-levenshtein at interpretation time).
//
//   set -a; source .env.local; set +a
//   SEARCH_SEMANTIC_RERANK=0 SEARCH_SEMANTIC_TIEBREAK=0 EMBEDDINGS_PROVIDER= \
//     node scripts/measure-typo.mjs baseline|after
//
// Arms: baseline = feat/r11-stem-vocab via git worktree (r12 stacks on r11 —
// the delta under test is the bridge alone); after = the r12 branch. Keyed
// DB path, embedding tiers OFF (declared).
//
// Criteria (DECLARED HERE, before the run):
//   improve — each typo probe's results match its clean-query counterpart's
//     category shape: top 3 in the expected category AND the typo probe's
//     top-3 id set overlaps the clean probe's top-3 by ≥1. Baseline
//     expectation: typo probes carry no category evidence (mixed/empty).
//   hold — typo-free probes (canonical asserts + r10/r11 probes) full-list
//     set+score invariant across arms; corrections list EMPTY for clean
//     probes (the bridge must never touch a correct query).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../lib/search/index.js";

const ARM = process.argv[2];
if (!["baseline", "after"].includes(ARM)) { console.error("usage: measure-typo.mjs baseline|after"); process.exit(1); }

const TYPO = [
  { q: "sweter", clean: "sweater", cat: "knitwear" },
  { q: "warm sweter for winter", clean: "warm sweater for winter", cat: "knitwear" },
  { q: "trousrs", clean: "trousers", cat: "bottoms" },
  { q: "black trousrs", clean: "black trousers", cat: "bottoms" },
  { q: "cardgan", clean: "cardigan", cat: "knitwear" },
  { q: "sneekers", clean: "sneakers", cat: "footwear" },
  { q: "jackett that survives a storm", clean: "jacket that survives a storm", cat: "outerwear" },
  { q: "minimalist blazr", clean: "minimalist blazer", cat: "tailoring" },
];

const HOLD = [
  { q: "trashed jeans", assert: (r) => r.results.slice(0, 3).every((x) => x.category === "bottoms") || "non-bottoms top 3" },
  { q: "good blanks", assert: (r) => r.results[0]?.brand === "Helmut Lang" || `top is ${r.results[0]?.brand}` },
  { q: "like rick owens", assert: (r) => r.results.slice(0, 5).every((x) => x.brand !== "Rick Owens") || "own brand top 5" },
  { q: "hoodie" },
  { q: "black trouser" },
  { q: "marilyn manson" },
  { q: "slip dress" },
];

const report = { arm: ARM, typo: [], hold: [] };

for (const { q, clean, cat } of TYPO) {
  const r = await searchProducts(q, { limit: 48 });
  const c = await searchProducts(clean, { limit: 48 });
  const top3 = r.results.slice(0, 3);
  const catPass = top3.length === 3 && top3.every((x) => x.category === cat);
  const cleanIds = new Set(c.results.slice(0, 3).map((x) => x.id));
  const overlap = top3.filter((x) => cleanIds.has(x.id)).length;
  const pass = catPass && overlap >= 1;
  report.typo.push({ q, pass, corrections: r.interpreted.typoCorrections, cats: top3.map((x) => x.category) });
  console.log(`${ARM} typo "${q}" → ${pass ? "PASS" : "no"} (${top3.map((x) => x.category).join(",") || "empty"}; overlap ${overlap})`);
}

for (const { q, assert } of HOLD) {
  const r = await searchProducts(q, { limit: 2000 });
  const scoreMap = {};
  for (const x of r.results) scoreMap[x.id] = x.confidenceScore;
  const verdict = assert ? assert(r) : true;
  const cleanCorrections = r.interpreted.typoCorrections?.length || 0;
  report.hold.push({ q, total: r.total, assert: verdict === true ? "pass" : verdict, cleanCorrections, scoreMap });
  console.log(`${ARM} hold "${q}" total ${r.total} assert ${verdict === true ? "pass" : "FAIL: " + verdict} corrections ${cleanCorrections}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(here, `.typo-${ARM}.json`), JSON.stringify(report, null, 2));

if (ARM === "after") {
  const base = JSON.parse(fs.readFileSync(path.join(here, ".typo-baseline.json"), "utf8"));
  let holds = 0, cleanUntouched = true;
  for (const h of report.hold) {
    const b = base.hold.find((x) => x.q === h.q);
    const same = b && JSON.stringify(Object.entries(b.scoreMap).sort()) === JSON.stringify(Object.entries(h.scoreMap).sort());
    if (same) holds++; else console.log(`HOLD INVARIANCE BROKEN: "${h.q}"`);
    if (h.cleanCorrections > 0) { cleanUntouched = false; console.log(`CLEAN PROBE CORRECTED: "${h.q}"`); }
  }
  const improved = report.typo.filter((x) => x.pass).length;
  const baseImproved = base.typo.filter((x) => x.pass).length;
  console.log(`VERDICT: typo ${baseImproved}/${report.typo.length} → ${improved}/${report.typo.length}; holds ${holds}/${report.hold.length} invariant; clean probes untouched: ${cleanUntouched}`);
}
console.log("done");
