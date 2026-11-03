// lib/passport/barcode.js — the geometry of the bar code at the foot of
// the PASSPORT (the owner's mock-up, 2 Nov 2026: a ramp rising from the
// left into a run of bars). Client-safe, no imports but the document's:
// the ramp's rise is a cosine ease; the bars are read off the passport
// number — every digit sets a bar's width and the gap after it — so the
// code is the document's own and the same every time the passport opens.
// It is NOT a scannable symbology (no Code 128, no checksum) and nothing
// reads it: the machine zone beneath carries the data. Drawn by
// app/components/PassportBarcode.jsx.

import { passportNumber } from "./document.js";

export const BARCODE_W = 600, BARCODE_H = 96;
const RAMP_X0 = 0, RAMP_X1 = 300; // the ramp climbs over the left half
const FOOT = 4;                   // the ramp's thin foot at the left edge
const BAR_X0 = 300, BAR_X1 = 600;

export function rampPath() {
  const steps = 24;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = RAMP_X0 + (RAMP_X1 - RAMP_X0) * t;
    const y = BARCODE_H - FOOT - (BARCODE_H - FOOT) * (1 - Math.cos(Math.PI * t)) / 2;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${RAMP_X0} ${BARCODE_H} L ${pts.join(" L ")} L ${RAMP_X1} ${BARCODE_H} Z`;
}

/** The bars, [x, width] pairs across the right half, read off the passport number's digits. */
export function bars(uid) {
  const digits = passportNumber(uid).split("").map(Number);
  const out = [];
  let x = BAR_X0, i = 0;
  while (x < BAR_X1) {
    const d = digits[i % digits.length], e = digits[(i * 7 + 3) % digits.length];
    const w = 3 + (d % 4) * 3;          // 3, 6, 9 or 12 wide
    const gap = 3 + (e % 3) * 3;        // 3, 6 or 9 between
    out.push([x, Math.min(w, BAR_X1 - x)]);
    x += w + gap;
    i++;
  }
  return out;
}
