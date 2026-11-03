"use client";

// app/components/PassportBarcode.jsx — THE BAR CODE, the logo's brick
// mirrored (lib/passport/barcode.js), drawn the way the wordmark is drawn
// (Wordmark.jsx, PassportPlate before it): the plate the masthead band's
// own — its low-opacity white in its glow (owner, 3 Nov 2026: "make the
// barcode match the masthead") — the bars CUT OUT of it by a mask — the filter and
// the mask on the one element, so the glow is computed from the whole
// plate and THEN the holes are cut. The slits are then laid with the page's
// own ground (owner, 3 Nov 2026: "the spaces inside the barcode, let's make
// it match the base color of the passport so it looks seamless" — before
// that the Liquid Glass and the map showed through them). Decoration drawn
// from real state, hidden from assistive technology.

import { useId } from "react";
import { BARCODE_H, BARCODE_W, barcodePath, bars } from "../../lib/passport/barcode.js";

const SPREAD = 40; // the mask's plane past the plate, in its units: room for the glow

export default function PassportBarcode({ uid }) {
  const cut = "ppbar-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const holes = bars(uid);
  return (
    <svg className="ppbarcode" viewBox={`0 0 ${BARCODE_W} ${BARCODE_H}`} aria-hidden="true">
      {/* the logo's frame runs the other way: its brick on the left, its line to the right — mirrored, the
          line runs in from the left and the block stands at the right, as the mock-up draws it */}
      <g transform={`matrix(-1 0 0 1 ${BARCODE_W} 0)`}>
        <defs>
          <mask id={cut} maskUnits="userSpaceOnUse" x={-SPREAD} y={-SPREAD} width={BARCODE_W + 2 * SPREAD} height={BARCODE_H + 2 * SPREAD}>
            <rect className="ppbarplane" x={-SPREAD} y={-SPREAD} width={BARCODE_W + 2 * SPREAD} height={BARCODE_H + 2 * SPREAD} />
            {holes.map(([x, w], i) => <rect key={i} className="ppbarhole" x={x} y={0} width={w} height={BARCODE_H} />)}
          </mask>
        </defs>
        <path className="ppbarplate" d={barcodePath()} mask={`url(#${cut})`} />
        {/* the slits, in the page's ground: seamless with the paper round the plate */}
        {holes.map(([x, w], i) => <rect key={"s" + i} className="ppbarslit" x={x} y={0} width={w} height={BARCODE_H} />)}
      </g>
    </svg>
  );
}
