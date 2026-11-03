"use client";

// app/components/PassportBarcode.jsx — THE BAR CODE AT THE FOOT (owner's
// mock-up, 2 Nov 2026: a ramp rising from the left into a run of bars, the
// whole shape a "negative cut out in the Liquid Glass"). One SVG, the
// geometry from lib/passport/barcode.js (the ramp a cosine, the bars read
// off the passport number). Decoration drawn from real state, hidden from
// assistive technology.
//
// The cut is painted in the document's ink (the logo's plate in dark, where
// it glows white; the page's navy in light), the way the wordmark's brick
// is: a negative of the glass, not a hole through the page.

import { BARCODE_H, BARCODE_W, bars, rampPath } from "../../lib/passport/barcode.js";

export default function PassportBarcode({ uid }) {
  return (
    <svg className="ppbarcode" viewBox={`0 0 ${BARCODE_W} ${BARCODE_H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ppcut" d={rampPath()} />
      {bars(uid).map(([x, w], i) => <rect key={i} className="ppcut" x={x} y={0} width={w} height={BARCODE_H} />)}
    </svg>
  );
}
