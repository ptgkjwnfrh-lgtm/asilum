// tests/evidence-hygiene.test.js — the brand is not the piece.
//
// Titles here are "Brand — piece", and every text term in the ranker used to
// run against the whole title. A house name therefore donated "content"
// evidence it never had:
//
//   "green jacket"  three Craig Green down puffers claimed a TITLE MATCH for
//                   a word that appears nowhere in "down puffer" — and the
//                   honest `no piece here matches "green"` that "red jacket"
//                   gets was deleted, because the token looked matched.
//   "green"         confidence 1.00, the ceiling of the whole scale, for a
//                   one-word capture of somebody's surname.
//   "shoes"         every row labelled "title match" while no title contains
//                   the word — the r6 category equivalence leaking into a
//                   text claim.
//   "sand trousers" Jil Sander captured by a four-letter substring, and the
//                   disclosure silently deleted.
//
// MEASURED (scripts/measure-evidence-hygiene.mjs): 93 of 814 served rows
// asserted a text match the text did not contain; 5 of 64 query words were
// accounted for nowhere a reader could see. Both are zero now.
//
// The contract under test is that a label names the evidence that earned it,
// that one piece of evidence is paid for once, and that a reading is said out
// loud rather than buried as a match.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";
import { searchProducts } from "../lib/search/index.js";

const norm = (s) => String(s || "").toLowerCase();
const pieceOf = (t) => {
  const full = norm(t);
  const d = full.indexOf("—");
  return d >= 0 ? full.slice(d + 1).trim() : full;
};
const inPiece = (title, t) => {
  const p = pieceOf(title);
  const w = (x) => new RegExp("\\b" + x + "\\b").test(p);
  return w(t) || (t.endsWith("s") && t.length >= 4 && w(t.slice(0, -1)));
};
const TEXT_CLAIMS = new Set(["product name match", "title match", "partial title match"]);

test("no served row claims a text match the piece does not contain", async () => {
  const probes = ["green jacket", "shoes", "jacket", "stone jacket", "snow jacket",
                  "rose knit", "fear jacket", "japanese coat", "90s jacket", "vintage knit"];
  for (const q of probes) {
    const r = await searchProducts(q, { limit: 24 });
    const toks = q.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
    for (const it of r.results) {
      if (!TEXT_CLAIMS.has(it.matchReason)) continue;
      assert.ok(toks.some((t) => inPiece(it.title, t)),
        `${q}: "${it.title}" claims ${it.matchReason} with no query word in the piece`);
    }
  }
});

test("a word found only in a house name is read as a designer, out loud", async () => {
  const r = await searchProducts("green jacket", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.match(r.note, /reading "green" as the designer Craig Green/);
  // The rack itself is unchanged — this is a claim fix, not a filter.
  assert.ok(r.results.some((it) => it.brand === "Craig Green"));
  // …and the row says brand, not title.
  const cg = r.results.find((it) => it.brand === "Craig Green");
  assert.notEqual(cg.matchReason, "title match");
});

test("a colour word symmetric with one that lives in a house name", async () => {
  // "red" has always been disclosed honestly. "green" was not, purely because
  // Craig Green exists. Both are colours this catalog cannot answer.
  const red = await searchProducts("red jacket", { limit: 24 });
  const green = await searchProducts("green jacket", { limit: 24 });
  assert.match(red.note, /no piece here matches "red"/);
  assert.ok(green.note, "green must say something too");
  assert.match(green.note, /green/);
});

test("half a word inside a house name is not a designer capture", async () => {
  // "sand" used to capture Jil Sander by substring and delete the disclosure.
  const r = await searchProducts("sand trousers", { limit: 24 });
  assert.match(r.note, /no piece here matches "sand"/);
  const s = await searchProducts("tan jacket", { limit: 24 });
  assert.match(s.note, /no piece here matches "tan"/);
});

test("one piece of evidence is paid for once", async () => {
  // A partial capture of a surname must not reach the ceiling of the scale.
  const partial = await searchProducts("green", { limit: 24 });
  assert.equal(partial.results[0].matchReason, "designer match");
  assert.ok(partial.results[0].confidenceScore < 1,
    `a one-word surname capture scored ${partial.results[0].confidenceScore}`);
  // Naming the house in full still earns both terms.
  const exact = await searchProducts("prada", { limit: 24 });
  assert.equal(exact.results[0].confidenceScore, 1);
});

test("a generic noun that no piece is titled with is read as a category", async () => {
  const r = await searchProducts("shoes", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.match(r.note, /reading "shoes" as the footwear category/);
  // "jacket" opens on an actual varsity jacket and needs no sentence.
  const j = await searchProducts("jacket", { limit: 24 });
  assert.equal(j.results[0].matchReason, "product name match");
  assert.doesNotMatch(String(j.note || ""), /as the outerwear category/);
});

test("\"like <designer>\" says why the designer is absent from the rack", async () => {
  const r = await searchProducts("like rick owens", { limit: 24 });
  assert.equal(r.interpreted.intent, "designer-similar");
  assert.match(r.note, /other houses in Rick Owens' vein/);
});

test("the round changes claims, never the rack", async () => {
  // Ordering was compared against main across 40 queries: 40/40 identical.
  // These two are the shapes most at risk from the scoring touch.
  const green = await searchProducts("green", { limit: 48 });
  assert.ok(green.results.every((it) => it.brand === "Craig Green"));
  const jacket = await searchProducts("jacket", { limit: 48 });
  assert.equal(jacket.results[0].title, "Willy Chavarria — varsity jacket");
});
