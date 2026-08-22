// tests/designer-credits.test.js — the people, not just the houses.
//
// Every item carries designers[], 915/915 populated, 93 distinct names, and
// 523 items credit somebody who is NOT the label on the piece. Search read
// the field nowhere — its only appearance in lib/search was a comment.
//
//   "jun takahashi"  ZERO results, no note, while 16 Undercover items name him
//   "rei kawakubo"   681 items via the cultural tier, opening on JW Anderson,
//                    while 14 Comme des Garçons pieces carry her name
//   "virgil abloh"   790 items of lexicon guess; 36 pieces across Off-White
//                    AND Louis Vuitton credit him
//   "kim jones"      617 items; 37 across Fendi and Dior Men credit him
//   "demna jacket"   170 outerwear denying "demna", while 12 Balenciaga
//                    pieces credit Demna
//
// The field answers what no brand match can: a person moves, and their work
// splits across houses.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  listDesigners, parseDesignerCredit, applyDesignerCredit,
  itemCreditsDesigner, creditFootprint, creditNote,
} from "../lib/search/designers.js";
import { searchProducts } from "../lib/search/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const BRANDS = [...new Set(CATALOG.map((it) => it.brand).filter(Boolean))];
const ALL_NAMES = listDesigners(CATALOG);
// The vocabulary the engine actually uses: house names excluded.
const NAMES = listDesigners(CATALOG, { excludeBrands: BRANDS });
const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);

test("the field is dense enough to be worth reading", () => {
  assert.equal(ALL_NAMES.length, 93);
  const credited = CATALOG.filter((it) => (it.designers || []).some((d) => d !== it.brand));
  assert.equal(credited.length, 523);
});

test("a name a HOUSE already answers to is not credit vocabulary", () => {
  // MEASURED (vibe sweep run 1): without this, "willy chavarria varsity
  // jacket" and 52 other designer-piece queries had their top row relabelled
  // "designer credit" — the label is also a person in this field, and the
  // credit's weight buried the product-name match the reader wanted.
  assert.ok(NAMES.length < ALL_NAMES.length);
  const folded = NAMES.map((n) => n.toLowerCase());
  for (const house of ["willy chavarria", "supreme", "prada", "saint laurent", "lemaire"]) {
    assert.equal(folded.includes(house), false, `${house} is a house, not credit vocabulary`);
  }
  // The people who are not houses survive.
  for (const person of ["Jun Takahashi", "Rei Kawakubo", "Kim Jones", "Virgil Abloh"]) {
    assert.ok(NAMES.includes(person), person);
  }
});

test("a span must EQUAL a stored name — never a fragment of one", () => {
  // The Aug 5 word-boundary lesson with higher stakes.
  assert.equal(parseDesignerCredit(toks("rose"), NAMES), null);
  assert.equal(parseDesignerCredit(toks("jones"), NAMES), null);
  assert.equal(parseDesignerCredit(toks("green"), NAMES), null);
  assert.equal(parseDesignerCredit(toks("kim"), NAMES), null);
  assert.equal(parseDesignerCredit(toks("kim jones"), NAMES).designer, "Kim Jones");
});

test("the longest span wins, and the rest of the query survives", () => {
  const hit = parseDesignerCredit(toks("jun takahashi jacket"), NAMES);
  assert.equal(hit.designer, "Jun Takahashi");
  assert.deepEqual(hit.tokens, ["jacket"]);
});

test("a punctuated name is reachable at all", () => {
  // "Sarah-Linh Tran" arrives from the tokenizer as three tokens while the
  // stored name keeps its hyphen: keyed on the raw string she was in the
  // vocabulary and unmatchable. Names are keyed the way the tokenizer splits.
  assert.ok(NAMES.includes("Sarah-Linh Tran"));
  assert.equal(parseDesignerCredit(toks("sarah linh tran"), NAMES).designer, "Sarah-Linh Tran");
  assert.equal(parseDesignerCredit(toks("sarah-linh tran"), NAMES).designer, "Sarah-Linh Tran");
  // Accent folding is symmetric here too.
  assert.equal(parseDesignerCredit(toks("aime leon dore"), ALL_NAMES).designer, "Aimé Leon Dore");
});

test("an item with no credit cannot pass", () => {
  const items = [
    { id: "a", designers: ["Jun Takahashi"] },
    { id: "b", designers: [] },
    { id: "c" },
  ];
  assert.deepEqual(applyDesignerCredit(items, "Jun Takahashi").map((it) => it.id), ["a"]);
  assert.equal(itemCreditsDesigner({ designers: null }, "Jun Takahashi"), false);
  assert.equal(applyDesignerCredit(items, null).length, 3);
});

test("the sentence carries the count and the houses, and claims no tenure", () => {
  const fp = creditFootprint(CATALOG, "Kim Jones");
  assert.equal(fp.count, 37);
  assert.deepEqual(fp.houses.sort(), ["Dior Men", "Fendi"]);
  const note = creditNote("Kim Jones", fp);
  assert.match(note, /37 pieces at Dior Men and Fendi/);
  // No tenure dates are stored, so no tenure may be implied.
  assert.doesNotMatch(note, /while|during|era|years/);
  assert.match(creditNote("Nobody", { count: 0, houses: [] }), /nothing here credits Nobody/);
});

// ---- engine level ---------------------------------------------------------

test("a credited name serves exactly the pieces that credit it", async () => {
  for (const [q, name, n] of [
    ["jun takahashi", "Jun Takahashi", 16],
    ["rei kawakubo", "Rei Kawakubo", 14],
    ["virgil abloh", "Virgil Abloh", 36],
    ["kim jones", "Kim Jones", 37],
    ["demna jacket", "Demna", 12],
  ]) {
    const r = await searchProducts(q, { limit: 48 });
    assert.equal(r.interpreted.designerCredit, name, q);
    assert.equal(r.total, n, `${q} served ${r.total}`);
    for (const it of r.results) assert.ok(itemCreditsDesigner(it, name), `${q}: ${it.id}`);
    assert.match(r.note, new RegExp(`reading "${name}" as a designer credit`));
  }
});

test("a credit crosses houses, which no brand match can do", async () => {
  const r = await searchProducts("virgil abloh", { limit: 48 });
  const houses = new Set(r.results.map((it) => it.brand));
  assert.deepEqual([...houses].sort(), ["Louis Vuitton", "Off-White"]);
  const m = await searchProducts("miuccia prada", { limit: 48 });
  assert.deepEqual([...new Set(m.results.map((it) => it.brand))].sort(), ["Miu Miu", "Prada"]);
});

test("a stored attribution outranks an interpretation", async () => {
  // "rei kawakubo" is also a curated culture entity. Fourteen pieces actually
  // credited to her beat 681 pieces in an anti-fashion vibe topped by a house
  // she has never worked for.
  const r = await searchProducts("rei kawakubo", { limit: 48 });
  assert.equal(r.cultural.engaged, false);
  assert.ok(r.results.every((it) => it.brand === "Comme des Garçons"));
});

test("a house outranks a credit", async () => {
  // Lemaire is a house; Christophe Lemaire is a person. The house was asked for.
  const house = await searchProducts("lemaire", { limit: 24 });
  assert.equal(house.interpreted.designerCredit, null);
  assert.equal(house.interpreted.intent, "brand");
  const person = await searchProducts("christophe lemaire", { limit: 24 });
  assert.equal(person.interpreted.designerCredit, "Christophe Lemaire");
});

test("a name this catalog does not credit is not invented", async () => {
  for (const q of ["phoebe philo", "nicolas ghesquiere", "martin margiela"]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.equal(r.interpreted.designerCredit, null, q);
  }
});

test("the kill flag restores the pre-change behavior exactly", async () => {
  const off = await searchProducts("jun takahashi", { limit: 24, designerCredit: false });
  assert.equal(off.interpreted.designerCredit, null);
  assert.equal(off.results.length, 0, "it used to return nothing at all");
});
