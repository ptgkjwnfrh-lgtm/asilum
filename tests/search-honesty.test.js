// tests/search-honesty.test.js — the search-honesty round (Aug 5, 2026).
//
// Owner-reported defect, reproduced on production: different queries returned
// the same results. A query word the catalog cannot match contributed nothing,
// every item in the garment category tied, ties fell to pool order — and every
// row was still labelled a match. These guard the three pure-module fixes and
// the disclosure contract. The full behavioural battery (declared criteria,
// canonical probes) lives in scripts/measure-search-honesty.mjs.

import test from "node:test";
import assert from "node:assert/strict";

import { correctTokens, buildTypoVocab, isProtectedWord } from "../lib/search/typo.js";
import { buildStemIndex, lookupToken } from "../lib/search/vocab.js";
import { parseDenseConstraints, applyDenseConstraints } from "../lib/search/denseQuery.js";

test("typo bridge never corrects real fashion vocabulary", () => {
  // Each of these sat within edit-distance 1 of a garment key and WAS silently
  // rewritten before this round: plaid→plain, shift→shirt, smock→sock.
  const vocab = buildTypoVocab({
    garmentKeys: ["shirt", "sock", "gauge", "linen", "drill", "plain", "skirt"],
    mappings: [],
  });
  const words = ["shift", "plaid", "smock", "gauze", "lined", "frill", "sheath", "halter"];
  const { tokens, corrections } = correctTokens(words, vocab, () => false);
  assert.deepEqual(tokens, words, "no real fashion word may be rewritten");
  assert.equal(corrections.length, 0);
  for (const w of words) assert.ok(isProtectedWord(w), `${w} must be protected`);
});

test("typo bridge still corrects genuine misspellings", () => {
  const vocab = buildTypoVocab({ garmentKeys: ["sweater", "trousers"], mappings: [] });
  const { tokens, corrections } = correctTokens(["sweter"], vocab, () => false);
  assert.deepEqual(tokens, ["sweater"], "a real typo must still be bridged");
  assert.equal(corrections[0].from, "sweter");
});

test("stem lookup resolves noun inflections but never -ed/-ing forms", () => {
  const idx = buildStemIndex({
    trousers: "bottoms", tights: "bottoms", coat: "outerwear",
    knit: "knitwear", dress: "dresses", suit: "tailoring", belt: "accessories",
  });
  assert.equal(lookupToken(idx, "trouser"), "bottoms", "noun inflection must still resolve");
  assert.equal(lookupToken(idx, "coat"), "outerwear", "exact keys unaffected");
  // The defect: modifiers stemmed onto noun keys and became decisive category
  // evidence — "coated denim" flooded outerwear onto a bottoms query.
  for (const [token, was] of [["coated", "outerwear"], ["knitted", "knitwear"],
                              ["dressed", "dresses"], ["dressing", "dresses"],
                              ["belted", "accessories"], ["suiting", "tailoring"]]) {
    assert.equal(lookupToken(idx, token), undefined,
      `"${token}" must not resolve to ${was} through a stem`);
  }
});

test("climate constraint no longer inverts insulation words", () => {
  // "warm coat" means an insulating coat; it used to hard-filter every
  // Fall/Winter item — 94 of 170 outerwear pieces — out of the pool.
  assert.equal(parseDenseConstraints(["warm", "coat"]).constraints.climate, null);
  assert.equal(parseDenseConstraints(["cold", "shoulder", "top"]).constraints.climate, null);
  // Unambiguous season words still constrain.
  assert.equal(parseDenseConstraints(["winter", "coat"]).constraints.climate, "cold-weather");
  assert.equal(parseDenseConstraints(["summer", "dress"]).constraints.climate, "warm-weather");

  const items = [
    { id: "fw", era: { season: "Fall/Winter" } },
    { id: "ss", era: { season: "Spring/Summer" } },
  ];
  assert.deepEqual(
    applyDenseConstraints(items, parseDenseConstraints(["warm", "coat"]).constraints).map((i) => i.id),
    ["fw", "ss"], "an insulation word must not remove cold-weather pieces");
});

test("typo bridge protects catalog vocabulary and culture names (vibe sweep)", () => {
  // "liner" is a real product word (padded liner jacket) that was rewritten
  // to "linen"; "hiker" (GORE-TEX hiker) became "biker"; "drake" (culture
  // entity) became "drape"; "grape" is produce, not a typo of "drape".
  for (const w of ["liner", "hiker", "drake", "diana", "grape", "light", "french"]) {
    assert.ok(isProtectedWord(w), `"${w}" must be protected from correction`);
  }
});

test("a known culture entity outranks the lexicon guess (entity precedence)", async () => {
  process.env.DATABASE_URL = "";
  const { searchProducts } = await import("../lib/search/index.js");
  const { CULTURE } = await import("../lib/asterisk/culture.js");
  const e = CULTURE.find((x) => x.name === "john galliano");
  assert.ok(e, "test premise: the entity exists");
  const slate = new Set();
  for (const it of e.interpretations || []) for (const t of it.tags || []) slate.add(t.toUpperCase());
  const r = await searchProducts("john galliano", { limit: 12 });
  assert.equal(r.cultural?.engaged, true, "the curated read must serve, not the lexicon guess");
  assert.ok(r.results.length > 0);
  for (const it of r.results) {
    assert.ok(Object.keys(it.tags || {}).some((t) => slate.has(t.toUpperCase())),
      `${it.id} carries none of the entity's slate tags`);
  }
});

test("product-name match requires a word boundary", async () => {
  process.env.DATABASE_URL = "";
  const { searchProducts } = await import("../lib/search/index.js");
  const r = await searchProducts("deco", { limit: 8 });
  for (const it of r.results) {
    assert.notEqual(it.matchReason, "product name match",
      `"deco" must not product-name-match inside "deconstructed" (${it.id})`);
  }
});
