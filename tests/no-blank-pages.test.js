// tests/no-blank-pages.test.js — an empty rack must still say something.
//
// Every other disclosure in the engine describes a rack that EXISTS. When
// there is no rack at all the reader got a blank page and, usually, nothing
// else. MEASURED over a 29-query probe set: 16 empty results, 14 of them with
// no note whatsoever —
//
//   "womens under 200"       0 results, silent — and 65 pieces ARE under $200
//   "mens knitwear"          0 results, silent — "knitwear" was not a word
//   "cheap accessories"      0 results, silent — "accessories" was not a word
//   "telfar" / "gym" / "petite" / "gift for my brother"   all silent
//
// This is the one place where saying nothing is indistinguishable from being
// broken.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { searchProducts, GENERIC_GARMENT_NOUNS, GARMENT_CATEGORY } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const PROBES = [
  "womens under 200", "gift under 200 for a friend", "size 44", "hoodei",
  "telfar", "gym", "job interview", "tall guy", "petite",
  "gift for my brother", "for a 40 year old man", "something warm for -5",
  "xxxl knit", "1970s dress", "jacket under 400", "no denim bottoms",
];

test("no empty rack is silent", async () => {
  for (const q of PROBES) {
    const r = await searchProducts(q, { limit: 24 });
    if (r.results.length) continue;
    assert.ok(r.note && r.note.length > 10, `"${q}" returned nothing and said nothing`);
  }
});

test("when constraints applied, the sentence counts each one alone", async () => {
  // So the reader can see which half is the binding one.
  const r = await searchProducts("womens under 200", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /nothing here is womenswear and under \$200/);
  assert.match(r.note, /\d+ pieces are womenswear/);
  assert.match(r.note, /\d+ pieces are under \$200/);
});

test("when nothing applied, it says which words matched nothing", async () => {
  const r = await searchProducts("telfar", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /no piece here matches "telfar"/);
});

test("filler words are not reported as the reason", async () => {
  const r = await searchProducts("gift for my brother", { limit: 24 });
  assert.match(r.note, /"gift", "brother"/);
  assert.doesNotMatch(r.note, /"for"|"my"/);
});

test("a category's own name is vocabulary", async () => {
  // The engine knew "jeans" and "parka" and did not know "bottoms".
  const categories = [...new Set(CATALOG.map((it) => it.category))];
  for (const c of categories) {
    assert.equal(GENERIC_GARMENT_NOUNS[c], c, `"${c}" should name its own category`);
    assert.equal(GARMENT_CATEGORY[c], c, "the two tables must stay in sync");
    const r = await searchProducts(c, { limit: 24 });
    assert.ok(r.results.length > 0, `"${c}" returned nothing`);
    assert.ok(r.results.every((it) => it.category === c),
      `page 1 of "${c}" should be that category`);
  }
});

test("the queries that were blank because of vocabulary now serve", async () => {
  for (const [q, category] of [["mens knitwear", "knitwear"], ["cheap accessories", "accessories"],
                               ["womens tops", "tops"], ["no denim bottoms", "bottoms"]]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.length > 0, q);
    assert.equal(r.results[0].category, category, q);
  }
});

test("the plural fold on \"tops\" is measured, not assumed", async () => {
  // "top" singular is deliberately absent: the tokenizer splits "high-top"
  // into [high, top]. The PLURAL still folds to "top" inside the ranker, so
  // sixteen high-top sneakers do carry a literal hit — they land below all
  // 160 tops and never reach page one. Recorded as a measured fact rather
  // than a claim that it cannot happen.
  const page = await searchProducts("tops", { limit: 24 });
  assert.equal(page.results.filter((it) => it.category !== "tops").length, 0);
  const all = await searchProducts("tops", { limit: 200 });
  assert.equal(all.results.filter((it) => it.category !== "tops").length, 16);
  assert.equal(GENERIC_GARMENT_NOUNS.top, undefined, "the singular stays out");
});
