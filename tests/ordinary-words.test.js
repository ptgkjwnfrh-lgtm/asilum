// tests/ordinary-words.test.js — A WORD THE ENGINE OWNS IS NOT A NAME.
//
// MEASURED on production, 20 Sep 2026 (897 eBay listings): bare "black" was a
// BRAND query (a listing whose brand field says "Black"), served under
// "reading "black" as the designer …", and bare "leather" resolved to the one
// listing branded "casablanca leather" — 1 result where ~100 leather pieces
// were in stock. Every test here fails with lib/search/ordinary.js unwired.

import test from "node:test";
import assert from "node:assert/strict";

import { isOrdinaryWord, ordinaryWords } from "../lib/search/ordinary.js";
import { getSearchIntent, brandMatch } from "../lib/search/intent.js";
import { searchProducts } from "../lib/search/index.js";
import { upsertItems } from "../lib/db/index.js";

const BRANDS = ["Black", "Gucci", "casablanca leather", "Wilson's Leather", "Craig Green", "BLACKYAK", "Rick Owens"];

test("O1 the law covers the engine's own colour, material, gender and garment words — and nothing else", () => {
  for (const w of ["black", "leather", "womens", "jacket", "silk", "boots", "Black", "LEATHER"]) {
    assert.equal(isOrdinaryWord(w), true, w);
  }
  for (const w of ["gucci", "craig green", "blackyak", "rick owens", "", "black leather", "tabi"]) {
    assert.equal(isOrdinaryWord(w), false, JSON.stringify(w));
  }
  assert.ok(ordinaryWords().length > 80, "the lists are real, not a stub");
});

test("O2 a bare ordinary word is a text query even when a brand field spells it", () => {
  assert.deepEqual(getSearchIntent("black", BRANDS), { intent: "text" });
  assert.deepEqual(getSearchIntent("leather", BRANDS), { intent: "text" });
  assert.deepEqual(getSearchIntent("boots", BRANDS), { intent: "text" });
  // Real houses still read as houses — exact, partial, and short-form paths untouched.
  assert.equal(getSearchIntent("gucci", BRANDS).intent, "brand");
  assert.equal(getSearchIntent("craig green", BRANDS).brand, "Craig Green");
  assert.equal(getSearchIntent("blackyak", BRANDS).brand, "BLACKYAK");
  assert.equal(getSearchIntent("like gucci", BRANDS).intent, "designer-similar");
  // The partial rule itself is unchanged for a non-ordinary word.
  assert.equal(brandMatch("owens", BRANDS), "Rick Owens");
});

test("O3 end to end: bare 'black' and 'leather' serve the pieces, not the brand field", async () => {
  await upsertItems([
    { id: "ow-1", title: "Stone Island Nylon Authentic Shadow Project Jacket", brand: "Black", price: 300, category: "outerwear", tags: { MINIMAL: 0.5 } },
    { id: "ow-2", title: "Gucci Black Leather Belt", brand: "Gucci", price: 400, category: "accessories", tags: { MINIMAL: 0.4 } },
    { id: "ow-3", title: "Vintage 1970s Black Biker Leather Jacket Large", brand: "Unbranded", price: 299, category: "outerwear", tags: { leather: 0.5 } },
    { id: "ow-4", title: "Men's 1970s Reddish Brown Vintage Leather Jacket", brand: "casablanca leather", price: 120, category: "outerwear", tags: { leather: 0.5 } },
    { id: "ow-5", title: "Wilson's Leather Bomber", brand: "Wilson's Leather", price: 90, category: "outerwear", tags: { leather: 0.5 } },
  ]);
  const black = await searchProducts("black", { userId: null, log: false });
  assert.equal(black.interpreted.intent, "text");
  const blackIds = black.results.map((r) => r.id);
  assert.ok(blackIds.includes("ow-2") && blackIds.includes("ow-3"), `the black pieces: ${blackIds}`);
  assert.ok(!blackIds.includes("ow-1"), "the listing whose brand field says Black, with no black in the piece, is not on the rack");
  assert.ok(!/as the designer/.test(black.note || ""), `no house is read from a colour: ${black.note}`);

  const leather = await searchProducts("leather", { userId: null, log: false });
  assert.equal(leather.interpreted.intent, "text");
  const leatherIds = leather.results.map((r) => r.id);
  for (const id of ["ow-2", "ow-3", "ow-4"]) assert.ok(leatherIds.includes(id), `${id} is a leather piece: ${leatherIds}`);
  // "Wilson's Leather Bomber" carries "leather" ONLY in its brand name — the
  // piece is a bomber. The brand is not the piece (Aug 21), so it is not on
  // the rack for a material it never mentions; before this law it was, as a
  // "brand match".
  assert.ok(!leatherIds.includes("ow-5"), "a brand name is not a material");
  assert.ok(!/as the designer/.test(leather.note || ""), `no house is read from a material: ${leather.note}`);
});
