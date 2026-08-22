#!/usr/bin/env node
// scripts/measure-cultural-reach.mjs — does a curated reading actually reach
// the reader, or does junk evidence shadow it?
//
// THE DEFECT THIS MEASURES. lib/asterisk/culture.js holds 607 provenance-
// validated entities. The cultural tier only engages when the literal rack is
// EMPTY or WEAK, and "weak" was a score threshold: ranked[0]._score < 1.2.
// A one-of-two partial title match scores 2.5 x 0.5 = 1.25 — five hundredths
// over the line — so a single junk word killed the curated reading:
//
//   "blade runner"       eleven suede RUNNERS at confidence 0.10
//   "the matrix"         a hit donated by The Row's brand half
//   "ghost in the shell" a GORE-TEX shell
//   "jean paul gaultier" jeans
//   "the crow"           resolved to The Row by a one-edit spelling guess
//
// Sixty-eight of 607 entities were unreachable by their own name.
//
// TWO GATES:
//   reach       how many entity names engage the cultural tier
//   regression  an entity that engaged BEFORE must never stop engaging
//
// The second matters more than the first. The 1.2 threshold exists to stop a
// compositional guess hijacking a genuine literal query, and this round only
// ever ADDS weakness, only when a known entity is waiting.
//
// A shadow is not automatically a defect: a STORED FACT outranks an
// interpretation by design, so a designer credit, a house match, an era
// reading or a real product-name match winning is the correct outcome and is
// reported separately.
//
//   node scripts/measure-cultural-reach.mjs

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");
const { CULTURE, lookupCulture } = await import("../lib/asterisk/culture.js");

// A STORED FACT is a reading the engine PUBLISHES — an era window, an origin,
// a size, a designer credit, a resolved house. Those outrank an
// interpretation by design (#349) and their winning is the correct outcome.
//
// A bare matchReason is NOT enough to qualify. MEASURED on the baseline: "the
// matrix", "the cure" and "the sopranos" each reported `brand match` at
// confidence 0.10 — a fragment donated by The Row's brand half, not a house
// anyone named. A literal claim only counts as a real answer above 0.3,
// which is where a one-word-of-three partial match sits.
const LITERAL_CLAIMS = new Set(["product name match", "title match", "brand match", "partial title match"]);
const LITERAL_FLOOR = 0.3;
const storedReading = (r) =>
  !!(r.interpreted?.era?.served || r.interpreted?.origin?.served || r.interpreted?.size ||
     r.interpreted?.designerCredit || r.interpreted?.brandSpelling ||
     r.interpreted?.intent === "brand" || r.interpreted?.intent === "designer-similar");

let engaged = 0, byStoredFact = 0, byMapping = 0;
const shadowed = [];
const methods = {};

for (const e of CULTURE) {
  const r = await searchProducts(e.name, { limit: 12 });
  if (r.cultural?.engaged) {
    engaged++;
    methods[r.cultural.method || "unknown"] = (methods[r.cultural.method || "unknown"] || 0) + 1;
    continue;
  }
  if (!lookupCulture(e.name)) continue; // not addressable by that exact name
  const top = r.results?.[0];
  const reason = top?.matchReason || "-";
  if (storedReading(r)) { byStoredFact++; continue; }
  if (LITERAL_CLAIMS.has(reason) && (top?.confidenceScore || 0) >= LITERAL_FLOOR) { byStoredFact++; continue; }
  if (reason === "aesthetic match" || reason === "related term") { byMapping++; continue; }
  shadowed.push({ name: e.name, n: r.total, reason, conf: top?.confidenceScore });
}

console.log(`\nCULTURAL REACH — ${CULTURE.length} curated entities`);
console.log(`engaged by name:            ${engaged}`);
console.log(`answered by a STORED FACT:  ${byStoredFact}  (a credit, a house, an era, a real name match — correct)`);
console.log(`answered by a MAPPING:      ${byMapping}  (a curated search phrase — also correct)`);
console.log(`SHADOWED by junk evidence:  ${shadowed.length}`);
for (const s of shadowed.slice(0, 30)) {
  console.log(`  "${s.name}" n=${s.n} top=${s.reason}/${s.conf}`);
}
console.log(`\nreadings by method: ${JSON.stringify(methods)}`);

// A recovered reading must not be worded like an exact one.
const RECOVERED = ["cowboy bebop", "goblin mode"];
let mislabelled = 0;
for (const q of RECOVERED) {
  const r = await searchProducts(q, { limit: 12 });
  if (!r.cultural?.engaged) continue;
  const isRecovered = r.cultural.method === "recovered";
  const saysClosest = /closest reference asterisk knows/.test(String(r.note || ""));
  if (isRecovered && !saysClosest) { mislabelled++; console.log(`  MISLABELLED "${q}": ${r.note}`); }
}
console.log(`recovered readings worded as exact: ${mislabelled}`);

const pass = shadowed.length === 0 && mislabelled === 0;
console.log(`\nVERDICT: ${pass ? "PASS" : "FAIL"} (no curated reading shadowed by junk; no rescue worded as a read)`);
process.exit(pass ? 0 : 1);
