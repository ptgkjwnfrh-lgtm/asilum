// tests/size-reading.test.js — the size the reader asked for.
//
// Every item carries size { label, system, fitsLikeUS }, and search read none
// of it. The engine actively DENIED the word:
//
//   "medium jacket"  170 outerwear opening on an XL, under `no piece here
//                    matches "medium" — showing outerwear instead`, while 27
//                    outerwear pieces fit like a US M
//   "size medium"    ZERO results and NO note at all
//   "size 32"        ZERO results, while 43 pieces are labelled 32
//   "32 waist jeans" 150 bottoms opening on a 28
//
// The contract under test is that the two fields are not confused, that an
// uncomparable piece cannot pass, and that a size behaves like a budget.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSizeConstraint, applySizeConstraint, itemMatchesSize, sizeMissNote } from "../lib/search/size.js";
import { searchProducts } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const parse = (s) => parseSizeConstraint(s, toks(s));

test("the two fields are what the module says they are", () => {
  assert.equal(CATALOG.filter((it) => it.size?.label).length, 915);
  assert.equal(CATALOG.filter((it) => it.size?.fitsLikeUS).length, 852);
  assert.equal(CATALOG.filter((it) => it.size?.label !== it.size?.fitsLikeUS).length, 554);
});

test("letters are read from the RAW query, because the tokenizer eats them", () => {
  // "size m" arrives as ["size"] — the size itself is already gone.
  assert.equal(parse("size m jacket").size.fits, "M");
  assert.equal(parse("medium jacket").size.fits, "M");
  assert.equal(parse("xl hoodie").size.fits, "XL");
  assert.equal(parse("xxl").size.fits, "XXL");
  assert.equal(parse("small knit").size.fits, "S");
  // …and the word leaves the stream so it cannot pollute text scoring.
  assert.deepEqual(parse("medium jacket").tokens, ["jacket"]);
});

test("a native size names its own system, and a waist is bounded", () => {
  const jp = parse("jp 3 knit").size;
  assert.equal(jp.kind, "native");
  assert.equal(jp.label, "JP 3");
  assert.equal(parse("fr 48 coat").size.label, "FR 48");
  assert.equal(parse("size 32").size.waist, 32);
  assert.equal(parse("32 waist jeans").size.waist, 32);
  // Out of the waist range: a price or a year is not a waist.
  assert.equal(parse("size 99").size, null);
});

test("a letter query answers to fitsLikeUS, and says so", () => {
  const size = parse("medium jacket").size;
  assert.equal(size.label_text, "fits like US M");
  // Claiming the merchant printed M on a piece labelled FR 48 would be a
  // small lie with a real cost in a fitting room.
  assert.doesNotMatch(size.label_text, /^size M$/);
  assert.equal(itemMatchesSize({ size: { label: "FR 48", fitsLikeUS: "M" } }, size), true);
  assert.equal(itemMatchesSize({ size: { label: "M", fitsLikeUS: "L" } }, size), false);
});

test("an uncomparable piece cannot pass", () => {
  const size = parse("medium").size;
  // 63 JP-sized pieces have no fitsLikeUS at all. Unknown is never a quiet yes.
  assert.equal(itemMatchesSize({ size: { label: "JP 3", fitsLikeUS: null } }, size), false);
  assert.equal(itemMatchesSize({}, size), false);
  assert.equal(applySizeConstraint([{ size: { fitsLikeUS: "M" } }, { size: {} }], size).length, 1);
  assert.equal(applySizeConstraint([{ size: {} }], null).length, 1);
});

test("the miss note names what IS here", () => {
  const scope = [{ size: { fitsLikeUS: "S", label: "S" } }, { size: { fitsLikeUS: "XL", label: "XL" } }];
  assert.match(sizeMissNote(parse("xxxl").size, scope, "knitwear"),
    /nothing in knitwear fits like US XXXL — what is here runs S to XL/);
  assert.match(sizeMissNote(parse("size 99 waist").size || parse("size 44").size, scope, null),
    /the labels here are/);
});

// ---- engine level ---------------------------------------------------------

test("a size query serves only pieces in that size", async () => {
  for (const [q, check] of [
    // Not category-pinned: a boxy SUIT jacket is tailoring and is still a
    // jacket, which is the r6 equivalence doing its job.
    ["medium jacket", (it) => it.size.fitsLikeUS === "M"],
    ["xl hoodie", (it) => it.size.fitsLikeUS === "XL"],
    ["size 32", (it) => String(it.size.label) === "32"],
    ["jp 3 knit", (it) => it.size.label === "JP 3"],
    ["fr 48 coat", (it) => it.size.label === "FR 48"],
  ]) {
    const r = await searchProducts(q, { limit: 48 });
    assert.ok(r.results.length > 0, q);
    for (const it of r.results) assert.ok(check(it), `${q}: ${it.id} ${JSON.stringify(it.size)}`);
  }
});

test("a size this catalog cannot meet stays empty and says what is here", async () => {
  // A size is HARD, like a budget: showing clothes that do not fit is as
  // useless as showing a $2,000 jacket to a $400 ceiling.
  const r = await searchProducts("xxxl knit", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /nothing in knitwear fits like US XXXL/);
  assert.match(r.note, /what is here runs/);
});

test("a size composes with the other readings", async () => {
  const r = await searchProducts("large japanese coat", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.equal(it.size.fitsLikeUS, "L");
  assert.match(r.note, /fits like US L/);
  assert.match(r.note, /house's base/);
});

test("a size-only query serves the constrained pool", async () => {
  const r = await searchProducts("size medium", { limit: 24 });
  assert.equal(r.total, CATALOG.filter((it) => it.size?.fitsLikeUS === "M").length);
});

test("the kill flag restores the pre-change behavior exactly", async () => {
  const off = await searchProducts("medium jacket", { limit: 24, sizeReading: false });
  assert.equal(off.interpreted.size, null);
  assert.match(off.note, /no piece here matches "medium"/);
  assert.ok(off.results.some((it) => it.size.fitsLikeUS !== "M"));
});
