// tests/ontology-vocab.test.js — Fashionpedia-informed vocabulary (r13).
// The crosswalk must resolve into the live category space, the landmine
// exclusions must stay excluded, and the vendored extract must carry its
// attribution.

import test from "node:test";
import assert from "node:assert/strict";

import { ONTOLOGY_GARMENT_NOUNS } from "../lib/search/ontology.js";
import { garmentCategoryOf } from "../lib/search/index.js";
import ONTOLOGY from "../lib/search/fashionpedia-ontology.json" with { type: "json" };
import { CATALOG } from "../lib/ingest/catalog.js";

const LIVE_CATEGORIES = new Set(CATALOG.map((it) => it.category));

test("every crosswalk entry maps into the live category space", () => {
  for (const [noun, cat] of Object.entries(ONTOLOGY_GARMENT_NOUNS)) {
    assert.ok(LIVE_CATEGORIES.has(cat), `"${noun}" maps to unknown category "${cat}"`);
  }
});

test("new nouns resolve through the engine lookup (incl. stems)", () => {
  assert.equal(garmentCategoryOf("windbreaker"), "outerwear");
  assert.equal(garmentCategoryOf("sweatpants"), "bottoms");
  assert.equal(garmentCategoryOf("culottes"), "bottoms");
  assert.equal(garmentCategoryOf("sweatshirts"), "tops");
  assert.equal(garmentCategoryOf("kaftans"), "dresses");
  assert.equal(garmentCategoryOf("trench"), "outerwear");
});

test("landmine exclusions stay excluded", () => {
  for (const t of ["top", "tie", "crop", "halter", "sheath", "jumper", "hood", "collar", "lapel", "sleeve", "pocket"]) {
    assert.equal(ONTOLOGY_GARMENT_NOUNS[t], undefined, `"${t}" must not be in the crosswalk`);
  }
  assert.equal(garmentCategoryOf("tie"), undefined);
  assert.equal(garmentCategoryOf("crop"), undefined);
});

test("vendored extract carries provenance and no image data", () => {
  assert.match(ONTOLOGY.license, /CC BY 4\.0/);
  assert.ok(ONTOLOGY.attribution.includes("Fashionpedia"));
  assert.equal(ONTOLOGY.categories.length, 46);
  assert.equal(ONTOLOGY.attributes.length, 294);
  assert.equal(ONTOLOGY.images, undefined);
  assert.equal(ONTOLOGY.annotations, undefined);
});

test("every crosswalk noun is evidenced by the ontology", () => {
  const vocab = new Set();
  for (const c of ONTOLOGY.categories) for (const w of c.name.split(/[\s,()-]+/)) vocab.add(w.toLowerCase());
  for (const a of ONTOLOGY.attributes) for (const w of a.name.split(/[\s,()-]+/)) vocab.add(w.toLowerCase());
  for (const noun of Object.keys(ONTOLOGY_GARMENT_NOUNS)) {
    const singular = noun.replace(/s$/, "");
    assert.ok(vocab.has(noun) || vocab.has(singular) || vocab.has(noun + "s"),
      `"${noun}" has no evidence in the vendored ontology`);
  }
});
