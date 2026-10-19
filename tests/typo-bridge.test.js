// tests/typo-bridge.test.js — literal-engine typo bridge (r12).
// The bridge must correct only unknown tokens, never guess on ties, respect
// its distance budget, and record every correction.

import test from "node:test";
import assert from "node:assert/strict";

import { buildTypoVocab, correctTokens } from "../lib/search/typo.js";
import { interpretSearchQuery } from "../lib/search/index.js";

const VOCAB = buildTypoVocab({
  garmentKeys: ["sweater", "trousers", "cardigan", "jacket", "shirt", "skirt"],
  mappings: [{ searchPhrase: "gorpcore", relatedTerms: ["technical shell"] }],
});
const known = (t) => ["sweater", "trousers", "cardigan", "jacket", "shirt", "skirt"].includes(t);

test("corrects unknown tokens within budget", () => {
  const { tokens, corrections } = correctTokens(["sweter", "trousrs", "cardgan"], VOCAB, known);
  assert.deepEqual(tokens, ["sweater", "trousers", "cardigan"]);
  assert.equal(corrections.length, 3);
  assert.deepEqual(corrections[0], { from: "sweter", to: "sweater", distance: 1 });
});

test("known tokens are never corrected — shirt can never become skirt", () => {
  const { tokens, corrections } = correctTokens(["shirt", "skirt"], VOCAB, known);
  assert.deepEqual(tokens, ["shirt", "skirt"]);
  assert.equal(corrections.length, 0);
});

test("short tokens, digits, and out-of-budget tokens pass through", () => {
  const { tokens, corrections } = correctTokens(["tee", "sw3ter", "swtr", "completelyoff"], VOCAB, known);
  assert.deepEqual(tokens, ["tee", "sw3ter", "swtr", "completelyoff"]);
  assert.equal(corrections.length, 0);
});

test("a distance tie corrects nothing", () => {
  const vocab = ["parka", "parla"];
  const { tokens, corrections } = correctTokens(["parza"], vocab, () => false);
  assert.deepEqual(tokens, ["parza"]);
  assert.equal(corrections.length, 0);
});

test("SEARCH_TYPO_BRIDGE=0 kills the bridge", () => {
  process.env.SEARCH_TYPO_BRIDGE = "0";
  try {
    const { tokens, corrections } = correctTokens(["sweter"], VOCAB, known);
    assert.deepEqual(tokens, ["sweter"]);
    assert.equal(corrections.length, 0);
  } finally {
    delete process.env.SEARCH_TYPO_BRIDGE;
  }
});

test("interpretSearchQuery carries corrections end to end", async () => {
  const interpreted = await interpretSearchQuery("distressed sweter", { pool: [], brands: [], mappings: [] });
  assert.ok(interpreted.tokens.includes("sweater"), `tokens: ${interpreted.tokens}`);
  assert.equal(interpreted.typoCorrections[0]?.to, "sweater");
});
