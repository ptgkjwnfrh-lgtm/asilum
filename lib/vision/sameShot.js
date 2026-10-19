// lib/vision/sameShot.js — THE SAME PHOTOGRAPH, ELSEWHERE.
//
// ── WHAT "REVERSE IMAGE SEARCH ON A LISTING" HONESTLY IS ────────────────────
//
// The competitor puts a button on every listing: press it, and it tells you
// where else that image appears. A reseller uses it to check whether the piece
// is already flooded before they buy.
//
// There is no button here. Opening a piece is the moment, and the terminal
// already knows — docs/INVISIBLE-MACHINERY.md.
//
// ── ONE COMPUTATION, TWO READINGS, AND WE STATE ONLY THE FACT ───────────────
//
// The same finding answers two different questions:
//
//   PRICE          the identical photograph is listed cheaper somewhere else
//   AUTHENTICITY   this seller did not photograph what they are selling
//
// ASTERISK does not choose between them. It states the fact — "the same
// photograph is listed at ¥8,000" — and the reader draws whichever conclusion
// is theirs to draw. The authenticity reading is handled separately and
// stake-gated in lib/authenticity/evidence.js; THIS one is not gated, because
// a cheaper identical listing is worth knowing at any price.
//
// ── WHAT THIS DELIBERATELY IS NOT ───────────────────────────────────────────
//
// It is not visual similarity, and dhash must never be stretched into it.
//
// A dhash is a DUPLICATE DETECTOR. At a hamming distance of ≤6 it means "the
// same photograph, possibly recompressed". At 10, 14, 20 it means nothing
// reliable at all — two dark garments on white land close together whether or
// not they resemble each other. Loosening the threshold to return "similar"
// pieces would be exactly the guess the first law forbids, dressed up as a
// feature.
//
// Real visual similarity — a DIFFERENT photograph of a comparable garment —
// needs image embeddings. `embedImage` in lib/embeddings/index.js is the
// declared seam and returns notImplemented on purpose. Filling it is the
// extension point; widening the threshold here is not.

import { findImageCollisions, imageFingerprintFor } from "../db/imageFingerprints.js";

/** How many other listings are worth naming before it is just noise. */
const MAX_ELSEWHERE = 3;

/**
 * Other catalog pieces carrying THIS piece's photograph.
 *
 * Returns `[{ id, price, currency, cheaper, saving }]`, cheapest first, or []
 * when the photograph is unique — which is the ordinary case and gets silence.
 *
 * `resolve` is injected rather than imported so this module stays a pure
 * lookup over the fingerprint store: the caller already holds the pool.
 *
 * Never throws. A piece that was never fingerprinted — a dead or undecodable
 * image at intake — returns [], and that is "we could not look", not "nothing
 * is there". lib/authenticity/evidence.js is where that distinction is
 * reported to a reader; here it is simply silence.
 */
export async function sameShotElsewhere(item, resolve) {
  if (!item?.id || typeof resolve !== "function") return [];
  try {
    const own = await imageFingerprintFor(item.id);
    if (!own?.dhash) return [];

    const price = Number(item.price);
    const hits = await findImageCollisions(own.dhash);

    const out = [];
    for (const hit of hits) {
      if (hit.itemId === item.id) continue;
      const other = resolve(hit.itemId);
      if (!other) continue;
      const otherPrice = Number(other.price);
      const comparable = Number.isFinite(price) && price > 0
        && Number.isFinite(otherPrice) && otherPrice > 0;
      out.push({
        id: other.id,
        // NULL, NOT ZERO. `Number(null)` is 0 and `Number.isFinite(0)` is
        // true, so a missing price reported itself as a real price of 0 —
        // which then sorted FIRST as the cheapest listing and would have
        // rendered "USD 0". A gap in the data is not a bargain.
        price: comparable || (Number.isFinite(otherPrice) && otherPrice > 0) ? otherPrice : null,
        currency: other.currency || null,
        // `cheaper` is only ever true when BOTH prices are real numbers.
        // A missing price is not a bargain, and treating it as one would
        // invent a saving out of an absence.
        cheaper: comparable && otherPrice < price,
        saving: comparable && otherPrice < price ? Math.round(price - otherPrice) : null,
      });
    }

    out.sort((a, b) => {
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    });
    return out.slice(0, MAX_ELSEWHERE);
  } catch {
    return [];
  }
}

/**
 * The one sentence worth saying about it, or null.
 *
 * Leads with the CHEAPER listing when there is one, because that is the half a
 * reader can act on. Otherwise it states the plain fact — the photograph is
 * shared — and lets them make of it what they will.
 *
 * Null whenever there is nothing to say, and the caller must render nothing at
 * all rather than an empty row.
 */
export function sameShotNote(elsewhere = []) {
  if (!elsewhere.length) return null;
  const cheaper = elsewhere.find((e) => e.cheaper);
  if (cheaper) {
    const money = cheaper.currency ? `${cheaper.currency} ${cheaper.price}` : `${cheaper.price}`;
    return `the same photograph is listed at ${money}.`;
  }
  return elsewhere.length === 1
    ? "the same photograph is on another listing."
    : `the same photograph is on ${elsewhere.length} other listings.`;
}
