// tests/stem-vocab.test.js — stem-indexed garment vocabulary (r11).
// The strip-s heuristic missed singulars of plural keys ("trouser",
// "sneaker", "cargo") and irregular plurals ("scarves"). Exact keys must
// always win; stems are an internal index only.

import test from "node:test";
import assert from "node:assert/strict";

import { buildStemIndex, lookupToken } from "../lib/search/vocab.js";
import { garmentCategoryOf, genericNounCategoryOf, GARMENT_CATEGORY } from "../lib/search/index.js";

test("every literal table key still resolves to its own value", () => {
  for (const [key, value] of Object.entries(GARMENT_CATEGORY)) {
    assert.equal(garmentCategoryOf(key), value, `exact key "${key}" must win`);
  }
});

test("inflections the strip-s heuristic missed now resolve", () => {
  assert.equal(garmentCategoryOf("trouser"), "bottoms");
  assert.equal(garmentCategoryOf("sneaker"), "footwear");
  assert.equal(garmentCategoryOf("loafer"), "footwear");
  assert.equal(garmentCategoryOf("cargo"), "bottoms");
  assert.equal(garmentCategoryOf("boot"), "footwear");
  assert.equal(garmentCategoryOf("scarves"), "accessories");
  assert.equal(garmentCategoryOf("gowns"), "dresses");
  assert.equal(garmentCategoryOf("hoodies"), "tops");
});

test("generic nouns stem the same way", () => {
  assert.equal(genericNounCategoryOf("sweaters"), "knitwear");
  assert.equal(genericNounCategoryOf("knits"), "knitwear");
  assert.equal(genericNounCategoryOf("jackets"), "outerwear");
  assert.equal(genericNounCategoryOf("shoe"), "footwear");
});

test("unknown tokens stay unknown — stemming never invents vocabulary", () => {
  for (const t of ["gorpcore", "helmut", "storm", "aesthetic", "xyz"]) {
    assert.equal(garmentCategoryOf(t), undefined, `"${t}" must not resolve`);
  }
});

test("exact keys beat stem collisions in buildStemIndex", () => {
  const idx = buildStemIndex({ tee: "A", tees: "B" });
  assert.equal(lookupToken(idx, "tee"), "A");
  assert.equal(lookupToken(idx, "tees"), "B");
});
