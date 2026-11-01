"use client";

// app/components/PassportPlate.jsx — THE DOCUMENT'S NAME PLATE (owner,
// 31 Oct 2026: "redesign the passport to mimic the new style of the app …
// we're going for a sleek tron type of vibe now"). The passport names itself
// the way the Masthead's logo does (Wordmark.jsx, 29 Oct 2026, "make the
// [text] negative"): the name is cut out of a white plate, the glass and
// the hologram showing through the letters; the asterisk is the house red,
// full, glowing red; the plate glows white in dark, the logo's own glow.
// The name is drawn twice from the same measure — once in the mask, where
// the letters are the holes, and once over the plate, where only the
// asterisk is painted — so the two can never drift apart. The text under
// the plate tints the holes where the ground behind is bright (light), as
// the logo's --wm-cut-tint does.

import { useId } from "react";

export const PLATE_NAME = "ASILUM * FASHION PASSPORT";
// the plate's box in its own units, the word's size and its measure within it (lengthAdjust spaces the letters)
const W = 600, H = 46, SIZE = 21, MEASURE = 520;

function Name({ className, star }) {
  return (
    <text className={className} x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central"
      fontSize={SIZE} textLength={MEASURE} lengthAdjust="spacing">
      ASILUM <tspan className={star}>*</tspan> FASHION PASSPORT
    </text>
  );
}

export default function PassportPlate() {
  const cut = "ppcut-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className="ppnation" role="img" aria-label={PLATE_NAME}>
      <svg className="ppplate" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <rect className="ppplane" width={W} height={H} />
            <Name className="ppcut" star="ppcutstar" />
          </mask>
        </defs>
        <Name className="pptint" star="pptintstar" />
        <g className="ppplateglow"><rect className="ppplatebar" width={W} height={H} rx="9" mask={`url(#${cut})`} /></g>
        <g className="ppstarglow"><Name className="ppover" star="ppplatestar" /></g>
      </svg>
    </div>
  );
}
