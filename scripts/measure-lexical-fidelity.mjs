#!/usr/bin/env node
// scripts/measure-lexical-fidelity.mjs — does the engine read the words a
// person actually types?
//
// Three measured failures, all of them about spelling rather than knowledge:
//
// 1. ACCENTS. Four houses carry diacritics — Comme des Garçons (14 items),
//    Alaïa (12), Aimé Leon Dore (12), Stüssy (11) — and nothing folded them.
//    "alaia dress" returned 40 dresses, NOT ONE of them Alaïa, opening on a
//    Salomon shirt dress. "stussy tee" returned 160 tops with no Stüssy.
//    "comme des garcons" returned the right 14 items under the FALSE sentence
//    `no piece here matches "garcons" — showing comme des instead`: a correct
//    answer wearing a wrong explanation.
//
// 2. CORRUPTION. The typo bridge rewrote ordinary English into fashion
//    vocabulary and then explained the rack in terms of it:
//      "hot weather trousers"  reading "weather" as "leather"
//      "cold weather boots"    reading "weather" as "leather"
//      "shirt minus the print" reading "print" as "point"
//      "in stock jacket"       reading "stock" as "sock"   (280 items)
//
// 3. SPELLING. A house name typed the way people type it fell into a
//    compositional dump under a note saying the word matched nothing:
//      rickowens 621 · junyawatanabe 529 · helmutlang 484
//      commedesgarcons 474 · balenciga 784
//
// GATES, all three at zero:
//   accent misses     a folded brand query that returns no item of that house
//   corruptions       a typoCorrection applied to a word on the measured list
//   spelling dumps    a query naming a house THIS CATALOG STOCKS serving >200
//                     items under a note that says nothing matched
// Plus a REGRESSION gate: the real typos the bridge exists for must still be
// corrected, or the guard has been bought at the bridge's expense.
//
// DECLARED KNOWN LIMIT, measured here and deliberately NOT fixed in this
// round: a proper name this catalog does not stock still falls to the
// compositional tier and serves a large rack. "issey miake" returns 521 items
// under an honest `no piece here matches "issey", "miake"` — truthful and
// useless. That is the junk-dump shape (a lexicon guess deduced from
// proper-noun fragments), the same family as the Aug 5 entity-precedence fix,
// and it belongs to the blank-page round, not to a spelling round. The gate
// therefore counts a dump only when the house IS stocked here.
//
// A/B: the spelling half has a kill flag (SEARCH_BRAND_SPELLING); the accent
// and corruption halves are correctness fixes with no flag, so their baseline
// comes from a worktree at main:
//   git worktree add /tmp/asilum-base main
//   ln -s "$PWD/node_modules" /tmp/asilum-base/node_modules
//   cp scripts/measure-lexical-fidelity.mjs /tmp/asilum-base/scripts/
//   (cd /tmp/asilum-base && node scripts/measure-lexical-fidelity.mjs baseline)

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");

const label = process.argv[2] || "run";

const ACCENT_PROBES = [
  { q: "comme des garcons", house: "Comme des Garçons" },
  { q: "garcons knit", house: "Comme des Garçons" },
  { q: "alaia dress", house: "Alaïa" },
  { q: "alaia", house: "Alaïa" },
  { q: "aime leon dore", house: "Aimé Leon Dore" },
  { q: "stussy tee", house: "Stüssy" },
  { q: "stussy", house: "Stüssy" },
  // Typed WITH the accent — folding has to be symmetric.
  { q: "garçons knit", house: "Comme des Garçons" },
  { q: "alaïa dress", house: "Alaïa" },
];

const CORRUPTION_PROBES = [
  { q: "hot weather trousers", word: "weather" },
  { q: "cold weather boots", word: "weather" },
  { q: "shirt minus the print", word: "print" },
  { q: "in stock jacket", word: "stock" },
  { q: "end of season sale", word: "season" },
  { q: "good quality knit", word: "quality" },
];

const SPELLING_PROBES = [
  { q: "rickowens", house: "Rick Owens" },
  { q: "junyawatanabe", house: "Junya Watanabe" },
  { q: "helmutlang", house: "Helmut Lang" },
  { q: "commedesgarcons", house: "Comme des Garçons" },
  { q: "balenciga", house: "Balenciaga" },
  { q: "jill sander", house: "Jil Sander" },
  { q: "maisonmargiela", house: "Maison Margiela" },
  { q: "acnestudios", house: "Acne Studios" },
  // Genuinely not in this catalog — must NOT resolve to anything.
  { q: "issey miake", house: null },
  { q: "telfar", house: null },
];

// The bridge exists for these. A guard that kills them is not a fix.
const REAL_TYPOS = [
  { q: "sweter", to: "sweater" },
  { q: "trousrs", to: "trousers" },
  { q: "jaket", to: "jacket" },
  { q: "sneakrs", to: "sneakers" },
  { q: "hoddie", to: "hoodie" },
];

const rows = [];
let accentMisses = 0, corruptions = 0, dumps = 0, typoRegressions = 0, wrongResolutions = 0;

console.log(`\nLEXICAL FIDELITY — ${label} — catalog ${CATALOG.length} items`);

console.log("\n1. ACCENTS");
for (const { q, house } of ACCENT_PROBES) {
  const r = await searchProducts(q, { limit: 24 });
  const hit = (r.results || []).some((it) => it.brand === house);
  if (!hit) accentMisses++;
  console.log(`  ${hit ? "ok  " : "MISS"} "${q}" n=${r.total} top=${r.results?.[0]?.brand || "-"} | ${r.note || "-"}`);
}

console.log("\n2. CORRUPTION");
for (const { q, word } of CORRUPTION_PROBES) {
  const r = await searchProducts(q, { limit: 24 });
  const bad = (r.interpreted?.typoCorrections || []).some((c) => c.from === word);
  if (bad) corruptions++;
  console.log(`  ${bad ? "BAD " : "ok  "} "${q}" corrections=${JSON.stringify(r.interpreted?.typoCorrections || [])}`);
}

console.log("\n3. SPELLING");
for (const { q, house } of SPELLING_PROBES) {
  const r = await searchProducts(q, { limit: 24 });
  const resolved = r.interpreted?.brandSpelling?.resolved || null;
  const top = r.results?.[0]?.brand || null;
  // Only a stocked house counts — see the declared known limit in the header.
  const dump = !!house && r.total > 200 && /matches "/.test(String(r.note || ""));
  if (dump) dumps++;
  if (house && top !== house) wrongResolutions++;
  if (!house && resolved) wrongResolutions++;
  console.log(
    `  ${house ? (top === house ? "ok  " : "MISS") : (resolved ? "BAD " : "ok  ")} "${q}" n=${r.total} top=${top || "-"} resolved=${resolved || "-"}${dump ? " DUMP" : ""}`
  );
}

console.log("\n4. REAL TYPOS STILL CORRECTED");
for (const { q, to } of REAL_TYPOS) {
  const r = await searchProducts(q, { limit: 24 });
  const ok = (r.interpreted?.typoCorrections || []).some((c) => c.from === q && c.to === to);
  if (!ok) typoRegressions++;
  console.log(`  ${ok ? "ok  " : "LOST"} "${q}" -> ${JSON.stringify(r.interpreted?.typoCorrections || [])}`);
}

console.log(`\naccent misses:      ${accentMisses} / ${ACCENT_PROBES.length}`);
console.log(`corruptions:        ${corruptions} / ${CORRUPTION_PROBES.length}`);
console.log(`spelling dumps:     ${dumps} / ${SPELLING_PROBES.length}`);
console.log(`wrong resolutions:  ${wrongResolutions} / ${SPELLING_PROBES.length}`);
console.log(`typo regressions:   ${typoRegressions} / ${REAL_TYPOS.length}`);
const pass = !accentMisses && !corruptions && !dumps && !wrongResolutions && !typoRegressions;
console.log(`\nVERDICT: ${pass ? "PASS" : "FAIL"} (every gate is zero)`);
process.exit(pass ? 0 : 1);
