// tests/composed-disclosure.test.js — the note is a list, not a slot.
//
// `note` was a single string, filled first-come, with six disclosure blocks
// gated on `!note`. Whichever sentence fired earliest DELETED the rest:
//
//   "leather sneakers"      nothing here is both "leather" and "sneakers"
//   "90s leather sneakers"  reading "90s" as the 1990s        <- and that is all
//                           (four pieces served, NOT ONE a sneaker)
//   "wool suit"             nothing here is both "wool" and "suit"
//   "vintage wool suit"     reading "vintage" as 20 years old or more
//
// MEASURED (scripts/measure-composed-disclosure.mjs): 27 of 64 composed
// probes lost a clause; 5 printed sentences contradicting their own rack.
// Both are zero now. Every single-constraint instrument passed throughout,
// because not one of them composes two constraints in a single query — which
// is exactly how a whole class of regression hid behind five green harnesses.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { searchProducts, garmentCategoryOf, genericNounCategoryOf } from "../lib/search/index.js";
import { parseDenseConstraints } from "../lib/search/denseQuery.js";
import { kbTagsFor, tagsToVec } from "../lib/brain/kb.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 || /^[0-9]$/.test(t));

test("a constraint does not delete the disclosure the base query made", async () => {
  for (const [base, composed] of [
    ["leather sneakers", "90s leather sneakers"],
    ["wool suit", "vintage wool suit"],
    ["nylon trousers", "italian nylon trousers"],
  ]) {
    const b = await searchProducts(base, { limit: 24 });
    const c = await searchProducts(composed, { limit: 24 });
    assert.ok(b.note, base);
    assert.ok(c.results.length > 0, composed);
    for (const clause of b.note.split(";").map((x) => x.trim())) {
      assert.ok(c.note.includes(clause),
        `"${composed}" lost "${clause}" — it said only: ${c.note}`);
    }
  }
});

test("the composed note carries the new reading AND the old disclosure", async () => {
  const r = await searchProducts("90s leather sneakers", { limit: 24 });
  assert.match(r.note, /reading "90s" as the 1990s/);
  assert.match(r.note, /nothing here is both "leather" and "sneakers"/);
});

test("a query word is not a property name", async () => {
  // "constructor jacket" returned ZERO under `nothing here is unisex — 0
  // pieces are unisex`, because GENDER_WORDS["constructor"] walked the
  // prototype chain and set the gender constraint to a function. Bare
  // "constructor" CRASHED the engine in lib/brain/kb.js.
  for (const key of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(garmentCategoryOf(key), undefined, key);
    assert.equal(genericNounCategoryOf(key), undefined, key);
    assert.equal(parseDenseConstraints([key]).constraints.gender, null, key);
    assert.equal(kbTagsFor(key), null, key);
  }
  assert.deepEqual(tagsToVec(Object.prototype.constructor), {}, "a non-array degrades, never throws");

  const r = await searchProducts("constructor jacket", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.doesNotMatch(String(r.note || ""), /unisex/);
  // And the bare word no longer throws.
  const bare = await searchProducts("constructor", { limit: 24 });
  assert.equal(bare.results.length, 0);
  assert.match(bare.note, /no piece here matches "constructor"/);
});

test("an impossible band is not printed as a band", async () => {
  // `nothing between $900 and $500 — the closest is $895` states a range
  // backwards and then offers a piece inside the range it just denied.
  const r = await searchProducts("under $500 over $900", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /nothing can be both over \$900 and under \$500/);
  assert.doesNotMatch(r.note, /between \$900 and \$500/);
});

test("a reversed range is honoured and said out loud", async () => {
  const r = await searchProducts("between 800 and 400", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.ok(it.price >= 400 && it.price <= 800, `$${it.price}`);
  assert.match(r.note, /reading that as \$400–\$800/);
});

test("zero is a number, and an absent token is not zero", async () => {
  const r = await searchProducts("under 0", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /nothing under \$0 — the closest starts at \$\d+/);
  // Number("") is 0 — accepting a zero endpoint must not turn a bare marker
  // into a $0 floor.
  assert.equal(parseDenseConstraints(toks("at least")).constraints.minPrice, null);
  assert.equal(parseDenseConstraints(toks("jacket over")).constraints.minPrice, null);
});

test("a miss note is about the thing that missed", async () => {
  // "90s japanese jacket in medium" said `nothing in outerwear fits like US M
  // — what is here runs M to XL`: a sentence that denies M and then names M
  // as the bottom of what is here. The rack is empty because this catalog
  // holds no Japanese outerwear from the 1990s at all.
  const r = await searchProducts("90s japanese jacket in medium", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.doesNotMatch(r.note, /fits like US M — what is here runs M/);
  assert.match(r.note, /"90s" as the 1990s and "japanese" as the house's base/);

  // And when the size IS the cause, the sentence stays — with a range that
  // does not contain the size it denies.
  const size = await searchProducts("xxxl knit", { limit: 24 });
  assert.match(size.note, /nothing in knitwear fits like US XXXL/);
  assert.doesNotMatch(size.note, /runs .*XXXL/);
});

test("the ledger collapses duplicates and stays readable", async () => {
  const r = await searchProducts("90s leather sneakers", { limit: 24 });
  const parts = r.note.split(";").map((x) => x.trim());
  assert.equal(new Set(parts).size, parts.length, "no clause is repeated");
  assert.ok(parts.length <= 4, `capped: ${parts.length}`);
});

test("an ordinary query is unchanged", async () => {
  for (const q of ["jacket", "trashed jeans", "good blanks", "playboi carti"]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.length > 0, q);
  }
  assert.equal((await searchProducts("jacket", { limit: 24 })).note, null);
});
