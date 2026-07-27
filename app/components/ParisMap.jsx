"use client";

// app/components/ParisMap.jsx — the real-OSM Paris road hologram, shared
// (redesign/upload-station). PassportSecurity renders it inside the
// document; /upload keeps it as the page background after the warp so the
// hand-off reads as one continuous surface. Data: public/paris-roads.json
// (scripts/fetch-paris-roads.py, © OpenStreetMap contributors ODbL).

import { useEffect, useState } from "react";

export function useParisRoads() {
  const [map, setMap] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/paris-roads.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d && d.major) setMap(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return map;
}

export default function ParisMap({ map, hot }) {
  return (
    <svg viewBox={`0 0 ${map.w} ${map.h}`} preserveAspectRatio="xMidYMid slice">
      {/* buildings: very thin, never glowing */}
      <path className="pvbld" d={map.buildings} />
      <g className={hot ? "pvroads pvroads-hot" : "pvroads"}>
        <path className="pvrd-minor" d={map.minor} />
        <path className="pvrd-second" d={map.secondary} />
        <path className="pvrd-major" d={map.major} />
      </g>
      <g className={hot ? "pvstars pvstars-hot" : "pvstars"}>
        {map.stars.map(([x, y], i) => (
          <text key={i} x={x} y={y + 5} textAnchor="middle">*</text>
        ))}
      </g>
    </svg>
  );
}
