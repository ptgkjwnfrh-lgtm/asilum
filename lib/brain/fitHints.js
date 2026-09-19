// lib/brain/fitHints.js — a reader's own fit corrections reach the ladder
// (V.2, 19 Sep 2026).
//
// "Too small" on a Celine top is a fact about Celine tops ON THIS BODY. It is
// recorded as a fit hint (lib/asterisk/correctionSignals.js) and, from here,
// it changes what the ladder reads: a piece from that house and category is
// read ONE size smaller than its label says for this reader, so the feed's
// ±1 ladder filter, the stylist's fit score and the fit sentence all see the
// corrected size. Nothing else moves — the taste vector, the price lane and
// the brand exclusions are untouched, and the piece keeps its label.
//
// Sign convention follows sizing.js: a positive runsBias means "runs small",
// i.e. the piece fits like a SMALLER size than its label.

import { fitHintFor, applyFitHint } from "./sizing.js";

export { fitHintFor, applyFitHint };

/** The item's size record as this reader should read it. */
export function sizeWithHints(item, hints = []) {
  const size = item?.size;
  if (!size || typeof size !== "object") return size;
  const hint = fitHintFor(item.brand, item.category, hints);
  return hint ? applyFitHint(size, hint) : size;
}

/** A pool with every size read through the reader's hints; the pool itself when there are none. */
export function poolWithFitHints(pool = [], hints = []) {
  if (!Array.isArray(hints) || !hints.length) return pool;
  return pool.map((it) => {
    const size = sizeWithHints(it, hints);
    return size === it.size ? it : { ...it, size };
  });
}
