// tests/word-scope.test.js — "no piece here matches X" must not be said while
// pieces here match X.
//
// MEASURED against the shipped catalog: "leather coat" served outerwear and
// said `no piece here matches "leather"` while 28 pieces carried the word —
// 16 shoes and 12 bags. Same for "oversized" (19, all tops) and
// "deconstructed" (6, all tailoring). The claim was true about the RACK and
// false about the CATALOG, and those are different facts.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTitleWordScope, categoriesCarrying, listCategories, elsewhereClause,
} from "../lib/search/wordScope.js";
import { searchProducts } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const scope = buildTitleWordScope(CATALOG);

test("the index reads the piece, never the brand", () => {
  // "Chrome Hearts" must not make "chrome" a material this catalog carries.
  const local = buildTitleWordScope([
    { id: "a", category: "accessories", title: "Chrome Hearts — chain necklace" },
  ]);
  assert.deepEqual(categoriesCarrying("chrome", local), []);
  assert.deepEqual(categoriesCarrying("chain", local), ["accessories"]);
});

test("it finds where a word actually lives in the real catalog", () => {
  assert.deepEqual(categoriesCarrying("leather", scope), ["accessories", "footwear"]);
  assert.deepEqual(categoriesCarrying("oversized", scope), ["tops"]);
  assert.deepEqual(categoriesCarrying("deconstructed", scope), ["tailoring"]);
  assert.deepEqual(categoriesCarrying("mohair", scope), ["knitwear"]);
  // Genuinely absent — this catalog has no colour data at all, 0/915.
  assert.deepEqual(categoriesCarrying("black", scope), []);
  assert.deepEqual(categoriesCarrying("waxed", scope), []);
});

test("categories already on screen are not offered back to the reader", () => {
  assert.deepEqual(categoriesCarrying("cropped", scope), ["knitwear"]);
  assert.deepEqual(categoriesCarrying("cropped", scope, ["knitwear"]), []);
});

test("plurals fold the same way the ranker folds them", () => {
  const local = buildTitleWordScope([{ id: "a", category: "footwear", title: "X — tabi boot" }]);
  assert.deepEqual(categoriesCarrying("boots", local), ["footwear"]);
});

test("the clause reads as English, and is null when the word lives nowhere", () => {
  assert.equal(listCategories(["tops"]), "tops");
  assert.equal(listCategories(["accessories", "footwear"]), "accessories and footwear");
  assert.equal(listCategories(["a", "b", "c"]), "a, b and c");
  assert.match(elsewhereClause(["leather"], scope, ["outerwear"]), /the leather here is accessories and footwear/);
  assert.equal(elsewhereClause(["waxed"], scope, ["outerwear"]), null);
});

// ---- engine level ---------------------------------------------------------

test("the disclosure names where the word is, instead of denying it exists", async () => {
  const leather = await searchProducts("leather coat", { limit: 24 });
  assert.ok(leather.results.length > 0);
  assert.match(leather.note, /no "leather" in outerwear — the leather here is accessories and footwear/);
  // The old sentence was the wrong claim and must not survive anywhere in it.
  assert.doesNotMatch(leather.note, /no piece here matches "leather"/);

  const oversized = await searchProducts("oversized knit", { limit: 24 });
  assert.match(oversized.note, /the oversized here is tops/);
});

test("a word the catalog really lacks keeps the sentence it always had", async () => {
  const r = await searchProducts("waxed coat", { limit: 24 });
  assert.match(r.note, /no piece here matches "waxed" — showing outerwear instead/);
});

test("both facts in one query are told apart", async () => {
  const r = await searchProducts("waxed leather coat", { limit: 24 });
  assert.match(r.note, /no piece here matches "waxed"/);
  assert.match(r.note, /the leather here is accessories and footwear/);
});

test("a word the rack DOES carry is still disclosed as nothing", async () => {
  // "cropped knit" has real title matches; there is nothing to disclose.
  const r = await searchProducts("cropped knit", { limit: 24 });
  assert.equal(r.note, null);
  assert.equal(r.results[0].matchReason, "product name match");
});
