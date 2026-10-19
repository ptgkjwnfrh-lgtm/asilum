// tests/shoe-size-reading.test.js — A SHOE SIZE IS A SHOE SIZE.
//
// MEASURED on production, 20 Sep 2026: "boots size 42" read 42 as a waist and
// answered "nothing with a 42 waist in footwear"; "boots size 9" read no size
// at all. The sellers label footwear "8", "9.5", "EU 45", "US10.5=UK9.5=EUR44=27CM"
// and "38.5,39,40,40.5,41,42,42.5,43,44,44.5,45". Every test here fails with
// the footwear reading removed from lib/search/size.js.

import test from "node:test";
import assert from "node:assert/strict";

import { parseSizeConstraint, itemMatchesSize, sizeMissNote } from "../lib/search/size.js";
import { tokens } from "../lib/search/tokens.js";
import { searchProducts } from "../lib/search/index.js";
import { upsertItems } from "../lib/db/index.js";

test("S1 'size N' is a shoe size only when the query names footwear", () => {
  const boots9 = parseSizeConstraint("boots size 9", tokens("boots size 9"), { footwear: true }).size;
  assert.equal(boots9.kind, "shoe"); assert.equal(boots9.system, "US"); assert.equal(boots9.shoe, 9);
  const boots42 = parseSizeConstraint("boots size 42", tokens("boots size 42"), { footwear: true }).size;
  assert.equal(boots42.kind, "shoe"); assert.equal(boots42.system, "EU"); assert.equal(boots42.shoe, 42);
  assert.equal(boots42.label_text, "a EU 42 shoe size");
  const half = parseSizeConstraint("sneakers size 9.5", tokens("sneakers size 9.5"), { footwear: true }).size;
  assert.equal(half.shoe, 9.5);
  const marked = parseSizeConstraint("loafers eu 43", tokens("loafers eu 43"), { footwear: true }).size;
  assert.equal(marked.system, "EU");
  // Not footwear: the old readings stand — 42 is a waist, 9 is nothing.
  assert.equal(parseSizeConstraint("jeans size 42", tokens("jeans size 42")).size.kind, "waist");
  assert.equal(parseSizeConstraint("jeans size 9", tokens("jeans size 9")).size, null);
});

const SHOES = [
  { id: "sh-9", title: "Vintage 70s Roblee side zip boot", brand: "Roblee", price: 120, category: "footwear", size: { label: "9" } },
  { id: "sh-95", title: "Alden tassel loafer", brand: "Alden", price: 300, category: "footwear", size: { label: "9.5" } },
  { id: "sh-eu45", title: "Guidi back zip boot", brand: "Guidi", price: 900, category: "footwear", size: { label: "EU 45" } },
  { id: "sh-conv", title: "CCP drip sneaker", brand: "Carol Christian Poell", price: 1500, category: "footwear", size: { label: "US10.5=UK9.5=EUR44=27CM" } },
  { id: "sh-list", title: "Rick Owens Geobasket", brand: "Rick Owens", price: 700, category: "footwear", size: { label: "38.5,39,40,40.5,41,42,42.5,43,44,44.5,45" } },
  { id: "jn-42", title: "Levi's 501 jeans", brand: "Levi's", price: 60, category: "bottoms", size: { label: "42" } },
  { id: "jn-9", title: "Kids denim short", brand: "Levi's", price: 20, category: "bottoms", size: { label: "9" } },
];

test("S2 matching is against the label as printed, footwear only", () => {
  const us9 = { kind: "shoe", system: "US", shoe: 9 };
  assert.deepEqual(SHOES.filter((it) => itemMatchesSize(it, us9)).map((i) => i.id), ["sh-9"], "a bare 9 is a US 9; 9.5 is not; a 9 on bottoms is not a shoe");
  const eu42 = { kind: "shoe", system: "EU", shoe: 42 };
  assert.deepEqual(SHOES.filter((it) => itemMatchesSize(it, eu42)).map((i) => i.id), ["sh-list"], "EU 42 is in the seller's list only; a 42 waist is not a shoe");
  const eu44 = { kind: "shoe", system: "EU", shoe: 44 };
  assert.deepEqual(SHOES.filter((it) => itemMatchesSize(it, eu44)).map((i) => i.id), ["sh-conv", "sh-list"], "EUR44 inside a conversion label, and the list");
  const eu45 = { kind: "shoe", system: "EU", shoe: 45 };
  assert.deepEqual(SHOES.filter((it) => itemMatchesSize(it, eu45)).map((i) => i.id), ["sh-eu45", "sh-list"]);
  const us105 = { kind: "shoe", system: "US", shoe: 10.5 };
  assert.deepEqual(SHOES.filter((it) => itemMatchesSize(it, us105)).map((i) => i.id), ["sh-conv"], "US10.5 inside a conversion label");
});

test("S3 end to end: 'boots size 42' and 'boots size 9' serve the shoes, and a miss names the shoe sizes here", async () => {
  await upsertItems(SHOES);
  const eu = await searchProducts("boots size 42", { userId: null, log: false });
  const euIds = eu.results.map((i) => i.id);
  assert.ok(euIds.includes("sh-list"), `EU 42: ${euIds}`);
  assert.ok(!euIds.includes("jn-42"), "a 42 waist is not a shoe");
  assert.ok(!/42 waist/.test(eu.note || ""), `no waist reading: ${eu.note}`);

  const us = await searchProducts("boots size 9", { userId: null, log: false });
  const usIds = us.results.map((i) => i.id);
  assert.ok(usIds.includes("sh-9"), `US 9: ${usIds}`);
  assert.ok(!usIds.includes("sh-95") && !usIds.includes("jn-9"), `only the 9: ${usIds}`);

  const miss = await searchProducts("boots size 47", { userId: null, log: false });
  assert.equal(miss.results.length, 0);
  assert.match(miss.note, /nothing in a EU 47 shoe size/);
  assert.match(miss.note, /the shoe sizes here are/);
});

test("S4 the miss note lists shoe sizes, not waist labels", () => {
  const note = sizeMissNote({ kind: "shoe", system: "EU", shoe: 47, label_text: "a EU 47 shoe size" }, SHOES, "footwear");
  assert.match(note, /^nothing in a EU 47 shoe size in footwear — the shoe sizes here are /);
  const entries = note.split("the shoe sizes here are ")[1].split(", ");
  assert.ok(!entries.includes("42"), `the jeans' 42 is not a shoe size: ${entries}`);
  assert.ok(entries.includes("EU 45") && entries.includes("9.5"), `the shoes' labels are: ${entries}`);
});
