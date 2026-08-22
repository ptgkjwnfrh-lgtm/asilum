// tests/negation.test.js — the engine stops serving the thing you excluded.
//
// Negation was parsed nowhere, so the excluded word went into scoring like
// any other and DROVE the rack. The reader got the exact thing they asked not
// to see, at the top:
//
//   "no logo hoodie"        top row: Acne Studios — LOGO HOODIE
//   "trousers no pleats"    top row: Kapital — PLEATED TROUSERS
//   "jacket except puffer"  top row: Y/Project — DOWN PUFFER
//   "not prada"             13 results, every one of them Prada
//   "anything but sneakers" 17 of the 24 shown were sneakers
//
// Measured: negation family 6/18 -> 18/18 READ, 0 BROWSE.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNegations, applyExclusions, itemMatchesExclusion, exclusionNote } from "../lib/search/negation.js";
import { searchProducts, GENERIC_GARMENT_NOUNS } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const BRANDS = [...new Set(CATALOG.map((it) => it.brand).filter(Boolean))];
const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const parse = (s) => parseNegations(toks(s), { phrases: BRANDS });
const opts = { categoryOf: (w) => GENERIC_GARMENT_NOUNS[w] || null };

test("every marker shape people use", () => {
  for (const q of ["no logo hoodie", "hoodie without a logo", "hoodie without the logo",
                   "hoodie minus the logo", "hoodie except logo", "hoodie excluding logo",
                   "hoodie sans logo", "anything but logo", "hoodie not logo"]) {
    const { exclusions } = parse(q);
    assert.equal(exclusions.length, 1, q);
    assert.equal(exclusions[0].word, "logo", q);
  }
});

test("only ONE word is excluded, so the noun survives", () => {
  const { tokens, exclusions } = parse("no logo hoodie");
  assert.deepEqual(exclusions.map((x) => x.word), ["logo"]);
  assert.deepEqual(tokens, ["hoodie"]);
});

test("a known name is consumed whole — half a name is not one", () => {
  assert.deepEqual(parse("not rick owens").exclusions.map((x) => x.word), ["rick owens"]);
  assert.deepEqual(parse("anything but comme des garcons").exclusions.map((x) => x.word),
    ["comme des garcons"]);
});

test("a marker with nothing after it is just a word", () => {
  const { exclusions, tokens } = parse("no");
  assert.deepEqual(exclusions, []);
  assert.deepEqual(tokens, ["no"]);
});

test("\"but\" is a marker only after a totaliser", () => {
  assert.equal(parse("anything but sneakers").exclusions.length, 1);
  assert.equal(parse("but sneakers").exclusions.length, 0);
});

test("an exclusion reaches the form the title uses, not the form typed", () => {
  // "pleats" must find "pleated trousers": a bare plural strip gives "pleat",
  // and \bpleat\b does not match "pleated".
  const item = { title: "Kapital — pleated trousers", category: "bottoms" };
  assert.equal(itemMatchesExclusion(item, "pleats", opts), true);
  assert.equal(itemMatchesExclusion(item, "pleat", opts), true);
  assert.equal(itemMatchesExclusion({ title: "X — striped knit polo" }, "stripes", opts), true);
});

test("a designer exclusion needs the WHOLE name", () => {
  // A contains-test made "not prada" remove 15 Miu Miu pieces as well,
  // because they credit Miuccia Prada — a different house and a different
  // person.
  const miu = { brand: "Miu Miu", title: "Miu Miu — anorak", designers: ["Miuccia Prada"] };
  assert.equal(itemMatchesExclusion(miu, "prada", opts), false);
  assert.equal(itemMatchesExclusion(miu, "miuccia prada", opts), true);
});

test("the sentence names the basis and the count", () => {
  assert.match(exclusionNote([{ word: "logo" }], 12, 148), /excluding "logo" by name — 12 pieces removed/);
  assert.match(exclusionNote([{ word: "x" }], 0, 100), /nothing here is named "x"/);
  assert.match(exclusionNote([{ word: "x" }], 10, 0), /nothing left after excluding it/);
});

test("applyExclusions removes, and an empty list is a no-op", () => {
  const items = [{ title: "A — logo hoodie" }, { title: "B — zip hoodie" }];
  assert.equal(applyExclusions(items, [{ word: "logo" }], opts).length, 1);
  assert.equal(applyExclusions(items, [], opts).length, 2);
});

// ---- engine level ---------------------------------------------------------

test("no served piece matches the exclusion", async () => {
  for (const q of ["no logo hoodie", "hoodie without a logo", "anything but sneakers",
                   "trousers no pleats", "jacket except puffer", "not prada",
                   "not rick owens", "no virgil abloh"]) {
    const r = await searchProducts(q, { limit: 24 });
    const { exclusions } = parse(q);
    assert.ok(exclusions.length, q);
    for (const it of r.results) {
      for (const x of exclusions) {
        assert.equal(itemMatchesExclusion(it, x.word, opts), false,
          `${q}: served "${it.title}" which matches the excluded "${x.word}"`);
      }
    }
  }
});

test("the rack that used to open on the excluded thing no longer does", async () => {
  const r = await searchProducts("no logo hoodie", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.doesNotMatch(r.results[0].title.toLowerCase(), /logo/);
  assert.match(r.note, /excluding "logo" by name — \d+ pieces removed/);
});

test("an exclusion-only query serves the surviving pool", async () => {
  const r = await searchProducts("not prada", { limit: 24 });
  assert.equal(r.total, CATALOG.length - CATALOG.filter((it) => it.brand === "Prada").length);
  assert.ok(r.results.every((it) => it.brand !== "Prada"));
});

test("an excluded name is not read as a request for its aesthetic", async () => {
  // "not rick owens" came back as a cultural read of Rick Owens — his
  // aesthetic, minus his own pieces — because every token had been consumed
  // and the interpretation tiers fell back to the raw query.
  const r = await searchProducts("not rick owens", { limit: 24 });
  assert.equal(r.cultural.engaged, false);
  assert.ok(r.results.every((it) => it.brand !== "Rick Owens"));
});

test("the kill flag restores the pre-change behavior exactly", async () => {
  const off = await searchProducts("no logo hoodie", { limit: 24, negation: false });
  assert.match(off.results[0].title.toLowerCase(), /logo/, "it used to open on a logo hoodie");
  assert.deepEqual(off.interpreted.exclusions, []);
});
