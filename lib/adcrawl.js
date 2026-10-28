// lib/adcrawl.js — THE AD TICKER'S CRAWL AND WRAP (owner, 28 Oct 2026, with
// the MAD-S player's wrap-round display as the reference: "lets have it
// stretch all the across the center fixture, so if the center fixture was a
// 3d object the add ticker should stretch all around it"; then "i wanted the
// bar to stretch the entirety of the fixture like i meant if the fixture was
// a object the ad ticker would wrap around the whole thing 360 degrees not
// just stuck on the middle"). The ticker is a band round the deck: across
// its face edge to edge, and round each side as a quarter cylinder of radius
// R, so the words squeeze to nothing at the deck's silhouette and go on
// round the back. The entries crawl as one line, right to left.
// app/components/AdStrip.jsx draws it; this is the arithmetic.

/** The crawl's pace, in CSS pixels a second: an unhurried read. */
export const CRAWL_PX_S = 32;

/** How many flat slices draw each quarter cylinder (enough that the squeeze reads as a curve). */
export const WRAP_SLICES = 6;

/**
 * The slices of the two quarter cylinders, in units of the wrap's radius R.
 * A point at angle θ round a side (0 where the face meets it, 90° at the
 * silhouette) shows at R·sin θ in from the face's edge and lies R·(π/2 − θ)
 * along the band from the silhouette. Each slice is the band's arc between
 * two angles laid flat and squeezed by `scale` (its shown width over its arc
 * length), from its own left edge; `at` is where its left edge shows (from
 * the band's left end for the left side, from the face's right edge for the
 * right side) and `from` how far along the band it begins (from the left
 * silhouette; for the right side, from the face's right edge); `shade` dims
 * it as it turns from the light.
 */
export function wrapSlices(n = WRAP_SLICES) {
  const d = Math.PI / 2 / n, out = { left: [], right: [], arc: d };
  for (let j = 0; j < n; j++) {
    // left side, outermost first: from θ = 90° − j·d down to 90° − (j+1)·d
    const hi = Math.PI / 2 - j * d, lo = hi - d;
    out.left.push({ at: 1 - Math.sin(hi), from: j * d, scale: (Math.sin(hi) - Math.sin(lo)) / d, shade: 1 - Math.cos((hi + lo) / 2) });
  }
  for (let k = 0; k < n; k++) {
    // right side, innermost first: from θ = k·d up to (k+1)·d
    const lo = k * d, hi = lo + d;
    out.right.push({ at: Math.sin(lo), from: k * d, scale: (Math.sin(hi) - Math.sin(lo)) / d, shade: 1 - Math.cos((hi + lo) / 2) });
  }
  return out;
}

/**
 * The crawl for one sequence of entries `seqW` wide on a band `bandW` long
 * (unrolled): how many copies the band needs (it must cover its whole length
 * even when it has slid a whole sequence along), how far one loop slides
 * (one sequence: the next copy lands exactly where the first began, so the
 * loop has no seam) and how long it takes at CRAWL_PX_S. Nothing measured,
 * no crawl.
 */
export function crawlFor(seqW, bandW, pxPerS = CRAWL_PX_S) {
  if (!(seqW > 0) || !(bandW > 0) || !(pxPerS > 0)) return { copies: 2, len: 0, seconds: 0 };
  return { copies: Math.ceil(bandW / seqW) + 1, len: seqW, seconds: Math.round((seqW / pxPerS) * 100) / 100 };
}
