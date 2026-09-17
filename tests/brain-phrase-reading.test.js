// tests/brain-phrase-reading.test.js — the brain reads a curated NAME as one
// unit, however it is spelled.
//
// Two defects this pins (knowledge round, 11 Sep 2026), both MEASURED
// before the change:
//   * the reader tried exactly two tokens, so a three-or-more-word key was
//     never looked up as a unit — 4 of the 31 such keys read WRONG ("new
//     york city", "los angeles city", "in the mood for love", "a p c"); the
//     rest survived only because the fuzzy substring bridge routed each
//     separate word back to the same key;
//   * the tokenizer split on the letters it did not know, so "Garçons"
//     became "gar" + "ons" and "A.P.C." became "a" + "p" + "c", while the
//     table kept the punctuation the tokenizer strips. 21 of 64 catalog
//     brands had no reachable key; 12 produced an EMPTY taste vector.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { promptVector, deduceProduct } from "../lib/brain/index.js";
import { kbResolveExact, kbResolveFuzzy, kbTagsFor, tagsToVec, foldKey, foldText } from "../lib/brain/kb.js";
import { lexiconVector } from "../lib/brain/lexicon.js";

const unit = (key) => tagsToVec(kbTagsFor(key));
const toks = (s) => foldText(s).split(/[^a-z0-9]+/).filter(Boolean);
// deduceProduct is DENSE (every tag, most at 0); compare what survives.
const sparse = (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x));

test("a three-or-more-word key is read as one unit, longest phrase first", () => {
  for (const name of ["dries van noten", "fear of god", "cactus plant flea market", "the north face", "aime leon dore"]) {
    assert.ok(kbResolveExact(name), `${name} must be a KB key`);
    assert.deepEqual(promptVector(name), unit(name), name);
  }
});

test("a name is read the same however it is spelled: diacritics and punctuation fold", () => {
  assert.equal(foldKey("Comme des Garçons"), "comme des garcons");
  assert.equal(foldKey("A.P.C."), "a p c");
  assert.equal(foldKey("Stüssy"), "stussy");
  assert.equal(foldKey("Norrøna"), "norrona");
  assert.deepEqual(promptVector("Comme des Garçons"), unit("comme des garcons"));
  assert.deepEqual(promptVector("A.P.C."), unit("apc"));
  assert.deepEqual(promptVector("Stüssy"), unit("stussy"));
  assert.deepEqual(promptVector("A$AP Rocky"), unit("asap rocky"));
  assert.deepEqual(promptVector("Number (N)ine"), unit("number nine"));
});

test("the graded lexicon read of a two-word phrase still outranks the fuzzy bridge", () => {
  assert.deepEqual(sparse(deduceProduct(["new", "york"])), lexiconVector("new york"));
});

test("a phrase the tables do not know still reads word by word", () => {
  const v = deduceProduct(["black", "wool", "coat"]);
  assert.ok(Object.values(v).some((x) => x > 0));
  assert.deepEqual(deduceProduct(["zzqx", "wwvv"]), deduceProduct([]));
});

// MEASURED (scratch, 11 Sep): of the 31 curated keys with 3+ words the
// two-token reader misread exactly four — the substring bridge rescued the
// rest by accident. These two are from that four; they pin the flag's A/B.
test("BRAIN_PHRASE_MATCH=0 restores the two-token reader (the A/B the instrument uses)", () => {
  process.env.BRAIN_PHRASE_MATCH = "0";
  try {
    assert.notDeepEqual(sparse(deduceProduct(toks("in the mood for love"))), unit("in the mood for love"));
    assert.deepEqual(sparse(deduceProduct(["a", "p", "c"])), {});
    assert.deepEqual(sparse(deduceProduct(["new", "york"])), lexiconVector("new york"));
  } finally {
    delete process.env.BRAIN_PHRASE_MATCH;
  }
  assert.deepEqual(sparse(deduceProduct(toks("in the mood for love"))), unit("in the mood for love"));
  assert.deepEqual(sparse(deduceProduct(["a", "p", "c"])), unit("apc"));
  assert.deepEqual(sparse(deduceProduct(["new", "york", "city"])), unit("new york city"));
});

// MEASURED when the register grew from 63 houses to the archive canon: the
// bare garment word "jeans" fuzzy-matched the multi-word key "samurai jeans"
// and took that house's aesthetics at full weight. A one-word token now
// bridges only to a one-word key. This is the shadowing law from
// tests/lexicon-shadowing.test.js in the form the register can break: that
// file guards LEXICON words, and "jeans" is a garment noun, not a LEXICON
// entry — so it was guarded by nothing until the register made it reachable.
test("a bare garment word cannot fuzzy-bridge into a multi-word house key", () => {
  for (const word of ["jeans", "jean", "shirt", "boots", "sunshine", "blue", "peak", "wing"]) {
    const near = kbResolveFuzzy(word);
    assert.ok(!near || !near.key.includes(" "),
      `"${word}" bridged to the multi-word key "${near?.key}"`);
  }
  assert.deepEqual(sparse(deduceProduct(["jeans"])), {});
});

test("the one-word bridge that the lexicon depends on still works", () => {
  const near = kbResolveFuzzy("margiel");
  assert.ok(near, "a near-miss on a one-word key must still bridge");
  assert.equal(near.key.includes(" "), false);
  assert.ok(Object.keys(sparse(deduceProduct(["margiel"]))).length > 0);
});

test("a query word is still not a property name", () => {
  for (const w of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    assert.equal(kbTagsFor(w), null, w);
    assert.equal(kbResolveExact(w), null, w);
  }
});
