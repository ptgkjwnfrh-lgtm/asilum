// tests/cultural-reach.test.js — a curated reading has to survive junk.
//
// lib/asterisk/culture.js holds 607 provenance-validated entities. The
// cultural tier only engages when the literal rack is EMPTY or WEAK, and
// "weak" was a score threshold: ranked[0]._score < 1.2. A one-of-two partial
// title match scores 2.5 x 0.5 = 1.25 — five hundredths over the line — so a
// single junk word killed the curated reading:
//
//   "blade runner"        eleven suede RUNNERS at confidence 0.10
//   "the matrix"          a hit donated by The Row's BRAND half
//   "ghost in the shell"  a GORE-TEX shell
//   "jean paul gaultier"  jeans
//   "the crow"            resolved to The Row by a one-edit spelling guess
//
// MEASURED (scripts/measure-cultural-reach.mjs): 37 of 607 entities were
// unreachable by their own name. 0 now, and reach went 539 -> 595 with NOT ONE
// entity losing a reading it already had.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { searchProducts, SEARCH_STOPWORDS } from "../lib/search/index.js";
import { lookupCulture } from "../lib/asterisk/culture.js";

test("a grammar word cannot vouch for an item", async () => {
  // "the" scored a partial title match off The Row's brand half and that
  // alone shadowed thirty-two entities whose names begin with it.
  assert.ok(SEARCH_STOPWORDS.has("the"));
  assert.ok(SEARCH_STOPWORDS.has("in"));
  for (const q of ["the matrix", "the cure", "the sopranos", "the casualties"]) {
    const r = await searchProducts(q, { limit: 12 });
    assert.equal(r.cultural.engaged, true, q);
    assert.equal(r.cultural.entity, q);
  }
});

test("a fragment match does not outrank a reading of the whole phrase", async () => {
  for (const [q, entity] of [
    ["blade runner", "blade runner"],
    ["ghost in the shell", "ghost in the shell"],
    ["jean paul gaultier", "jean paul gaultier"],
    ["twin peaks", "twin peaks"],
    ["guns n roses", "guns n roses"],
  ]) {
    const r = await searchProducts(q, { limit: 12 });
    assert.equal(r.cultural.engaged, true, q);
    assert.equal(r.cultural.entity, entity, q);
  }
});

test("a known reference is not a misspelled house", async () => {
  // "the crow" has a skeleton one edit from "the row".
  assert.ok(lookupCulture("the crow"));
  const r = await searchProducts("the crow", { limit: 12 });
  assert.equal(r.interpreted.brandSpelling, null);
  assert.equal(r.cultural.engaged, true);
  assert.equal(r.cultural.entity, "the crow");
});

test("a real literal answer still wins — this only ADDS weakness", async () => {
  // Every one of these is a stored fact or a genuine name match, and a stored
  // fact outranks an interpretation by design.
  const cases = [
    ["western", (r) => r.results[0].matchReason === "product name match"],
    ["snow", (r) => r.interpreted.intent === "brand"],
    ["dries van noten", (r) => r.interpreted.intent === "brand"],
    ["rei kawakubo", (r) => r.interpreted.designerCredit === "Rei Kawakubo"],
    ["2010s", (r) => r.interpreted.era?.served === true],
  ];
  for (const [q, ok] of cases) {
    const r = await searchProducts(q, { limit: 12 });
    assert.equal(r.cultural.engaged, false, `${q} should stay literal`);
    assert.ok(ok(r), q);
  }
});

test("ordinary queries are untouched", async () => {
  for (const q of ["jacket", "trashed jeans", "the row", "good blanks", "leather jacket"]) {
    const r = await searchProducts(q, { limit: 12 });
    assert.equal(r.cultural.engaged, false, q);
  }
});

test("a rescue is not worded like a read, and says which it was", async () => {
  // The orchestrator distinguishes exact | ambiguous | composed | recovered
  // and the engine printed all of them in the same confident words:
  // "cowboy bebop" said `read as western`.
  const rescue = await searchProducts("cowboy bebop", { limit: 12 });
  assert.equal(rescue.cultural.method, "recovered");
  assert.match(rescue.note, /nothing here is "cowboy bebop" — showing the closest reference asterisk knows/);
  assert.doesNotMatch(rescue.note, /^read as/);

  const exact = await searchProducts("blade runner", { limit: 12 });
  assert.equal(exact.cultural.method, "exact");
  assert.match(exact.note, /^read as blade runner/);
});

test("the method reaches the response, not just the log", async () => {
  const r = await searchProducts("playboi carti", { limit: 12 });
  assert.equal(r.cultural.engaged, true);
  assert.equal(r.cultural.method, "exact");
});
