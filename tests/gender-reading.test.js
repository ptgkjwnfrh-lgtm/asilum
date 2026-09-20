// tests/gender-reading.test.js — WHO A PIECE IS CUT FOR IS READ, NOT DEFAULTED.
//
// MEASURED on production, 20 Sep 2026: lib/ingest/ebay.js records
// size.gender = "unisex" on every eBay row (839 of 897), so the gender
// constraint let everything through and "womens under 200" — a query a real
// reader typed — answered with 513 pieces led by a jacket whose own title
// says "Mens". Every test here fails with lib/search/gender.js unwired.

import test from "node:test";
import assert from "node:assert/strict";

import { titleGender, itemGender, itemMatchesGender } from "../lib/search/gender.js";
import { applyDenseConstraints, parseDenseConstraints } from "../lib/search/denseQuery.js";
import { tokens } from "../lib/search/tokens.js";
import { searchProducts } from "../lib/search/index.js";
import { upsertItems } from "../lib/db/index.js";

test("G1 the title is read for the seller's word", () => {
  assert.equal(titleGender("Millet Aerial Max Gore-Tex Paclite Shell Jacket Mens Lime Green"), "mens");
  assert.equal(titleGender("Vintage 1980s Womens Blue/Black Career Power Suit Blazer"), "womens");
  assert.equal(titleGender("THE ROW Women’s Black Awar lace up 38,5"), "womens");
  assert.equal(titleGender("GUCCI Tom Ford Era Suede GG Tote Women Authentic"), "womens");
  assert.equal(titleGender("Men's 1970's Reddish Brown Vintage Leather Jacket"), "mens");
  assert.equal(titleGender("Ladies cashmere cardigan"), "womens");
  assert.equal(titleGender("Carol Christian Poell Overlock Leather Jacket Black"), null, "no word, no reading");
  assert.equal(titleGender("Men's & Women's unisex tee"), null, "both named: the title does not decide");
  assert.equal(titleGender("Ramen shop tee"), null, "a substring is not a word");
});

test("G2 the record's explicit word wins, the title beats a default unisex, silence stays silent", () => {
  assert.equal(itemGender({ title: "Womens blazer", size: { gender: "mens" } }), "mens", "an explicit record wins");
  assert.equal(itemGender({ title: "Womens blazer", size: { gender: "unisex" } }), "womens", "a title beats the default");
  assert.equal(itemGender({ title: "Wool coat", size: { gender: "unisex" } }), "unisex", "unisex is kept when the title says nothing");
  assert.equal(itemGender({ title: "Wool coat" }), null);
  assert.equal(itemGender({ title: "Mens coat", size: null }), "mens");
  assert.equal(itemMatchesGender({ title: "Mens coat", size: { gender: "unisex" } }, "womens"), false);
  assert.equal(itemMatchesGender({ title: "Wool coat", size: { gender: "unisex" } }, "womens"), true);
  assert.equal(itemMatchesGender({ title: "Wool coat" }, "womens"), true, "absent data never over-filters");
});

const ROWS = [
  { id: "g-shell", title: "Millet Aerial Max Gore-Tex Paclite Shell Jacket Mens Lime Green", brand: "Millet", price: 150, category: "outerwear", size: { gender: "unisex", label: "M" }, tags: { UTILITARIAN: 0.5 } },
  { id: "g-suit", title: "Vintage 1980s Womens Blue/Black Career Power Suit Blazer Jacket", brand: "Unbranded", price: 120, category: "outerwear", size: { gender: "unisex", label: "M" }, tags: { TAILORED: 0.5 } },
  { id: "g-tote", title: "GUCCI Tom Ford Era Black Suede GG Tote Bag Women Authentic", brand: "Gucci", price: 180, category: "accessories", size: null, tags: { SEDUCTIVE: 0.4 } },
  { id: "g-coat", title: "Vintage wool overcoat charcoal", brand: "Unbranded", price: 90, category: "outerwear", size: { gender: "unisex", label: "L" }, tags: { MINIMAL: 0.4 } },
  { id: "g-dear", title: "Womens silk slip dress", brand: "Unbranded", price: 450, category: "dresses", size: { gender: "unisex", label: "S" }, tags: { SEDUCTIVE: 0.5 } },
];

test("G3 the dense constraint reads the title through the same law", () => {
  const { constraints } = parseDenseConstraints(tokens("womens under 200"));
  assert.equal(constraints.gender, "womens");
  assert.equal(constraints.maxPrice, 200);
  const ids = applyDenseConstraints(ROWS, constraints).map((r) => r.id);
  assert.ok(!ids.includes("g-shell"), "a title that says Mens is not womenswear, whatever the default record says");
  assert.ok(ids.includes("g-suit") && ids.includes("g-tote"), "the pieces the sellers wrote women's for");
  assert.ok(ids.includes("g-coat"), "a piece that says nothing still passes — absent data never over-filters");
  assert.ok(!ids.includes("g-dear"), "over budget");
});

test("G4 end to end: 'womens under 200' no longer opens on a men's shell, and the women's pieces lead", async () => {
  await upsertItems(ROWS);
  const r = await searchProducts("womens under 200", { userId: null, log: false });
  const ids = r.results.map((i) => i.id);
  assert.ok(!ids.includes("g-shell"), `the men's shell is off the rack: ${ids}`);
  assert.ok(ids.includes("g-suit") && ids.includes("g-tote"), `the women's pieces are on it: ${ids}`);
  const firstUnknown = ids.indexOf("g-coat");
  const lastWomens = Math.max(ids.indexOf("g-suit"), ids.indexOf("g-tote"));
  assert.ok(firstUnknown === -1 || firstUnknown > lastWomens,
    `pieces the seller wrote women's for lead the pieces that say nothing: ${ids}`);
  const m = await searchProducts("mens jacket under 300", { userId: null, log: false });
  const mids = m.results.map((i) => i.id);
  assert.ok(mids.includes("g-shell") && !mids.includes("g-suit"), `mens: ${mids}`);
});
