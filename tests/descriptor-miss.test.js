// tests/descriptor-miss.test.js — the Aug 5 lesson, returning through ranking.
//
// "wool sweater" and "knitted scarf" returning the identical rack was fixed in
// the DISCLOSURE. The same silence came back through the RANKING, where every
// word has evidence somewhere and no piece has all of them:
//
//   "leather sneakers"  8 chunky trail sneakers with no leather, a leather
//                       DERBY at position 9, matchReason "category browse",
//                       and no note at all
//   "nylon trousers"    8 pleated and wide-leg trousers, no nylon
//   "wool suit"         boxy suit jackets over a pleated wool trouser
//
// There is no leather sneaker, no nylon trouser and no wool suit in this
// catalog. The claim under test is the narrow true one — no piece on this
// page is BOTH — and the rule that decides "both".
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";
import { searchProducts } from "../lib/search/index.js";

test("a pair the catalog cannot satisfy is said out loud", async () => {
  for (const [q, words] of [
    ["leather sneakers", ['"leather"', '"sneakers"']],
    ["nylon trousers", ['"nylon"', '"trousers"']],
    ["wool suit", ['"wool"', '"suit"']],
    ["leather boots", ['"leather"', '"boots"']],
  ]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.length > 0, q);
    assert.match(r.note, /nothing here is both/, q);
    for (const w of words) assert.ok(r.note.includes(w), `${q}: ${r.note}`);
  }
});

test("a subtype noun needs a real title hit — a derby is not a sneaker", async () => {
  // The leather the catalog holds IS footwear, so a category-level test would
  // call "leather sneakers" satisfied by a leather derby and stay silent.
  const r = await searchProducts("leather sneakers", { limit: 24 });
  assert.match(r.note, /nothing here is both/);
  assert.ok(r.results.some((it) => /leather/.test(it.title.toLowerCase())),
    "the leather footwear is still on the page — this is disclosure, not a filter");
});

test("a generic noun is satisfied by its category (the r6 equivalence)", async () => {
  // A GORE-TEX shell IS a jacket that does not spell the word.
  // (Amended when the category-read disclosure shipped: this test used to
  // assert note === null, which pinned "says nothing at all" when what it
  // meant was "makes no both-claim". The rack now says `reading "jacket" as
  // the outerwear category`, which is true and is not this test's subject.)
  const r = await searchProducts("gore-tex jacket", { limit: 24 });
  assert.doesNotMatch(String(r.note || ""), /nothing here is both/);
});

test("a pair the catalog CAN satisfy makes no both-claim", async () => {
  // Amended with the test above, and for the same reason: "mohair knit" opens
  // on a distressed mohair SWEATER, so the rack now also discloses that
  // "knit" was read as the knitwear category. Both facts are true; only the
  // both-claim is this test's subject.
  for (const q of ["mohair knit", "pleated trousers", "cropped knit", "chunky sneakers"]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.doesNotMatch(String(r.note || ""), /nothing here is both/, `${q}: ${r.note}`);
  }
});

test("a word the catalog never uses is left to the older disclosure", async () => {
  // "black" is not catalog vocabulary at all — 0 of 915 items carry colour —
  // so the unmatched-token sentence is the right one and still runs.
  const r = await searchProducts("black dress", { limit: 24 });
  assert.match(r.note, /no piece here matches "black"/);
  assert.doesNotMatch(r.note, /nothing here is both/);
});

test("single-word and culture queries are untouched", async () => {
  for (const q of ["jacket", "trashed jeans", "good blanks", "like rick owens", "playboi carti"]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.doesNotMatch(String(r.note || ""), /nothing here is both/, q);
  }
});

test("ranking is untouched — the note is the only difference", async () => {
  const r = await searchProducts("leather sneakers", { limit: 24 });
  // The rack is still the sneaker rack the ranker chose; nothing was filtered.
  assert.equal(r.total, 120);
  assert.match(r.results[0].title.toLowerCase(), /sneaker/);
});
