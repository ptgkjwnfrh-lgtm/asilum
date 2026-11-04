"use client";

// app/components/VectorMap.jsx — THE STREETS IN APPLE'S HAND (owner, 3 Nov 2026: "make open streetmap look like
// apple maps", choosing vector tiles and a theme of our own — the one dependency, MapLibre, on the owner's word).
// The Passport's map window while this deploy holds no MapKit key: OpenFreeMap's OpenStreetMap vector tiles
// drawn by MapLibre in the Apple-light style (lib/passport/mapStyle.js) — flat, no tilt, no rotation, no points
// of interest — with the owner's SwiftUI marks over it: the passenger's dot, each place a black label in white
// OCR type (`.ppmaplabel`), the chosen one ringed red, the zoom keys, the credit. A chosen place is FLOWN to
// (a jump under reduced motion). MapLibre loads only when the window opens; where it cannot draw (no WebGL),
// the street tiles (TileMap.jsx) stand in. A tile request tells OpenFreeMap which area is on screen — as any
// web map does; nothing personal rides with it and ASILUM stores nothing about it.

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import TileMap from "./TileMap.jsx";
import { appleLightStyle } from "../../lib/passport/mapStyle.js";

// MapLibre's worker, served as a plain file: the bundler cannot follow the library's own link to it, so the
// exact version's copy lives in public/vendor (tests/passport-network.test.js keeps it the installed one's)
export const MAPLIBRE_WORKER = "/vendor/maplibre-gl-worker-6.16.0.mjs";

function labelEl(p, selected, onSelect) {
  const el = document.createElement("div");
  el.className = "vmapmark";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ppmaplabel vmaplabel" + (selected ? " sel" : "");
  b.textContent = String(p.name || "").toUpperCase();
  b.setAttribute("aria-label", `${p.name} — ${p.kind}${p.sample ? ", sample fixture" : ""}`);
  b.setAttribute("aria-pressed", selected ? "true" : "false");
  b.addEventListener("click", (e) => { e.stopPropagation(); if (onSelect) onSelect(p.id); });
  el.appendChild(b);
  return el;
}

export default function VectorMap({ centre = null, places = [], selectedId = null, onSelect, height = 480 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const libRef = useRef(null);
  const marksRef = useRef([]);
  const youRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the map, once
  useEffect(() => {
    let live = true;
    import("maplibre-gl").then((mod) => {
      const ml = mod.default || mod;
      if (!live || !elRef.current) return;
      libRef.current = ml;
      try { ml.setWorkerUrl(new URL(MAPLIBRE_WORKER, window.location.origin).href); } catch { /* an older build sets its own */ }
      let map;
      try {
        map = new ml.Map({
          container: elRef.current, style: appleLightStyle(),
          center: centre ? [centre.lng, centre.lat] : [0, 20], zoom: centre ? 13 : 1.6,
          dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
          attributionControl: { compact: true },
        });
      } catch { setFailed(true); return; }
      map.touchZoomRotate.disableRotation();
      map.on("error", (e) => { if (e && e.error && /webgl/i.test(String(e.error.message || ""))) setFailed(true); });
      map.on("load", () => { if (live) setReady(true); });
      mapRef.current = map;
    }).catch(() => { if (live) setFailed(true); });
    return () => {
      live = false;
      try { mapRef.current && mapRef.current.remove(); } catch { /* gone */ }
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the window's size follows the card
  useEffect(() => { if (mapRef.current) mapRef.current.resize(); }, [height]);

  // a new centre (the base city confirmed) moves the camera; the dot stands on it
  useEffect(() => {
    const map = mapRef.current, ml = libRef.current;
    if (!map || !ml || !ready) return;
    if (youRef.current) { youRef.current.remove(); youRef.current = null; }
    if (!centre) return;
    const dot = document.createElement("span");
    dot.className = "ppmapyou vmapyou";
    youRef.current = new ml.Marker({ element: dot }).setLngLat([centre.lng, centre.lat]).addTo(map);
    if (!selectedId) map.jumpTo({ center: [centre.lng, centre.lat], zoom: Math.max(map.getZoom(), 12) });
  }, [ready, centre && centre.lat, centre && centre.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // the places, as labels
  useEffect(() => {
    const map = mapRef.current, ml = libRef.current;
    if (!map || !ml || !ready) return;
    for (const m of marksRef.current) m.remove();
    marksRef.current = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => new ml.Marker({ element: labelEl(p, p.id === selectedId, onSelect), anchor: "bottom", offset: [0, -4] }).setLngLat([p.lng, p.lat]).addTo(map));
  }, [ready, places, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // a chosen place is flown to, down to street level
  useEffect(() => {
    const map = mapRef.current;
    const p = selectedId && places.find((x) => x.id === selectedId);
    if (!map || !ready || !p || !Number.isFinite(p.lat)) return;
    const to = { center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) };
    if (reduced()) map.jumpTo(to); else map.flyTo({ ...to, speed: 1.4, curve: 1.5, essential: false });
  }, [ready, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <TileMap centre={centre} places={places} selectedId={selectedId} onSelect={onSelect} height={height} />;
  return (
    <div className="vmap" style={{ height }}>
      <div ref={elRef} className="vmapcanvas" role="region" aria-label={centre ? `street map around ${centre.label || "your city"} — drag to move, pinch or use the keys to zoom` : "street map of the world"} />
      <div className="ppmapzoom" aria-label="zoom">
        <button type="button" onClick={() => mapRef.current && mapRef.current.zoomIn({ animate: !reduced() })} aria-label="zoom in">+</button>
        <button type="button" onClick={() => mapRef.current && mapRef.current.zoomOut({ animate: !reduced() })} aria-label="zoom out">−</button>
      </div>
    </div>
  );
}
