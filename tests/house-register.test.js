// tests/house-register.test.js — ONE register for what a house is and where
// it is from, and the brain reads from it.
//
// The drift this guards (measured 11 Sep 2026, before the round): the
// brain's designer table and the origin table were two hand-kept lists of
// the same houses — 83 designer keys with no origin row, 20 origin rows with
// no designer key, and 12 of the catalog's own 64 brands read as an EMPTY
// taste vector. Law: a test that never leaves the file it guards cannot
// catch a disagreement between two files, so the assertions here are
// MECHANICAL DIFFS across houses.js, kb.js, the lexicon and the catalog.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { HOUSES, HOUSE_SHORT_FORMS, HOUSE_ORIGIN_PROVENANCE, houseKbEntries, houseForKbKey, houseOrigin, houseIsFrom, originCoverage } from "../lib/asterisk/houses.js";
import { TAGS } from "../lib/brain/tags.js";
import { kbResolveExact, kbTagsFor, tagsToVec, foldKey, KB_PEOPLE } from "../lib/brain/kb.js";
import { LEXICON } from "../lib/brain/lexicon.js";
import { promptVector } from "../lib/brain/index.js";
import { garmentCategoryOf, genericNounCategoryOf } from "../lib/search/vocabulary.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const rows = Object.entries(HOUSES);

test("every row says where the house is, why, and what it is known for", () => {
  assert.ok(rows.length >= 200, `expected the archive canon, got ${rows.length}`);
  for (const [brand, rec] of rows) {
    assert.ok(typeof rec.country === "string" && rec.country.length > 1, `${brand}: country`);
    assert.ok(typeof rec.basis === "string" && rec.basis.length > 10, `${brand}: basis`);
    assert.ok(Array.isArray(rec.tags) && rec.tags.length >= 2 && rec.tags.length <= 3, `${brand}: two or three tags`);
    assert.equal(new Set(rec.tags).size, rec.tags.length, `${brand}: distinct tags`);
    for (const t of rec.tags) assert.ok(TAGS.includes(t), `${brand}: "${t}" is not a canonical aesthetic`);
    if (rec.foundedIn) assert.notEqual(rec.foundedIn, rec.country, `${brand}: foundedIn equal to country is noise`);
    if (rec.founded) assert.ok(Number.isInteger(rec.founded) && rec.founded >= 1700 && rec.founded <= 2026, `${brand}: founded`);
    if (rec.parent) assert.ok(HOUSES[rec.parent], `${brand}: parent "${rec.parent}" is not a row`);
  }
  assert.equal(HOUSE_ORIGIN_PROVENANCE.method, "curated-editorial");
  assert.match(HOUSE_ORIGIN_PROVENANCE.curatedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("a line answers to its parent's country", () => {
  for (const [brand, rec] of rows) {
    if (!rec.parent) continue;
    const p = HOUSES[rec.parent];
    assert.ok(houseIsFrom(brand, p.country) || houseIsFrom(brand, p.foundedIn), `${brand}: not from ${rec.parent}'s country`);
  }
});

test("the brain's designer keys are DERIVED from the register — no second list", () => {
  const derived = houseKbEntries();
  for (const [brand, rec] of rows) {
    if (rec.kb === false) {
      assert.equal(kbResolveExact(brand), null, `${brand}: kb:false must produce no key`);
      continue;
    }
    const hit = kbResolveExact(brand);
    assert.ok(hit, `${brand}: no brain key`);
    assert.deepEqual(hit.tags, rec.tags, `${brand}: the brain's tags are not the register's`);
    for (const form of [...(HOUSE_SHORT_FORMS[brand] || []), ...(rec.aka || [])]) {
      assert.deepEqual(kbResolveExact(form)?.tags, rec.tags, `${brand}: "${form}" does not resolve to the house`);
      assert.equal(houseForKbKey(form), brand, `${brand}: "${form}" is not mapped back`);
    }
  }
  // the only designer keys NOT from the register are people, declared as such
  for (const key of Object.keys(KB_PEOPLE)) {
    assert.equal(houseForKbKey(key), null, `${key}: a person's name must not also be a house key`);
  }
  assert.ok(Object.keys(derived).length >= rows.length - rows.filter(([, r]) => r.kb === false).length);
});

test("no house key collides with a curated lexicon word or a garment noun", () => {
  const bad = [];
  for (const key of Object.keys(houseKbEntries())) {
    const k = foldKey(key);
    if (Object.hasOwn(LEXICON, k)) bad.push(`"${key}" is a LEXICON word`);
    if (!k.includes(" ") && (garmentCategoryOf(k) || genericNounCategoryOf(k))) bad.push(`"${key}" is a garment noun`);
  }
  assert.deepEqual(bad, []);
});

test("a short form or aka is never spelled as its own brand, and never claims two houses", () => {
  const seen = new Map();
  for (const [brand, rec] of rows) {
    for (const form of [brand, ...(HOUSE_SHORT_FORMS[brand] || []), ...(rec.aka || [])]) {
      const k = foldKey(form);
      assert.ok(k, `${brand}: empty key "${form}"`);
      if (seen.has(k) && seen.get(k) !== brand) assert.fail(`"${form}" claims both ${seen.get(k)} and ${brand}`);
      seen.set(k, brand);
    }
  }
});

test("every catalog brand the register knows produces the house's own taste vector", () => {
  const brands = [...new Set(CATALOG.map((i) => i.brand).filter(Boolean))];
  const cov = originCoverage(brands);
  assert.ok(cov.known / cov.total >= 0.95, `coverage ${cov.known}/${cov.total}`);
  const empty = [];
  for (const b of brands) {
    const rec = houseOrigin(b);
    if (!rec || rec.kb === false) continue;
    const v = promptVector(b);
    if (!Object.keys(v).length) empty.push(b);
    else assert.deepEqual(v, tagsToVec(rec.tags), `${b}: not read as the house`);
  }
  assert.deepEqual(empty, [], "catalog brands with an EMPTY taste vector");
});

test("the eBay stream's archive houses are known", () => {
  for (const name of ["Carol Christian Poell", "Guidi", "Julius", "Tom Ford", "Versace", "Balmain", "Givenchy", "Marc Jacobs", "L.G.B.", "The Row", "Gianni Versace"]) {
    const rec = houseOrigin(name) || houseOrigin(houseForKbKey(name) || "");
    assert.ok(rec, `${name}: no origin row`);
    assert.ok(kbTagsFor(name), `${name}: no brain reading`);
  }
});
