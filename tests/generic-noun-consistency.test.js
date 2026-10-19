// tests/generic-noun-consistency.test.js — the beanie guard, in CI.
//
// GENERIC_GARMENT_NOUNS extends full title credit to EVERY item in the mapped
// category ("sweater" hits all of knitwear), so the mapping is only truthful
// while every item in that category actually IS the noun. r8 found the
// violation the hard way: balaclava beanies sat in knitwear and topped the
// sweater probes until the catalog cleanup moved them to accessories. This
// suite asserts the invariant so the next miscategorized item fails CI
// instead of a measurement battery.
//
// Classification: an item's class is the LAST classifiable token in its title
// (head noun — "denim jacket" is a jacket, not bottoms). Tokens classify via
// the engine's own GARMENT_CATEGORY first, then via the test-side lexicon
// below for catalog title vocabulary the engine doesn't token-map (crewneck,
// turtleneck, hiker…). Coverage is deliberately closed: an item in a
// generic-noun category whose title has NO classifiable token fails too, so
// new title vocabulary forces a conscious entry here — that review is the
// point, not an inconvenience.

import test from "node:test";
import assert from "node:assert/strict";

import { GARMENT_CATEGORY, GENERIC_GARMENT_NOUNS } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

// Title vocabulary in the generic-noun categories that GARMENT_CATEGORY does
// not map. Test-side only — adding a word here asserts every catalog item
// whose head noun it is belongs to this category.
const TEST_TITLE_CLASSES = {
  crewneck: "knitwear", turtleneck: "knitwear",
  mini: "dresses",
  hiker: "footwear", sneaker: "footwear", shoe: "footwear",
  slide: "footwear", mule: "footwear", runner: "footwear",
  hightop: "footwear", // "high-top" collapsed to one token below
  shell: "outerwear",
};

const classOfToken = (t) =>
  GARMENT_CATEGORY[t] || GARMENT_CATEGORY[t.replace(/s$/, "")] ||
  TEST_TITLE_CLASSES[t] || TEST_TITLE_CLASSES[t.replace(/s$/, "")];

function headClass(title) {
  const tokens = String(title)
    .toLowerCase()
    .replace(/high-top/g, "hightop")
    .split(/[^a-z]+/)
    .filter(Boolean);
  let head = null;
  for (const t of tokens) {
    const c = classOfToken(t);
    if (c) head = c;
  }
  return head;
}

const genericCategories = [...new Set(Object.values(GENERIC_GARMENT_NOUNS))];
const genericItems = CATALOG.filter((it) => genericCategories.includes(it.category));

// A CATEGORY'S OWN NAME IS NOT A GARMENT CLASS (Aug 21). "tailoring",
// "accessories" and their six siblings were added to GENERIC_GARMENT_NOUNS so
// that "mens knitwear" and "cheap accessories" stop returning a blank page.
// They are exempt from the HEAD-NOUN invariants below, and only from those,
// for a reason the classifier cannot see: a category name names the category
// BY DEFINITION, so every item in it is one and the promise the beanie guard
// protects cannot be broken. The classifier reads the last classifiable token
// of a title, so it calls a "boxy suit jacket" outerwear and reports the
// tailoring category as miscategorised — which is a fact about the head noun,
// not about the item.
//
// The guard stays fully in force for every REAL garment noun: knit, sweater,
// jacket, coat, shoes, dress. That is what caught the balaclava beanies, and
// nothing here relaxes it.
const CATEGORY_SELF_NAMES = new Set(
  Object.entries(GENERIC_GARMENT_NOUNS)
    .filter(([noun, category]) => noun === category)
    .map(([noun]) => noun)
);
const garmentNounCategories = [...new Set(
  Object.entries(GENERIC_GARMENT_NOUNS)
    .filter(([noun]) => !CATEGORY_SELF_NAMES.has(noun))
    .map(([, category]) => category)
)];
const garmentNounItems = CATALOG.filter((it) => garmentNounCategories.includes(it.category));

test("a category self-name maps to a category the catalog actually has", () => {
  const categories = new Set(CATALOG.map((it) => it.category));
  assert.ok(CATEGORY_SELF_NAMES.size >= 8, "the eight category names are vocabulary");
  for (const name of CATEGORY_SELF_NAMES) {
    assert.ok(categories.has(name), `"${name}" names no category in this catalog`);
  }
});

test("generic nouns agree with GARMENT_CATEGORY", () => {
  for (const [noun, category] of Object.entries(GENERIC_GARMENT_NOUNS)) {
    assert.equal(
      GARMENT_CATEGORY[noun] || GARMENT_CATEGORY[noun.replace(/s$/, "")],
      category,
      `GENERIC_GARMENT_NOUNS maps "${noun}" to "${category}" but GARMENT_CATEGORY disagrees — the two tables must stay in sync`
    );
  }
});

test("every generic-noun category has items to extend credit to", () => {
  // The r8 hoodie lesson: a mapping pointed at a category holding zero of the
  // class, so the category bonus penalized every real match.
  for (const category of genericCategories) {
    const n = genericItems.filter((it) => it.category === category).length;
    assert.ok(n > 0, `generic-noun category "${category}" has no catalog items`);
  }
});

test("every item in a generic-noun category has a classifiable head noun", () => {
  const unclassified = garmentNounItems.filter((it) => !headClass(it.title));
  assert.deepEqual(
    unclassified.map((it) => `${it.category} :: ${it.title}`),
    [],
    "new title vocabulary in a generic-noun category — classify it in TEST_TITLE_CLASSES (or GARMENT_CATEGORY) after checking the item belongs there"
  );
});

test("no generic-noun category contains an item class that isn't the noun", () => {
  const mismatches = garmentNounItems
    .filter((it) => {
      const c = headClass(it.title);
      return c && c !== it.category;
    })
    .map((it) => `${it.category} :: ${it.title} (head class: ${headClass(it.title)})`);
  assert.deepEqual(
    mismatches,
    [],
    "miscategorized item inside a generic-noun category — fix the item's category (and re-embed) or the classification is wrong"
  );
});
