// Affinity-aware ranking for Asterisk interpretation tags (?tags=a|b|c).
//
// The exact-sum ranking treated every product tying on the queried tags as
// identical — a [TAILORED, MINIMAL] pill returned dozens of rank-equal items
// in pool order. The brain already owns the affinity matrix for exactly this
// fuzziness (a MINIMAL taste still sees adjacent TAILORED), so ordering now
// lets one-hop TAG_AFFINITY bleed separate the ties.
//
// INCLUSION IS UNCHANGED: a product still needs at least one exact queried-tag
// hit to appear at all. Bleed only orders the pool it never expands — an
// interpretation pill must not surface products none of its tags touch.

import { tagSim } from "../brain/tags.js";

// Bleed is a tiebreaker, not a peer signal. It is weighted down AND capped at
// the item's own exact score, so adjacency amplifies existing relevance (by at
// most 1.35x) but can never substitute for it: an item whose exact score
// leads by more than 35% cannot be overtaken, no matter how many adjacent
// tags the trailing item carries.
const BLEED_WEIGHT = 0.35;

/**
 * Score a piece against an interpretation's tags: `{ exact, score }`.
 *
 * EXACT hits count fully; adjacent tags "bleed" in at 35% and are CAPPED AT
 * THE EXACT TOTAL, so a piece that genuinely carries what was asked for cannot
 * be overtaken by one carrying many loosely related tags. That cap is the
 * whole design — without it, breadth beats relevance.
 */
export function scoreByInterpretationTags(productTags, queryTags) {
  const tags = productTags || {};
  let exact = 0;
  let bleed = 0;
  for (const [tag, weight] of Object.entries(tags)) {
    if (typeof weight !== "number" || weight <= 0) continue;
    if (queryTags.includes(tag)) { exact += weight; continue; }
    let best = 0;
    for (const qt of queryTags) {
      const sim = tagSim(qt, tag);
      if (sim > best) best = sim;
    }
    if (best > 0) bleed += weight * best;
  }
  return { exact, score: exact + BLEED_WEIGHT * Math.min(bleed, exact) };
}

/** Order a pool by interpretation tags, DROPPING anything with no exact hit.
 *  Bleed can reorder but never admit — a piece with only adjacent tags was not
 *  what was asked for. Returns the input untouched when there are no tags. */
export function rankByInterpretationTags(items, queryTags) {
  if (!Array.isArray(queryTags) || !queryTags.length) return items;
  return items
    .map((it) => ({ it, ...scoreByInterpretationTags(it.tags, queryTags) }))
    .filter((x) => x.exact > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
}
