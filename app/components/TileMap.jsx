"use client";

// app/components/TileMap.jsx — THE STREETS, as tiles (owner, 3 Nov 2026, on the schematic: "bro can you give
// street view wtf is this radar shit"). The Passport's map window when this deploy holds no MapKit key: the
// OpenStreetMap standard tiles (tile.openstreetmap.org, © OpenStreetMap contributors, credited in the corner as
// its tile policy asks), laid in Web Mercator — real streets, parks, rivers and their names — graded light and
// quiet to stand in for Apple's light standard map, with the owner's SwiftUI marks on it: the passenger's dot,
// each place a black label in white OCR type (`.ppmaplabel`), the chosen one ringed red.
//
// Drag to pan; the wheel, a pinch or + / − to zoom; a chosen place is FLOWN to (eased, closing in to street
// level; a jump under reduced motion). No library: a grid of <img> tiles under a transform. A tile request
// tells OpenStreetMap's servers which area is on screen — the same as any web map, Apple's included; nothing
// personal rides with it and ASILUM stores nothing about it.

import { useEffect, useMemo, useRef, useState } from "react";

const TILE = 256;
const MIN_Z = 3, MAX_Z = 18;
const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Web Mercator: degrees ↔ world pixels at zoom z
function toWorld(lat, lng, z) {
  const s = TILE * 2 ** z, r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
}

export default function TileMap({ centre = null, places = [], selectedId = null, onSelect, height = 480 }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(360);
  // the camera: the centre in degrees and a (fractional) zoom
  const [cam, setCam] = useState(() => ({ lat: centre ? centre.lat : 20, lng: centre ? centre.lng : 0, z: centre ? 13 : 3 }));
  const camRef = useRef(cam);
  camRef.current = cam;
  const drag = useRef(null);
  const pinch = useRef(null);
  const anim = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a new centre (the base city confirmed) re-centres the camera
  useEffect(() => { if (centre) setCam((c) => ({ ...c, lat: centre.lat, lng: centre.lng, z: Math.max(c.z, 12) })); }, [centre && centre.lat, centre && centre.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  function flyTo(to) {
    cancelAnimationFrame(anim.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setCam(to); return; }
    const from = camRef.current, t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setCam({ lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e, z: from.z + (to.z - from.z) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }
  useEffect(() => {
    const p = selectedId && places.find((x) => x.id === selectedId);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) flyTo({ lat: p.lat, lng: p.lng, z: Math.max(camRef.current.z, 15) });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // the tiles at the integer zoom under the camera, scaled for the fraction
  const zi = Math.max(MIN_Z, Math.min(MAX_Z, Math.floor(cam.z)));
  const scale = 2 ** (cam.z - zi);
  const c = toWorld(cam.lat, cam.lng, zi);
  const left = c.x - w / 2 / scale, top = c.y - height / 2 / scale;   // the view's top-left, world px at zi
  const tiles = useMemo(() => {
    const out = [], n = 2 ** zi;
    const x0 = Math.floor(left / TILE), y0 = Math.floor(top / TILE);
    const x1 = Math.floor((left + w / scale) / TILE), y1 = Math.floor((top + height / scale) / TILE);
    for (let ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++)
      for (let tx = x0; tx <= x1; tx++) out.push({ key: `${zi}/${tx}/${ty}`, src: tileUrl(zi, ((tx % n) + n) % n, ty), x: tx * TILE - left, y: ty * TILE - top });
    return out;
  }, [zi, left, top, w, height, scale]);
  const screen = (lat, lng) => { const p = toWorld(lat, lng, zi); return { x: (p.x - left) * scale, y: (p.y - top) * scale }; };

  // the hand: drag pans; the wheel, a pinch and the keys zoom about a point
  function panBy(dx, dy) {
    const cc = camRef.current, z = Math.floor(cc.z), s = 2 ** (cc.z - z), p = toWorld(cc.lat, cc.lng, z);
    const nx = p.x - dx / s, ny = p.y - dy / s, size = TILE * 2 ** z;
    const lng = (nx / size) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ny) / size))) * 180) / Math.PI;
    setCam({ ...cc, lat, lng });
  }
  function zoomBy(dz) { cancelAnimationFrame(anim.current); setCam((cc) => ({ ...cc, z: Math.max(MIN_Z, Math.min(MAX_Z, cc.z + dz)) })); }
  function onPointerDown(e) {
    if (e.target.closest("button")) return;
    cancelAnimationFrame(anim.current);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current || drag.current.id !== e.pointerId || pinch.current) return;
    panBy(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
  }
  function onPointerUp() { drag.current = null; }
  function onWheel(e) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.35 : -0.35); }
  function onTouchStart(e) { if (e.touches.length === 2) { drag.current = null; pinch.current = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: camRef.current.z }; } }
  function onTouchMove(e) {
    if (!pinch.current || e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    setCam((cc) => ({ ...cc, z: Math.max(MIN_Z, Math.min(MAX_Z, pinch.current.z + Math.log2(d / pinch.current.d))) }));
  }
  function onTouchEnd() { pinch.current = null; }
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }); // re-bound each render so the handler sees the camera

  const you = centre ? screen(centre.lat, centre.lng) : null;
  return (
    <div className="ppmaptiles" ref={wrapRef} style={{ height }} role="group" aria-label={centre ? `street map around ${centre.label || "your city"} — drag to move, pinch or use the keys to zoom` : "street map of the world"}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ppmaptilelayer" style={{ transform: `scale(${scale})` }} aria-hidden="true">
        {tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} decoding="async" style={{ left: t.x, top: t.y }} />)}
      </div>
      {you && <span className="ppmapyou" style={{ left: you.x, top: you.y }} aria-hidden="true" />}
      {places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => {
        const at = screen(p.lat, p.lng);
        if (at.x < -160 || at.x > w + 160 || at.y < -40 || at.y > height + 40) return null;
        return (
          <button key={p.id} type="button" className={"ppmaplabel smaplabel" + (p.id === selectedId ? " sel" : "")} style={{ left: at.x, top: at.y }}
            aria-pressed={p.id === selectedId} aria-label={`${p.name} — ${p.kind}${p.sample ? ", sample fixture" : ""}`} onClick={() => onSelect && onSelect(p.id)}>
            {String(p.name || "").toUpperCase()}
          </button>
        );
      })}
      <div className="ppmapzoom" aria-label="zoom">
        <button type="button" onClick={() => zoomBy(1)} aria-label="zoom in">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="zoom out">−</button>
      </div>
      <a className="ppmapcredit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap ↗</a>
    </div>
  );
}
