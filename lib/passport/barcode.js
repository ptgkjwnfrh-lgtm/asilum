// lib/passport/barcode.js — THE BAR CODE AT THE FOOT OF THE PASSPORT, which
// is THE LOGO'S BRICK MIRRORED (owner, 2 Nov 2026: "a negative cut out like
// the logo … the barcode slope should match the logo slope … thin out the
// barcode"). The brick of lib/wordmark.js — its line running in from the
// left, rising at the logo's own slant (the shoulder's 34°, its bends) into
// the block — and, as the word is cut out of the logo's brick, the bars are
// cut out of this one: holes the glass shows through. The bars are read off
// the passport number — every digit sets a bar's width and the gap after
// it — so the code is the document's own and the same every time the
// passport opens. It is NOT a scannable symbology and nothing reads it: the
// machine zone beneath carries the data. Client-safe; drawn by
// app/components/PassportBarcode.jsx.
//
// Units are the logo's (the brick 151.5 tall, its line 16, its bend 36);
// the page sets the box 90 wide by 8.09 (hundredths of the page's width,
// the golden grid's φ¹), the brick's own ratio.

import { brickGeometry, brickPath } from "../wordmark.js";
import { passportNumber } from "./document.js";

const brick = brickGeometry();
export const BARCODE_H = +(brick.foot - brick.top).toFixed(3); // 151.518
export const BARCODE_W = 1686;                                  // the content's 90 hundredths of the page at φ¹ (8.09) deep: the brick's own ratio
const BLOCK = 826;                                              // the block (the bars) at the right: 43.6 hundredths
const PAD = 24;                                                 // the plate kept whole past the first and last bar

/** The brick, in the LOGO'S frame (x = 0 at the box's right edge; the drawing mirrors it): the block from the
 *  edge to the shoulder, the slant down at the logo's run to the toe, the line on to the box's left edge. */
export function barcodeGeometry() {
  const g = brick;
  const run = (g.toe - g.shoulder) / (g.line - g.top);
  const top = 0, foot = BARCODE_H, line = foot - g.thick;
  const shoulder = BLOCK, toe = +(shoulder + (line - top) * run).toFixed(3);
  return { top, foot, line, shoulder, toe, bend: g.bend, thick: g.thick, tail: +(BARCODE_W - (toe + g.bend)).toFixed(3) };
}

/** The brick's outline (lib/wordmark.js brickPath), from the box's right edge (0, mirrored) to its left. */
export function barcodePath() {
  const g = barcodeGeometry();
  return brickPath(g, { left: 0, tail: g.tail });
}

/** The bars, [x, width] pairs in the logo's frame across the block, read off the passport number's digits:
 *  10 to 34 wide, 10 to 24 apart. Every one is a hole through the brick, full height. */
export function bars(uid) {
  const digits = passportNumber(uid).split("").map(Number);
  const out = [];
  let x = PAD, i = 0;
  const end = BLOCK - PAD;
  while (x < end) {
    const d = digits[i % digits.length], e = digits[(i * 7 + 3) % digits.length];
    const w = 10 + (d % 4) * 8;          // 10, 18, 26 or 34
    const gap = 10 + (e % 3) * 7;        // 10, 17 or 24 between
    if (x + w > end) break;
    out.push([x, w]);
    x += w + gap;
    i++;
  }
  return out;
}
