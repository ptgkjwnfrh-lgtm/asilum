"use client";

// app/components/PassportSecurity.jsx — THE MAP UNDER THE PASSPORT.
//
// Owner iteration 5: REAL PARIS — actual OpenStreetMap road geometry
// (public/paris-roads.json, built by scripts/fetch-paris-roads.py; ©
// OpenStreetMap contributors, ODbL) — or, since V.2 round two, the reader's
// own streets when a base city is confirmed. Every road is traced as a
// line; building footprints in the core are very thin outlines; every
// intersection where five or more road arms genuinely meet carries a
// text-style red asterisk. No street names.
//
// The Taste Passport (owner, 2 Nov 2026: "i only wanted the map to stay …
// very very very lower opacity"): ONE faint layer of the map across the
// whole document, unlit, and nothing else of the old artwork — the
// registration pluses, the page number, the hologram window and the
// microprint are gone. The map's credit stays (the licence asks for it),
// tiny, at the foot.

import ParisMap, { useParisRoads } from "./ParisMap.jsx";

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
      {map && (
        <div className="ppholo" aria-hidden="true">
          <div className="ppholo-a"><ParisMap map={map} /></div>
        </div>
      )}
      <span className="pposm" aria-hidden="true">{map ? (map.centre ? "YOUR STREETS · MAP DATA © OPENSTREETMAP" : "MAP DATA © OPENSTREETMAP") : "READING YOUR STREETS…"}</span>
    </>
  );
}
