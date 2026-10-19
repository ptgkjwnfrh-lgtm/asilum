// tests/trade-shortforms.test.js — the names the trade actually types.
//
//   "cdg"  681 items topped by JW Anderson — Comme des Garçons is in stock
//   "ysl"  624 items topped by Dries Van Noten — Saint Laurent is in stock
//   "raf"  all TWELVE Raf Simons pieces buried at rank 306, under a note
//          that named him
//   "mmm" / "lv"                ZERO
//   "ｐｒａｄａ" (fullwidth)     ZERO, while "prada" returns 13
//   "prada or gucci"            831 items topped by Chrome Hearts, and NO NOTE
//
// Meanwhile "rick", "yohji", "dries" and "margiela" already worked, purely
// because they happen to be whole words inside the stored name.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { houseForShortForm, HOUSE_SHORT_FORMS } from "../lib/asterisk/houses.js";
import { foldNorm } from "../lib/search/text.js";
import { searchProducts } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const BRANDS = [...new Set(CATALOG.map((it) => it.brand).filter(Boolean))];

test("a short form resolves only to a house this catalog stocks", () => {
  assert.equal(houseForShortForm("cdg", BRANDS), "Comme des Garçons");
  assert.equal(houseForShortForm("ysl", BRANDS), "Saint Laurent");
  assert.equal(houseForShortForm("raf", BRANDS), "Raf Simons");
  // Real vocabulary, house not stocked here — resolves to nothing.
  assert.equal(houseForShortForm("jpg", BRANDS), null);
  assert.equal(houseForShortForm("not-a-form", BRANDS), null);
});

test("no short form is short enough to collide with an ordinary word", () => {
  for (const forms of Object.values(HOUSE_SHORT_FORMS)) {
    for (const f of forms) assert.ok(f.length >= 2, f);
  }
  // The two most collision-prone were deliberately left out.
  const all = Object.values(HOUSE_SHORT_FORMS).flat();
  assert.equal(all.includes("sl"), false);
  assert.equal(all.includes("cd"), false);
});

test("the trade's short forms reach the house, and say so", async () => {
  for (const [q, house] of [["cdg", "Comme des Garçons"], ["ysl", "Saint Laurent"],
                            ["raf", "Raf Simons"], ["mmm", "Maison Margiela"],
                            ["lv", "Louis Vuitton"]]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.equal(r.interpreted.brand, house, q);
    assert.ok(r.results.length > 0, q);
    assert.ok(r.results.every((it) => it.brand === house), q);
    assert.match(r.note, new RegExp(`reading "${q}" as ${house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("fullwidth Latin is folded, in both directions", async () => {
  assert.equal(foldNorm("ｐｒａｄａ"), "prada");
  assert.equal(foldNorm("ＲＩＣＫ ＯＷＥＮＳ"), "rick owens");
  const r = await searchProducts("ｐｒａｄａ", { limit: 24 });
  assert.equal(r.total, (await searchProducts("prada", { limit: 24 })).total);
  assert.ok(r.results.every((it) => it.brand === "Prada"));
});

test("a disjunction of houses serves both, side by side", async () => {
  const r = await searchProducts("prada or gucci", { limit: 24 });
  const brands = new Set(r.results.map((it) => it.brand));
  assert.deepEqual([...brands].sort(), ["Gucci", "Prada"]);
  assert.match(r.note, /showing Prada and Gucci side by side/);
  // Short forms work in a list too.
  const s = await searchProducts("cdg or sacai", { limit: 24 });
  assert.deepEqual([...new Set(s.results.map((it) => it.brand))].sort(), ["Comme des Garçons", "Sacai"]);
});

test("a list of names is not read as a cultural reference", async () => {
  // "rick owens or raf" printed `nothing here is "rick owens or raf" —
  // showing the closest reference asterisk knows, rick owens` over a rack
  // that was already exactly right.
  const r = await searchProducts("rick owens or raf", { limit: 24 });
  assert.equal(r.cultural.engaged, false);
  assert.doesNotMatch(String(r.note || ""), /closest reference/);
});

test("a cultural label that repeats the entity name is not printed twice", async () => {
  const r = await searchProducts("cowboy bebop", { limit: 24 });
  assert.match(r.note, /the closest reference asterisk knows, western/);
  assert.doesNotMatch(r.note, /western — western/);
});

test("ordinary queries are untouched", async () => {
  for (const q of ["prada", "jacket", "trashed jeans", "playboi carti", "rick owens"]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.length > 0, q);
  }
});
