// tests/origin-reading.test.js — "japanese coat" is answerable, and the
// answer comes from a curated record rather than a guess.
//
// The contract under test:
//   * a demonym becomes a CONSTRAINT over the house's base (houses.js), not
//     an aesthetic and not a designer's nationality;
//   * a house the record does not know cannot pass — unknown is not a quiet
//     yes, and it is not a quiet no either: the coverage hole is reportable;
//   * an origin this catalog holds nothing from falls back and says so;
//   * every curated row carries the reason it says what it says.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HOUSES, HOUSE_ORIGIN_PROVENANCE, houseOrigin, houseIsFrom, originCoverage,
} from "../lib/asterisk/houses.js";
import {
  parseOriginConstraint, applyOriginConstraint, itemMatchesOrigin, originMissNote, ORIGIN_WORDS,
} from "../lib/search/origin.js";
import { correctTokens, buildTypoVocab } from "../lib/search/typo.js";
import { searchProducts, GARMENT_CATEGORY, GENERIC_GARMENT_NOUNS } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const parse = (s) => parseOriginConstraint(toks(s));

test("every curated row carries a country and the reason it says so", () => {
  const rows = Object.entries(HOUSES);
  assert.ok(rows.length >= 60, `expected the catalog's houses, got ${rows.length}`);
  for (const [brand, rec] of rows) {
    assert.equal(typeof rec.country, "string", brand);
    assert.ok(rec.country.length > 1, brand);
    assert.ok(typeof rec.basis === "string" && rec.basis.length > 10,
      `${brand} has no basis line — a curated record without its reason is a guess`);
  }
  assert.equal(HOUSE_ORIGIN_PROVENANCE.method, "curated-editorial");
  assert.match(HOUSE_ORIGIN_PROVENANCE.curatedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("coverage is reported, and the hole is named rather than filled", () => {
  const brands = [...new Set(CATALOG.map((it) => it.brand))];
  const cov = originCoverage(brands);
  assert.ok(cov.known / cov.total >= 0.95, `coverage ${cov.known}/${cov.total}`);
  // Namacheko is deliberately absent — see the comment at the end of HOUSES.
  assert.equal(houseOrigin("Namacheko"), null);
  assert.equal(houseIsFrom("Namacheko", "Belgium"), false);
  assert.equal(houseIsFrom("Namacheko", "Sweden"), false);
});

test("a house that moved answers to both countries", () => {
  // Rick Owens was founded in Los Angeles and has run out of Paris since
  // 2003. Both readings of the question are things a person can mean.
  assert.equal(houseIsFrom("Rick Owens", "France"), true);
  assert.equal(houseIsFrom("Rick Owens", "United States"), true);
  assert.equal(houseIsFrom("Rick Owens", "Italy"), false);
  assert.equal(houseIsFrom("Vetements", "Switzerland"), true);
  assert.equal(houseIsFrom("Vetements", "France"), true);
});

test("a designer's passport is not the house's base", () => {
  // Each of these is a house whose founder came from somewhere else. The
  // record says where the HOUSE is; the basis line says the rest.
  assert.equal(houseOrigin("Balenciaga").country, "France");
  assert.match(houseOrigin("Balenciaga").basis, /Spanish/);
  assert.equal(houseOrigin("Off-White").country, "Italy");
  assert.match(houseOrigin("Off-White").basis, /American/);
  assert.equal(houseOrigin("Maison Margiela").country, "France");
  assert.match(houseOrigin("Maison Margiela").basis, /Belgian/);
  assert.equal(houseOrigin("Kiko Kostadinov").country, "United Kingdom");
  assert.match(houseOrigin("Kiko Kostadinov").basis, /Bulgarian/);
});

test("demonyms, country nouns and groups all parse; continents do not", () => {
  assert.deepEqual(parse("japanese coat").origin.countries, ["Japan"]);
  assert.deepEqual(parse("japan coat").origin.countries, ["Japan"]);
  assert.deepEqual(parse("scandinavian knit").origin.countries, ["Sweden", "Denmark", "Norway"]);
  // A continent is too coarse to be an answer anyone wanted.
  assert.equal(parse("european coat").origin, null);
  assert.equal(parse("asian coat").origin, null);
  // The word leaves the scoring stream; the garment stays.
  assert.deepEqual(parse("japanese coat").tokens, ["coat"]);
});

test("london stays a place, not a passport", () => {
  // The culture catalog serves cities well; hijacking "london" into a
  // country filter would replace a working reading with a coarser one.
  assert.equal(parse("london").origin, null);
});

test("an unknown house cannot pass, and a null constraint is a no-op", () => {
  const items = [
    { id: "a", brand: "Sacai" }, { id: "b", brand: "Prada" },
    { id: "c", brand: "Namacheko" }, { id: "d", brand: null },
  ];
  const jp = parse("japanese knit").origin;
  assert.deepEqual(applyOriginConstraint(items, jp).map((it) => it.id), ["a"]);
  assert.equal(applyOriginConstraint(items, null).length, 4);
  assert.equal(itemMatchesOrigin({ brand: "Namacheko" }, jp), false);
  assert.equal(itemMatchesOrigin({ brand: "Sacai" }, null), true);
});

test("the miss note points at what IS here from that country", () => {
  const jp = parse("japanese boots").origin;
  const withSome = originMissNote(jp, [{ brand: "Sacai" }, { brand: "Prada" }], "footwear", { fellBack: true });
  assert.match(withSome, /Sacai/);
  assert.match(withSome, /showing footwear instead/);
  const kr = parse("korean boots").origin;
  assert.match(originMissNote(kr, [{ brand: "Sacai" }], "footwear"), /no korean houses in this catalog/);
});

test("the typo bridge never rewrites an origin word", () => {
  const vocab = buildTypoVocab({
    garmentKeys: [...Object.keys(GARMENT_CATEGORY), ...Object.keys(GENERIC_GARMENT_NOUNS)],
    mappings: [],
  });
  const words = [...ORIGIN_WORDS].filter((w) => w.length >= 5 && /^[a-z]+$/.test(w));
  const { tokens, corrections } = correctTokens(words, vocab, () => false);
  assert.deepEqual(tokens, words);
  assert.deepEqual(corrections, []);
});

// ---- engine level ---------------------------------------------------------

test("an origin query serves only houses from there", async () => {
  const r = await searchProducts("japanese coat", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.ok(houseIsFrom(it.brand, "Japan"), `${it.id} ${it.brand}`);
  assert.equal(r.interpreted.origin.served, true);
  assert.match(r.note, /reading "japanese" as the house's base/);
  assert.equal(r.unmatchedTokens.includes("japanese"), false);
});

test("an origin this catalog holds nothing from falls back and says so", async () => {
  const r = await searchProducts("korean jacket", { limit: 24 });
  assert.ok(r.results.length > 0, "falls back to the origin-free rack");
  assert.equal(r.interpreted.origin.served, false);
  assert.match(r.note, /no korean houses in this catalog/);
  assert.match(r.note, /showing outerwear instead/);
});

test("origin composes with era, and both are named", async () => {
  const r = await searchProducts("1990s japanese jacket", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) {
    assert.ok(houseIsFrom(it.brand, "Japan"), `${it.id} ${it.brand}`);
    assert.ok(it.era.year >= 1990 && it.era.year <= 1999, `${it.id} ${it.era.year}`);
  }
  assert.match(r.note, /"1990s" as the 1990s and "japanese" as the house's base/);
});

test("a constraint-only query is answered by the constrained pool", async () => {
  // MEASURED: with origin reading on and no such rule, a bare "japanese"
  // returned ZERO while 184 pieces from Japanese houses sat in the pool —
  // the ranker had no token left to score. The same hole is older than this
  // round and swallowed "womens" and "under 400" too.
  const jp = await searchProducts("japanese", { limit: 24 });
  assert.ok(jp.results.length > 0);
  assert.equal(jp.results[0].matchReason, "constraint match");
  for (const it of jp.results) assert.ok(houseIsFrom(it.brand, "Japan"), it.brand);

  const womens = await searchProducts("womens", { limit: 24 });
  assert.ok(womens.results.length > 0, "the older half of the same hole");

  const budget = await searchProducts("under 400", { limit: 24 });
  assert.ok(budget.results.length > 0);
  for (const it of budget.results) assert.ok(it.price <= 400, `$${it.price}`);
});

test("a known cultural entity still outranks the constraint rack", async () => {
  // "belgian" reads as the Antwerp Six — now ranked INSIDE Belgian houses,
  // which is better than either half alone.
  const r = await searchProducts("belgian", { limit: 24 });
  assert.equal(r.cultural.engaged, true);
  for (const it of r.results) assert.ok(houseIsFrom(it.brand, "Belgium"), it.brand);
});

test("a query naming no origin is byte-identical with the reading off", async () => {
  for (const q of ["jacket", "trashed jeans", "good blanks", "like rick owens", "playboi carti"]) {
    const on = await searchProducts(q, { limit: 24, originReading: true });
    const off = await searchProducts(q, { limit: 24, originReading: false });
    const print = (r) => r.results.map((it) => `${it.id}|${it.matchReason}|${it.confidenceScore}`);
    assert.deepEqual(print(on), print(off), q);
    assert.equal(on.note, off.note, q);
  }
});

test("the kill flag restores the pre-change behavior exactly", async () => {
  const off = await searchProducts("japanese coat", { limit: 24, originReading: false });
  assert.ok(off.results.some((it) => !houseIsFrom(it.brand, "Japan")), "unfiltered rack");
  assert.match(off.note, /no piece here matches "japanese"/);
});
