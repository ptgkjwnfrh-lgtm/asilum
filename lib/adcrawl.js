// lib/adcrawl.js — THE AD TICKER'S CRAWL (owner, 28 Oct 2026, with the
// MAD-S player's wrap-round display as the reference: "lets have it stretch
// all the across the center fixture, so if the center fixture was a 3d
// object the add ticker should stretch all around it"). The ticker no longer
// swaps one entry for the next; its entries run as one line that crawls
// right to left, out of the deck's right side, along the face and under the
// ADs label, the way a strip display wrapped round a device's edge reads.
// app/components/AdStrip.jsx draws it; this is the arithmetic.

/** The crawl's pace, in CSS pixels a second: an unhurried read. */
export const CRAWL_PX_S = 32;

/** How far each curl turns away round the deck's side (degrees). */
export const CURL_DEG = 50;

/**
 * The crawl for one sequence of entries `seqW` wide on a track `trackW`
 * wide: how many copies the band needs (it must cover the whole track even
 * when it has slid a whole sequence along), how far one loop slides (one
 * sequence: the next copy lands exactly where the first began, so the loop
 * has no seam) and how long it takes at CRAWL_PX_S. Nothing measured, no
 * crawl.
 */
export function crawlFor(seqW, trackW, pxPerS = CRAWL_PX_S) {
  if (!(seqW > 0) || !(trackW > 0) || !(pxPerS > 0)) return { copies: 2, len: 0, seconds: 0 };
  return { copies: Math.ceil(trackW / seqW) + 1, len: seqW, seconds: Math.round((seqW / pxPerS) * 100) / 100 };
}
