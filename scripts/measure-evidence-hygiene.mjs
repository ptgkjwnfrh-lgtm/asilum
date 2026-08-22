#!/usr/bin/env node
// scripts/measure-evidence-hygiene.mjs — does a served row's matchReason
// describe evidence the row actually carries?
//
// WHY THIS EXISTS. Every disclosure the engine writes is downstream of one
// question: which query words earned this item anything. Titles here are
// "Brand — piece", and every text term in the ranker used to run against the
// WHOLE title. So a house name donated "content" evidence it never had:
//
//   "green jacket"  three Craig Green down puffers claiming a TITLE MATCH for
//                   a word that appears nowhere in "down puffer" — and,
//                   because the token looked matched, the honest
//                   `no piece here matches "green"` that "red jacket" gets
//                   was deleted.
//   "green"         confidence 1.00, the maximum the system can express, for
//                   a one-word capture of somebody's surname.
//   "shoes"         every row labelled "title match" while no title contains
//                   the word — the r6 category equivalence leaking into a
//                   text claim.
//
// TWO METRICS, both gated at zero:
//   FALSE TEXT CLAIM  a row whose matchReason asserts a text match while no
//                     query token appears in the PIECE half of its title.
//   SILENT WORD       a query word the response accounts for NOWHERE a reader
//                     can see it: not in a served piece, not in a served
//                     brand, not named in the note, not in unmatchedTokens,
//                     not part of a published era/origin reading. A word can
//                     be visible (in a brand) and still be falsely claimed —
//                     the two metrics catch different halves.
//
// A/B is two checkouts, because this round has no kill flag — it is a
// correctness fix, not a capability:
//   git worktree add /tmp/asilum-base main
//   cp scripts/measure-evidence-hygiene.mjs /tmp/asilum-base/scripts/
//   (cd /tmp/asilum-base && node scripts/measure-evidence-hygiene.mjs baseline)
//   node scripts/measure-evidence-hygiene.mjs after

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");

const label = process.argv[2] || "run";

// Words that are also part of a house name in this catalog, plus the generic
// nouns and a control set that must stay clean.
const PROBES = [
  // colour words that happen to live inside a house name
  "green", "green jacket", "stone jacket", "snow jacket", "rose knit",
  "sand trousers", "tan jacket", "marine parka", "fear jacket", "note knit",
  // the same shape with a word no house contains — the control for symmetry
  "red", "red jacket", "blue jacket", "purple knit",
  // generic nouns: the r6 category equivalence
  "shoes", "jacket", "knit", "dress", "coat", "sweater",
  // subtype nouns, which must keep behaving
  "sneakers", "trousers", "jeans", "boots",
  // brand queries, exact and partial
  "prada", "rick owens", "jil sander", "jil sander trousers", "comme des garcons",
  // controls that exercise other tiers
  "trashed jeans", "good blanks", "like rick owens", "playboi carti",
  "leather jacket", "90s jacket", "japanese coat", "vintage knit",
];

const norm = (s) => String(s || "").toLowerCase();
const pieceOf = (t) => {
  const full = norm(t);
  const d = full.indexOf("—");
  return d >= 0 ? full.slice(d + 1).trim() : full;
};
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inPiece = (title, t) => {
  const p = pieceOf(title);
  const w = (x) => new RegExp("\\b" + esc(x) + "\\b").test(p);
  return w(t) || (t.endsWith("s") && t.length >= 4 && w(t.slice(0, -1)));
};
const TEXT_CLAIMS = new Set(["product name match", "title match", "partial title match"]);
const tokensOf = (q) => norm(q).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

const rows = [];
let falseClaims = 0, servedRows = 0, silentWords = 0, wordChecks = 0;

for (const q of PROBES) {
  const r = await searchProducts(q, { limit: 24 });
  const served = r.results || [];
  const qTokens = tokensOf(q);
  const note = String(r.note || "");

  const bad = served.filter(
    (it) => TEXT_CLAIMS.has(it.matchReason) && !qTokens.some((t) => inPiece(it.title, t))
  );
  falseClaims += bad.length;
  servedRows += served.length;

  // A word is SILENT when nothing a reader can see accounts for it.
  const silent = qTokens.filter((t) => {
    if (served.some((it) => inPiece(it.title, t))) return false;
    // A word the reader can see in the BRAND column is accounted for, even
    // though it is not content — that is the false-claim metric's job.
    if (served.some((it) => new RegExp("\\b" + esc(t) + "\\b").test(norm(it.brand)))) return false;
    if ((r.unmatchedTokens || []).includes(t)) return false;
    // Named inside any quoted span of the note — the reading may quote the
    // whole phrase ("like rick owens"), not each word separately.
    if ((note.match(/"[^"]*"/g) || []).some((span) => new RegExp("\\b" + esc(t) + "\\b").test(span))) return false;
    // A garment noun that named the served category is accounted for by the
    // rack itself; era/origin/budget words are named by their own readings.
    if (r.interpreted?.era?.words?.includes(t)) return false;
    if (r.interpreted?.origin?.words?.includes(t)) return false;
    return true;
  });
  wordChecks += qTokens.length;
  silentWords += silent.length;

  rows.push({
    q, n: r.total, shown: served.length,
    top: served[0] ? `${served[0].matchReason}/${served[0].confidenceScore}` : "-",
    falseClaims: bad.length, silent,
    note: r.note || null,
    example: bad[0] ? bad[0].title : null,
  });
}

console.log(`\nEVIDENCE HYGIENE — ${label} — ${PROBES.length} probes, catalog ${CATALOG.length} items`);
console.log("query".padEnd(24), "n".padStart(5), "shown".padStart(6), "false".padStart(6), " top");
for (const row of rows) {
  console.log(
    row.q.padEnd(24), String(row.n).padStart(5), String(row.shown).padStart(6),
    String(row.falseClaims).padStart(6), " " + row.top,
    row.silent.length ? ` SILENT:${row.silent.join(",")}` : ""
  );
  if (row.example) console.log(`${"".padEnd(24)}   e.g. ${row.example}`);
}
console.log(`\nFALSE TEXT CLAIMS: ${falseClaims} of ${servedRows} served rows`);
console.log(`SILENT WORDS:      ${silentWords} of ${wordChecks} query words`);
const pass = falseClaims === 0 && silentWords === 0;
console.log(`VERDICT: ${pass ? "PASS" : "FAIL"} (both gates are zero)`);
process.exit(pass ? 0 : 1);
