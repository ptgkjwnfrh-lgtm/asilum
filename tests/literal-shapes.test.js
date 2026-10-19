// tests/literal-shapes.test.js — five shapes the catalog could always answer.
//
//   "cheapest jacket"       opened at $970 while the cheapest outerwear is $545
//   "most expensive knit"   opened at $785 while the dearest knit is $980
//   "jacket and boots"      290 ranked — 170 outerwear, 120 footwear — and a
//                           page that was 24 of 24 outerwear, silently
//   "resort jacket"         `no piece here matches "resort"` while 41
//                           outerwear pieces ARE Resort; 463 of 915 items sit
//                           in Resort or Pre-Fall with no standalone path
//   "fw15"                  ZERO results, though "fall 2015 jacket" worked and
//                           lib/tagging/dense.js already mints that shorthand
//   "show me 5 jackets"     could not even report that it ignored the 5 — the
//                           tokenizer deleted every single-digit number
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePriceSuperlative, applyPriceSort } from "../lib/search/superlative.js";
import { parseEraConstraint } from "../lib/search/era.js";
import { parseDenseConstraints } from "../lib/search/denseQuery.js";
import { searchProducts } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 || /^[0-9]$/.test(t));

// ---- superlatives ----------------------------------------------------------

test("a superlative is read; a bare adjective is not", () => {
  assert.equal(parsePriceSuperlative("cheapest jacket", toks("cheapest jacket")).sort.direction, "asc");
  assert.equal(parsePriceSuperlative("most expensive knit", toks("most expensive knit")).sort.direction, "desc");
  assert.equal(parsePriceSuperlative("priciest dress", toks("priciest dress")).sort.direction, "desc");
  // "cheap" needs a threshold this catalog cannot justify — denseQuery
  // declines it deliberately and so does this.
  assert.equal(parsePriceSuperlative("cheap jacket", toks("cheap jacket")).sort, null);
  assert.equal(parsePriceSuperlative("expensive knit", toks("expensive knit")).sort, null);
  // The words leave the stream so they cannot pollute text scoring.
  assert.deepEqual(parsePriceSuperlative("cheapest jacket", toks("cheapest jacket")).tokens, ["jacket"]);
});

test("an unpriced piece cannot be the cheapest of anything", () => {
  const sorted = applyPriceSort(
    [{ id: "a", price: 100 }, { id: "b", price: null }, { id: "c", price: 50 }],
    { direction: "asc" }
  );
  assert.deepEqual(sorted.map((it) => it.id), ["c", "a", "b"]);
});

test("the engine sorts, and names the sort", async () => {
  const cheap = await searchProducts("cheapest jacket", { limit: 24 });
  const prices = cheap.results.map((it) => it.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  assert.equal(prices[0], Math.min(...CATALOG.filter((it) => it.category === "outerwear").map((it) => it.price)));
  assert.match(cheap.note, /sorted by price, lowest first/);

  const dear = await searchProducts("most expensive knit", { limit: 24 });
  const dp = dear.results.map((it) => it.price);
  assert.deepEqual(dp, [...dp].sort((a, b) => b - a));
});

// ---- collection slots ------------------------------------------------------

test("resort, cruise and pre-fall name a collection and nothing else", () => {
  assert.equal(parseEraConstraint(toks("resort jacket")).era.season, "Resort");
  assert.equal(parseEraConstraint(toks("cruise dress")).era.season, "Resort");
  assert.equal(parseEraConstraint(toks("pre fall knit")).era.season, "Pre-Fall");
  // "winter" and "summer" stay with the climate constraint — a use, not a slot.
  assert.equal(parseEraConstraint(toks("winter coat")).era, null);
  assert.equal(parseEraConstraint(toks("summer dress")).era, null);
  // A slot WITH a year is still the exact collection.
  assert.deepEqual(
    [parseEraConstraint(toks("resort 2016 knit")).era.minYear, parseEraConstraint(toks("resort 2016 knit")).era.season],
    [2016, "Resort"]
  );
});

test("the trade's shorthand resolves, and never to the wrong century", () => {
  const fw = parseEraConstraint(toks("fw15"), { nowYear: 2026 }).era;
  assert.deepEqual([fw.season, fw.minYear], ["Fall/Winter", 2015]);
  assert.equal(parseEraConstraint(toks("aw18"), { nowYear: 2026 }).era.season, "Fall/Winter");
  assert.equal(parseEraConstraint(toks("ss01"), { nowYear: 2026 }).era.minYear, 2001);
  assert.equal(parseEraConstraint(toks("pf19"), { nowYear: 2026 }).era.season, "Pre-Fall");
  // A two-digit year in the future resolves to the last century.
  assert.equal(parseEraConstraint(toks("fw98"), { nowYear: 2026 }).era.minYear, 1998);
});

test("a collection query serves only that collection", async () => {
  for (const [q, season] of [["resort jacket", "Resort"], ["pre fall knit", "Pre-Fall"],
                             ["cruise dress", "Resort"], ["aw18 knit", "Fall/Winter"]]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.length > 0, q);
    for (const it of r.results) assert.equal(it.era.season, season, `${q}: ${it.id}`);
  }
});

// ---- conjunctions ----------------------------------------------------------

test("both garments reach page one, and the note refuses to pair them", async () => {
  const r = await searchProducts("jacket and boots", { limit: 24 });
  const cats = new Set(r.results.map((it) => it.category));
  assert.ok(cats.has("outerwear") && cats.has("footwear"));
  assert.match(r.note, /side by side/);
  // This catalog holds no compatibility data of any kind.
  assert.match(r.note, /no data on what goes with what/);
});

test("a single-category query is not reordered", async () => {
  const plain = await searchProducts("jacket", { limit: 24 });
  assert.doesNotMatch(String(plain.note || ""), /side by side/);
  // "trousers or shorts" is one category, so nothing interleaves.
  const one = await searchProducts("trousers or shorts", { limit: 24 });
  assert.doesNotMatch(String(one.note || ""), /side by side/);
});

test("a conjunction is not reported as an unmatched word", async () => {
  const r = await searchProducts("jacket and boots", { limit: 24 });
  assert.equal(r.unmatchedTokens.includes("and"), false);
  assert.doesNotMatch(String(r.note || ""), /matches "and"/);
});

// ---- digits ----------------------------------------------------------------

test("a single digit survives the tokenizer", async () => {
  const r = await searchProducts("show me 5 jackets", { limit: 24 });
  assert.ok(r.unmatchedTokens.includes("5"), "the digit is reported, not swallowed");
});

test("a count is not a budget", () => {
  assert.equal(parseDenseConstraints(toks("under 3 items")).constraints.maxPrice, null);
  assert.equal(parseDenseConstraints(toks("under 5 pieces")).constraints.maxPrice, null);
  // A real budget still parses.
  assert.equal(parseDenseConstraints(toks("jacket under 400")).constraints.maxPrice, 400);
});
