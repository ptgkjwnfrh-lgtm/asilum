"use client";
// app/components/PlaceMap.jsx — THE PLACE MAP, one choice (owner, 31 Oct
// 2026: "i still need … Apple maps APIs"): Apple's map through MapKit JS
// when this deploy holds a MapKit key, the schematic (FashionMap.jsx) when
// it does not. The page asks /api/mapkit/token ONCE; `enabled: false` is the
// honest answer that there is no key, and the schematic draws exactly as before.
// The pins are the same rows either way; selecting one tells the parent.
//
// Apple's script is loaded only after the token says yes — a reader on an
// unkeyed deploy never contacts Apple. The script carries Apple's own legal
// line and logo (its terms ask for them; nothing here hides them).
//
// Not for the public Passport's hidden-city ring: that surface stays the
// schematic by design (a ring with no recognizable streets).

import { useEffect, useRef, useState } from "react";
import FashionMap from "./FashionMap.jsx";

const GLYPH = { runway: "R", "pop-up": "P", consignment: "C", thrift: "T", shop: "S", exhibition: "E", concert: "♪", creator: "◉" };

let gate = null; // Promise<{ enabled, script }>: one ask per page
let loaded = null; // Promise<mapkit>: one script per page

/** The token route's answer, asked once per page; later calls (Apple's own
 *  refresh) ask again, since a token lasts thirty minutes. */
async function askToken() {
  const res = await fetch("/api/mapkit/token", { cache: "no-store" });
  const d = await res.json().catch(() => ({}));
  return { enabled: !!(res.ok && d.enabled && d.token), token: d.token || null, script: d.script || null, reason: d.reason || null };
}

function mapkitGate() {
  if (!gate) gate = askToken().catch(() => ({ enabled: false, token: null, script: null, reason: "the token route did not answer" }));
  return gate;
}

function loadMapkit(script, firstToken) {
  if (!loaded) {
    loaded = new Promise((resolve, reject) => {
      if (typeof window === "undefined") return reject(new Error("no window"));
      if (window.mapkit && window.mapkit.Map) return resolve(window.mapkit);
      const el = document.createElement("script");
      el.src = script;
      el.async = true;
      el.crossOrigin = "anonymous";
      el.dataset.libraries = "map,annotations";
      el.onload = () => {
        if (!window.mapkit) return reject(new Error("mapkit.js loaded without mapkit"));
        let first = firstToken;
        window.mapkit.init({
          authorizationCallback(done) {
            if (first) { const t = first; first = null; done(t); return; }
            askToken().then((d) => done(d.token || "")).catch(() => done(""));
          },
        });
        resolve(window.mapkit);
      };
      el.onerror = () => reject(new Error("mapkit.js did not load"));
      document.head.appendChild(el);
    });
    loaded.catch(() => { loaded = null; });
  }
  return loaded;
}

/** "pending" while the page asks, then "apple" or "schematic". */
export function useMapkitGate() {
  const [state, setState] = useState("pending");
  useEffect(() => {
    let live = true;
    mapkitGate().then((d) => { if (live) setState(d.enabled ? "apple" : "schematic"); });
    return () => { live = false; };
  }, []);
  return state;
}

const themeNow = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
const token = (name) => (typeof getComputedStyle === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim());

/** The region a centre and a radius in km name; the world when there is no centre. */
export function regionFor(center, km) {
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    const latDelta = (2 * km) / 110.57;
    const lngDelta = (2 * km) / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
    return { lat: center.lat, lng: center.lng, latDelta, lngDelta };
  }
  return { lat: 20, lng: 0, latDelta: 140, lngDelta: 360 };
}

export function AppleMap({ center = null, km = 30, places = [], selectedId = null, onSelect, label = "" }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);
  // the map, once
  useEffect(() => {
    let live = true;
    mapkitGate().then((d) => {
      if (!live || !d.enabled) return null;
      return loadMapkit(d.script, d.token).then((mk) => {
        if (!live || !elRef.current || mapRef.current) return;
        const map = new mk.Map(elRef.current, {
          colorScheme: themeNow() === "light" ? mk.Map.ColorSchemes.Light : mk.Map.ColorSchemes.Dark,
          showsMapTypeControl: false,
          showsPointsOfInterest: false,
          isRotationEnabled: false,
          showsCompass: mk.FeatureVisibility.Hidden,
        });
        map.addEventListener("select", (e) => { const id = e.annotation && e.annotation.data && e.annotation.data.id; if (id && onSelect) onSelect(id); });
        mapRef.current = map;
        setFailed(false);
        // the theme follows the device, as every surface does
        const mo = new MutationObserver(() => { if (mapRef.current) mapRef.current.colorScheme = themeNow() === "light" ? mk.Map.ColorSchemes.Light : mk.Map.ColorSchemes.Dark; });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        map._asilumObserver = mo;
      });
    }).catch(() => { if (live) setFailed(true); });
    return () => {
      live = false;
      const map = mapRef.current;
      if (map) { try { if (map._asilumObserver) map._asilumObserver.disconnect(); map.destroy(); } catch { /* gone */ } mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the region and the pins, as they change
  useEffect(() => {
    const map = mapRef.current, mk = typeof window !== "undefined" ? window.mapkit : null;
    if (!map || !mk) return;
    const r = regionFor(center, km);
    try { map.region = new mk.CoordinateRegion(new mk.Coordinate(r.lat, r.lng), new mk.CoordinateSpan(r.latDelta, r.lngDelta)); } catch { /* an odd span */ }
    const red = token("--red") || undefined, ink = token("--grey") || undefined;
    const pins = places
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => new mk.MarkerAnnotation(new mk.Coordinate(p.lat, p.lng), {
        title: p.name || "",
        subtitle: [p.kind, p.sample ? "sample fixture" : null].filter(Boolean).join(" · "),
        color: p.id === selectedId ? red : ink,
        glyphText: GLYPH[p.kind] || "",
        data: { id: p.id },
        selected: p.id === selectedId,
      }));
    map.removeAnnotations(map.annotations);
    map.addAnnotations(pins);
  }, [center && center.lat, center && center.lng, km, places, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <FashionMap mode={center ? "local" : "world"} center={center} km={km} places={places} selectedId={selectedId} onSelect={onSelect} label={label} />;
  return <div ref={elRef} className="amap" role="group" aria-label={center ? `Apple map around ${label || "the pin"}, ${km} km across` : "Apple map of the world"} />;
}

/** The one map every place surface draws. */
export default function PlaceMap({ mode = "local", center = null, km = 30, places = [], selectedId = null, onSelect, label = "" }) {
  const gateState = useMapkitGate();
  if (gateState === "apple") return <AppleMap center={mode === "local" ? center : null} km={km} places={places} selectedId={selectedId} onSelect={onSelect} label={label} />;
  return <FashionMap mode={mode} center={center} km={km} places={places} selectedId={selectedId} onSelect={onSelect} label={label} />;
}
