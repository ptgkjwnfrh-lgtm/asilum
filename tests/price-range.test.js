// tests/price-range.test.js — budget language beyond a single ceiling.
//
// The dense layer has understood "under 400" since Day 26 and nothing else:
// "over 2000", "between 400 and 800", "more than 1000", "up to 300" all fell
// through to text scoring, where a bare number matches no title and the word
// is disclosed as unmatched. Every one of them is answerable from `price`,
// which 915/915 items carry.
//
// The contract under test:
//   * a budget phrase is consumed ONLY when it resolves to a number — a bare
//     "over" or "under" keeps its text meaning ("over shirt", "under layer");
//   * an unpriced item cannot claim to clear a floor, the same way it cannot
//     claim to be under a ceiling;
//   * a range whose endpoints are both YEARS is a decade, not a $10 band;
//   * an unmeetable budget is said out loud with the nearest real price.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDenseConstraints, applyDenseConstraints } from "../lib/search/denseQuery.js";
import { searchProducts } from "../lib/search/index.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const parse = (s) => parseDenseConstraints(toks(s));

test("ceilings, in every shape people type them", () => {
  for (const q of ["jacket under 400", "jacket below 400", "jacket up to 400",
                   "jacket less than 400", "jacket at most 400"]) {
    assert.equal(parse(q).constraints.maxPrice, 400, q);
    assert.deepEqual(parse(q).tokens, ["jacket"], q);
  }
});

test("floors, which the engine could not read at all before", () => {
  for (const q of ["jacket over 2000", "jacket above 2000",
                   "jacket more than 2000", "jacket at least 2000"]) {
    assert.equal(parse(q).constraints.minPrice, 2000, q);
    assert.deepEqual(parse(q).tokens, ["jacket"], q);
  }
});

test("ranges bound both sides and survive being typed backwards", () => {
  const a = parse("jacket between 400 and 800").constraints;
  assert.deepEqual([a.minPrice, a.maxPrice], [400, 800]);
  const b = parse("jacket 800 to 400").constraints;
  assert.deepEqual([b.minPrice, b.maxPrice], [400, 800]);
});

test("a budget word with no number keeps its text meaning", () => {
  // "over shirt" and "under layer" are garments, not budgets.
  for (const q of ["over shirt", "under layer", "more knit", "at least"]) {
    const { tokens, constraints } = parse(q);
    assert.equal(constraints.minPrice, null, q);
    assert.equal(constraints.maxPrice, null, q);
    assert.deepEqual(tokens, toks(q), q);
  }
});

test("two four-digit years are a decade, not a ten-dollar band", () => {
  // A $1,990-to-$2,000 budget is a band nobody types; 1990–2000 is a decade
  // people ask for constantly. The era layer takes it from here.
  for (const q of ["jacket between 1990 and 2000", "jacket 1990 to 2000"]) {
    const c = parse(q).constraints;
    assert.equal(c.minPrice, null, q);
    assert.equal(c.maxPrice, null, q);
  }
  // …while a real budget range with a four-digit ceiling still parses.
  assert.deepEqual(
    [parse("jacket between 400 and 1500").constraints.minPrice,
     parse("jacket between 400 and 1500").constraints.maxPrice],
    [400, 1500]
  );
});

test("an unpriced item cannot clear a floor", () => {
  const items = [{ id: "a", price: 100 }, { id: "b", price: 900 }, { id: "c", price: null }];
  const kept = applyDenseConstraints(items, { minPrice: 500 }).map((it) => it.id);
  assert.deepEqual(kept, ["b"]);
  assert.deepEqual(applyDenseConstraints(items, { minPrice: 200, maxPrice: 950 }).map((it) => it.id), ["b"]);
});

// ---- engine level ---------------------------------------------------------

test("a floor serves only pieces above it", async () => {
  const r = await searchProducts("jacket over 2000", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.ok(it.price >= 2000, `${it.id} $${it.price}`);
});

test("a range serves only pieces inside it", async () => {
  const r = await searchProducts("knit between 400 and 800", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.ok(it.price >= 400 && it.price <= 800, `${it.id} $${it.price}`);
});

test("an unmeetable budget names the nearest real price", async () => {
  const floor = await searchProducts("jacket over 90000", { limit: 24 });
  assert.equal(floor.results.length, 0);
  assert.match(floor.note, /nothing in outerwear over \$90000 — the most expensive here is \$\d+/);

  const ceiling = await searchProducts("jacket under 400", { limit: 24 });
  assert.equal(ceiling.results.length, 0);
  assert.match(ceiling.note, /under \$400 — the closest starts at \$\d+/);

  const band = await searchProducts("jacket between 5000 and 6000", { limit: 24 });
  assert.equal(band.results.length, 0);
  assert.match(band.note, /between \$5000 and \$6000 — the closest is \$\d+/);
});

test("a budget composes with an era instead of fighting it", async () => {
  const r = await searchProducts("1990s jacket over 1000", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) {
    assert.ok(it.price >= 1000, `${it.id} $${it.price}`);
    assert.ok(it.era.year >= 1990 && it.era.year <= 1999, `${it.id} ${it.era.year}`);
  }
});
