"use client";

// app/components/PassportSecurity.jsx — the security artwork of the PASSPORT
// document (redesign/passport-uv), colour-matched to the OS tokens.
//
// Owner iteration 5: the background is REAL PARIS — actual OpenStreetMap
// road geometry (public/paris-roads.json, built by
// scripts/fetch-paris-roads.py; © OpenStreetMap contributors, ODbL) —
// or, since V.2 round two, the reader's own streets when a base city is
// confirmed. Every road is traced as a line; building footprints in the
// core are very thin outlines; every intersection where five or more road
// arms genuinely meet carries a text-style red asterisk. No street names.
//
// THE TASTE PASSPORT (owner's mock-up, 2 Nov 2026: "i still want the paris
// road map as the passport's background but i want it very very very lower
// opacity to look less extreme"): ONE layer of the map across the whole
// document, faint, no glow, no hot window — the hologram window and the
// microprint band went with it. The registration pluses and the page
// number of the original stay.

import ParisMap, { useParisRoads } from "./ParisMap.jsx";

// Registration crosses over the masthead: [x, y, size, tone]
const CROSSES = [
  [30, 16, 7, "r"], [96, 34, 5, "s"], [168, 10, 9, "r"], [235, 40, 6, "p"],
  [310, 18, 5, "s"], [382, 46, 8, "r"], [448, 12, 6, "p"], [520, 36, 10, "r"],
  [585, 20, 5, "s"], [648, 44, 7, "r"], [716, 14, 6, "p"], [788, 38, 9, "r"],
  [850, 22, 5, "s"], [912, 44, 6, "r"], [962, 12, 7, "p"],
];

// the registration crosses of the OG document (iteration 5): plain pluses in
// the three security tones
function Plus({ x, y, s = 5, tone = "s" }) {
  return <path className={"pvplus pv-" + tone} d={`M ${x - s} ${y} H ${x + s} M ${x} ${y - s} V ${y + s}`} />;
}

// V.2: the map is drawn only when the bearer's confirmed base city IS
// Paris (or no city is set yet). Another city gets no recognizable street
// map — the repo carries Paris's roads alone, and a public Passport whose
// city is hidden may never show one (lib/location.js).
export default function PassportSecurity({ roads = true, map: given }) {
  const paris = useParisRoads();
  // V.2 round two: the document draws the map it is GIVEN (the reader's own
  // streets); with none given, Paris — or nothing when roads are off.
  const map = given !== undefined ? given : (roads ? paris : null);
  return (
    <>
      {/* the map across the whole document, faint, unlit */}
      {map && (
        <div className="ppholo" aria-hidden="true">
          <div className="ppholo-a"><ParisMap map={map} /></div>
        </div>
      )}

      {/* overlay: registration pluses over the masthead, the page number */}
      <div className="ppuv" aria-hidden="true">
        <svg className="ppuvcross" viewBox="0 0 1000 60" preserveAspectRatio="none">
          {CROSSES.map(([x, y, s, tone], i) => <Plus key={i} x={x} y={y} s={s} tone={tone} />)}
        </svg>
        <span className="ppvpage">01</span>
        <span className="pposm">{map ? (map.centre ? "YOUR STREETS · MAP DATA © OPENSTREETMAP" : "MAP DATA © OPENSTREETMAP") : "READING YOUR STREETS…"}</span>
      </div>
    </>
  );
}
