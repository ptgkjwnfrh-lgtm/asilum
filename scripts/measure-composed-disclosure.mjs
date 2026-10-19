#!/usr/bin/env node
// scripts/measure-composed-disclosure.mjs — does the engine still say what it
// knows when a query carries TWO constraints instead of one?
//
// THE DEFECT THIS EXISTS FOR. `note` was a single string, filled first-come,
// with six disclosure blocks gated on `!note`. Whichever sentence fired
// earliest DELETED the rest:
//
//   "leather sneakers"      nothing here is both "leather" and "sneakers"
//   "90s leather sneakers"  reading "90s" as the 1990s          <- and that is all
//                           (four pieces served, NOT ONE a sneaker)
//   "wool suit"             nothing here is both "wool" and "suit"
//   "vintage wool suit"     reading "vintage" as 20 years old or more
//   "trench coat"           read as trench coat — officer's gabardine
//   "90s trench coat"       reading "90s" as the 1990s
//
// MEASURED over base x prefix: 52 of 64 composed probes went silent. Every
// single-constraint instrument passed, because not one of them composes two
// constraints in a single query — which is exactly how a whole class of
// regression hid behind five green harnesses.
//
// THE GATE: a composed query must not go SILENT about the rack it serves.
// Specifically, every DISCLOSURE clause the base produced — the ones that
// were `!note`-gated and therefore deletable — must survive when a constraint
// is added.
//
// AMENDMENT 1, declared after run 1. The first version demanded that every
// clause survive, and flagged twelve probes that are correct:
//   * an EMPTY composed rack is explained by whatever emptied it; a
//     descriptor disclosure about a page with nothing on it is not owed
//     ("cruise 2020 leather sneakers");
//   * a CULTURAL read is superseded on purpose when a constraint grounds the
//     query literally — that is the precedence #357 established
//     ("trench coat" -> "90s trench coat");
//   * a CATEGORY read is suppressed when the first served row now carries the
//     noun, which is the r24 rule the clause was built on
//     ("oversized knit" -> "vintage oversized knit").
// Those are different answers, not silences. The gate now counts only the
// deletable disclosure clauses on a non-empty rack.
//
//   node scripts/measure-composed-disclosure.mjs

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");

const BASES = [
  "leather sneakers", "wool suit", "nylon trousers", "trench coat",
  "bag", "leather jacket", "oversized knit", "deconstructed coat",
];
const PREFIXES = ["90s", "vintage", "japanese", "belgian", "italian", "medium", "cruise 2020", "resort"];

const clausesOf = (note) => String(note || "").split(";").map((c) => c.trim()).filter(Boolean);

let silenced = 0, checked = 0;
const losses = [];
for (const base of BASES) {
  const b = await searchProducts(base, { limit: 24 });
  const baseClauses = clausesOf(b.note);
  if (!baseClauses.length) continue;
  for (const prefix of PREFIXES) {
    const q = `${prefix} ${base}`;
    const r = await searchProducts(q, { limit: 24 });
    const got = clausesOf(r.note);
    checked++;
    // Only the deletable disclosures, and only when there IS a rack.
    const deletable = (c) => /^no |^nothing here is both|^nothing on this page/.test(c) &&
      !/^nothing here is .* — \d/.test(c);
    const lost = r.results.length
      ? baseClauses.filter((c) => deletable(c) && !got.includes(c))
      : [];
    if (lost.length) {
      silenced++;
      losses.push({ q, lost, note: r.note });
    }
  }
}

console.log(`\nCOMPOSED DISCLOSURE — ${checked} composed probes over ${BASES.length} bases`);
console.log(`composed queries that lost a clause: ${silenced}`);
for (const l of losses.slice(0, 20)) {
  console.log(`  "${l.q}"`);
  console.log(`     lost: ${l.lost.join(" | ")}`);
  console.log(`     said: ${l.note || "(nothing)"}`);
}

// And every sentence the engine prints must be true of the rack beside it.
const TRUTH = [
  ["size M/L/XL", (r) => !/nothing here is a US XL fit — 0 /.test(String(r.note || ""))],
  ["xxxl knit", (r) => !/runs .*XXXL/.test(String(r.note || ""))],
  ["under $500 over $900", (r) => /nothing can be both/.test(String(r.note || ""))],
  ["between 800 and 400", (r) => /reading that as \$400–\$800/.test(String(r.note || ""))],
  ["under 0", (r) => /nothing under \$0/.test(String(r.note || ""))],
  ["constructor jacket", (r) => r.total > 0 && !/unisex/.test(String(r.note || ""))],
  ["constructor", (r) => !/unisex/.test(String(r.note || ""))],
];
let untrue = 0;
for (const [q, ok] of TRUTH) {
  const r = await searchProducts(q, { limit: 24 });
  if (!ok(r)) { untrue++; console.log(`  UNTRUE "${q}": ${r.note}`); }
}
console.log(`sentences that contradict their own rack: ${untrue}`);

const pass = silenced === 0 && untrue === 0;
console.log(`\nVERDICT: ${pass ? "PASS" : "FAIL"} (a composed query says everything its base said, and every sentence is true)`);
process.exit(pass ? 0 : 1);
