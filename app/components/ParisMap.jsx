"use client";

// app/components/ParisMap.jsx — the real-OSM Paris road hologram, shared
// (redesign/upload-station). PassportSecurity renders it inside the
// document; /upload keeps it as the page background after the warp so the
// hand-off reads as one continuous surface. Data: public/paris-roads.json
// (scripts/fetch-paris-roads.py, © OpenStreetMap contributors ODbL).

import { useEffect, useState } from "react";

// (audit #19) The road data is 843 KB and every caller of this hook used to
// fetch and JSON.parse its own copy. /board calls the hook AND renders
// PassportSecurity, which calls it again — so the page paid the parse twice,
// on the main thread, for identical bytes. The document is immutable and
// public, so one in-flight promise serves every caller for the life of the
// page. A failed load clears the cache so a later mount can try again.
let roadsPromise = null;

/**
 * Load the Paris road geometry once per page, shared by every caller.
 *
 * The document is immutable and public, so a single in-flight promise serves
 * all mounts — parsing ~52k points twice would cost the main thread for
 * identical bytes. A FAILED LOAD CLEARS THE CACHE, so a later mount retries
 * instead of inheriting the failure forever.
 */
export function useParisRoads() {
  const [map, setMap] = useState(null);
  useEffect(() => {
    let live = true;
    if (!roadsPromise) {
      roadsPromise = fetch("/paris-roads.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.major ? d : null))
        .catch(() => null)
        .then((d) => { if (!d) roadsPromise = null; return d; });
    }
    roadsPromise.then((d) => { if (live && d) setMap(d); });
    return () => { live = false; };
  }, []);
  return map;
}

// V.2: THE READER'S OWN STREETS. Given a centre (rounded coordinates), the
// hook reads /api/roads for that area — the same document shape, drawn by
// the same component — and falls back to Paris when there is no centre or
// the streets cannot be read. One promise per centre for the page.
const roadsByCentre = new Map();
export function useRoads(centre) {
  const paris = useParisRoads();
  const [own, setOwn] = useState(null);
  const [failed, setFailed] = useState(false);
  const key = centre && Number.isFinite(centre.lat) && Number.isFinite(centre.lng) ? `${(+centre.lat).toFixed(2)},${(+centre.lng).toFixed(2)}` : null;
  useEffect(() => {
    let live = true;
    setOwn(null); setFailed(false);
    if (!key) return undefined;
    if (!roadsByCentre.has(key)) {
      roadsByCentre.set(key, fetch(`/api/roads?lat=${key.split(",")[0]}&lng=${key.split(",")[1]}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.major ? d : null))
        .catch(() => null)
        .then((d) => { if (!d) roadsByCentre.delete(key); return d; }));
    }
    roadsByCentre.get(key).then((d) => { if (!live) return; if (d) setOwn(d); else setFailed(true); });
    return () => { live = false; };
  }, [key]);
  return { map: own || (key && !failed ? null : paris), own: !!own, loading: !!key && !own && !failed, failed, paris };
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
