// tests/groundedness-gate.test.js
// The r10 cultural fallback is guarded by a "does this rack carry any query
// evidence?" check. That check used to ask a DISPLAY LABEL:
//     ranked.some((r) => r.matchReason !== "moodboard brain")
// which is inverted in both directions, so the tier never engaged:
//   * an item admitted ONLY by the personal nudge has no literal reason, so
//     it is labeled "category browse" -- never "moodboard brain" -- and was
//     counted as GROUNDED;
//   * the only items that DO carry that label are ones with a real literal
//     reason the nudge outweighed, i.e. items that genuinely have query
//     evidence, and those were counted as UNGROUNDED.
//
// The root cause is that "category browse" means two opposite things: "your
// garment noun matched this category" and "nothing matched, your taste put
// this here". A display label cannot answer a ranking question, so evidence
// is now its own per-item flag.

import test from "node:test";
import assert from "node:assert/strict";

import { rankSearchResults, searchProducts } from "../lib/search/index.js";

const POOL = [
  { id: "p1", title: "Pleated Wool Trouser", brand: "Lemaire", category: "bottoms", tags: { MINIMAL: 0.9, TAILORED: 0.8 } },
  { id: "p2", title: "Boxy Cotton Tee", brand: "Auralee", category: "tops", tags: { MINIMAL: 0.8, ARCHIVAL: 0.4 } },
  { id: "p3", title: "Ripstop Cargo Pant", brand: "Arcteryx", category: "bottoms", tags: { GORP: 0.9, UTILITARIAN: 0.7 } },
];

// A query with no title, brand, tag, category or related-term overlap.
const UNMATCHED = {
  query: "zzzqqx", tokens: ["zzzqqx"], mappedTags: [],
  relatedTerms: [], intent: "text", brand: null,
};
const PERSONAL = { vec: { MINIMAL: 0.9, TAILORED: 0.7 } };

test("a rack admitted only by the personal nudge carries NO query evidence", () => {
  // Control first: with the brain off the query admits nothing at all, which
  // is what proves the items below are pure taste echo.
  assert.equal(rankSearchResults(POOL, UNMATCHED, { personal: null }).length, 0);

  const ranked = rankSearchResults(POOL, UNMATCHED, { personal: PERSONAL });
  assert.ok(ranked.length > 0, "the nudge should still admit items");
  for (const r of ranked) {
    assert.equal(r._queryEvidence, false, `${r.id} must not claim query evidence`);
  }
  // The gate must now fire on this rack.
  assert.equal(ranked.some((r) => r._queryEvidence), false);

  // And the reason the old check failed: none of them is labeled "moodboard
  // brain", so the label-based predicate read this rack as grounded.
  assert.equal(ranked.some((r) => r.matchReason === "moodboard brain"), false);
  assert.equal(ranked.some((r) => r.matchReason !== "moodboard brain"), true);
});

test("a garment-category match IS query evidence, though it also reads 'category browse'", () => {
  // This is the distinction matchReason cannot express: same label, opposite
  // meaning. The user typed a garment noun and this item is that garment.
  const interpreted = {
    query: "trouser", tokens: ["trouser"], mappedTags: [],
    relatedTerms: [], intent: "text", brand: null,
  };
  const ranked = rankSearchResults(POOL, interpreted, { personal: null });
  const byCategory = ranked.filter((r) => r.matchReason === "category browse");
  assert.ok(byCategory.length > 0, "expected at least one category-browse item");
  for (const r of byCategory) {
    assert.equal(r._queryEvidence, true, `${r.id} was admitted by the query, not by taste`);
  }
});

test("an item the nudge outweighs still carries the evidence it earned", () => {
  // cosineish is capped at 2, so a strong affinity can outrank a weak literal
  // reason and take the display label. The item still has query evidence.
  const pool = [{
    id: "weak-literal", title: "Pleated Wool Trouser", brand: "Lemaire",
    category: "bottoms", tags: { MINIMAL: 1, TAILORED: 1 }, _textRank: 0.05,
  }];
  const r = rankSearchResults(pool, UNMATCHED, { personal: { vec: { MINIMAL: 1, TAILORED: 1 } } })[0];
  assert.equal(r.matchReason, "moodboard brain", "the nudge should win the label here");
  assert.equal(r._queryEvidence, true, "but an indexed text match is still query evidence");
});

test("the evidence flag is internal and never reaches API consumers", async () => {
  const res = await searchProducts("good blanks", { limit: 5 });
  assert.ok(res.results.length > 0);
  for (const it of res.results) {
    assert.equal("_queryEvidence" in it, false, "internal flag must be stripped");
    assert.equal("_score" in it, false);
  }
});
