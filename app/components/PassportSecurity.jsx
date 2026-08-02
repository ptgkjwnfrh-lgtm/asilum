"use client";

// app/components/PassportSecurity.jsx — UV security artwork for the PASSPORT
// document (redesign/passport-uv), color-matched to the OS tokens.
//
// Owner iteration 5: the hologram is REAL PARIS — actual OpenStreetMap
// road geometry (public/paris-roads.json, built by
// scripts/fetch-paris-roads.py; © OpenStreetMap contributors, ODbL).
// Every road is traced as a line; building footprints in the core are
// very thin non-glowing outlines; every intersection where five or more
// road arms genuinely meet (computed from the road graph — 215 of them,
// l'Étoile included) carries a text-style red asterisk. No street names.
//
// The map runs across the whole document: the layer over the data page is
// glow-free and heavily dimmed; the lower window shows it at full opacity
// with heavy glow.
//
// Everything here is decoration EXCEPT the summit marker, which is real
// state: the bearer's strongest conviction annotates the map.

import ParisMap, { useParisRoads } from "./ParisMap.jsx";

// Registration crosses over the header area: [x, y, size, tone]
const CROSSES = [
  [30, 16, 7, "r"], [96, 34, 5, "s"], [168, 10, 9, "r"], [235, 40, 6, "p"],
  [310, 18, 5, "s"], [382, 46, 8, "r"], [448, 12, 6, "p"], [520, 36, 10, "r"],
  [585, 20, 5, "s"], [648, 44, 7, "r"], [716, 14, 6, "p"], [788, 38, 9, "r"],
  [850, 22, 5, "s"], [912, 44, 6, "r"], [962, 12, 7, "p"],
];

// Registration asterisks (owner amendment: same placement as the old
// pluses, five-point glyphs — five arms radiating from centre, point up).
function Ast({ x, y, s = 5, tone = "s" }) {
  const arms = [];
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    arms.push(`M ${x} ${y} L ${(x + Math.cos(a) * s).toFixed(1)} ${(y + Math.sin(a) * s).toFixed(1)}`);
  }
  return <path className={"pvplus pv-" + tone} d={arms.join(" ")} />;
}

export default function PassportSecurity({ topTag, topWeight }) {
  const map = useParisRoads();

  const summit = topTag
    ? `${Math.round(Math.abs(topWeight) * 100)} ${String(topTag).toUpperCase()}`
    : "UNCHARTED";
  return (
    <>
      {/* the hologram spans the whole document: glow-free dim layer over
          the data page, hot layer masked to the lower window */}
      {map && (
        <div className="ppholo" aria-hidden="true">
          <div className="ppholo-a"><ParisMap map={map} /></div>
          <div className="ppholo-b"><ParisMap map={map} hot /></div>
        </div>
      )}

      {/* overlay: registration asterisks over the header */}
      <div className="ppuv" aria-hidden="true">
        <svg className="ppuvcross" viewBox="0 0 1000 60" preserveAspectRatio="none">
          {CROSSES.map(([x, y, s, tone], i) => <Ast key={i} x={x} y={y} s={s} tone={tone} />)}
        </svg>
      </div>

      {/* open window where the hologram burns at full strength */}
      <div className="ppterrain" aria-hidden="true">
        <span className="ppsummit">▲ {summit}</span>
        <span className="pposm">MAP DATA © OPENSTREETMAP</span>
      </div>

      {/* microprint band above the machine zone, like security print */}
      <div className="ppmicro" aria-hidden="true">
        {("*ASILUM · FASHION INTELLIGENCE OS · ").repeat(24)}
      </div>
    </>
  );
}
