"use client";

// app/components/Cut.jsx — THE CUT (owner, 25 Oct 2026: "all the red lines
// should act like cuts in the image, so there's a slight warp around it").
// A red rule is a cut: a thin band either side of it bends what lies
// beneath — the image's edge, a word — through an SVG displacement filter
// run as a backdrop-filter, the way the liquid glass does (LiquidGlass.jsx:
// only Chromium runs an SVG filter as a backdrop-filter; elsewhere the rule
// is a plain red line and nothing is lost). The map is one small picture:
// red for the sideways pull, green for the vertical, 128 for none — above
// the cut the backdrop slides left and down toward the line, below it right
// and up, so the two sides read as the two lips of a cut.
//
//   <CutDefs />                 once on the page: the filter and its map
//   <Cut className="p2rule" />  a red rule that cuts

import { useEffect, useState } from "react";
import { canRefract } from "./LiquidGlass.jsx";

export const CUT_ID = "cutwarp";
export const CUT_SCALE = 26;   // px of pull at the lip (about 2.5px of warp)

// the map: a vertical gradient, grey (128) at the band's edges, the pull
// rising to the line and flipping across it
const MAP = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="64" viewBox="0 0 4 64">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="rgb(128,128,128)"/>' +
  '<stop offset="0.5" stop-color="rgb(104,152,128)"/>' +
  '<stop offset="0.5" stop-color="rgb(152,104,128)"/>' +
  '<stop offset="1" stop-color="rgb(128,128,128)"/>' +
  '</linearGradient></defs><rect width="4" height="64" fill="url(#g)"/></svg>'
);

export function CutDefs() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const ok = canRefract();
    setOn(ok);
    if (ok) document.documentElement.dataset.cut = "1";
    return () => { delete document.documentElement.dataset.cut; };
  }, []);
  if (!on) return null;
  return (
    <svg className="cutdefs" aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }}>
      <filter id={CUT_ID} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={MAP} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={CUT_SCALE} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export function Cut({ className = "" }) {
  return (
    <i className={"cut " + className} aria-hidden="true">
      <i className="cutband" />
    </i>
  );
}
