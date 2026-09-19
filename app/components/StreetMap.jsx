"use client";

// app/components/StreetMap.jsx — the places map as a STREET MAP in the Apple
// Maps idiom (V.2 round two, owner: "the map should more similarly copy
// apple maps"). Real OpenStreetMap roads for the reader's area — the same
// document the passport draws as a hologram — rendered the way Apple draws
// a city: soft land, white streets with a faint casing, major roads a warm
// cream, a dark variant for phosphor; rounded pins with a glyph, a callout
// on the chosen one; drag to pan, wheel or buttons to zoom. No labels —
// the document carries no names, and none are invented.
//
// Canvas for the roads (one path per tier per frame), HTML for the pins so
// they stay real buttons. Reduced motion: no eased zoom.

import { useEffect, useMemo, useRef, useState } from "react";

const GLYPH = { runway: "R", "pop-up": "P", consignment: "C", thrift: "T", shop: "S", exhibition: "E", creator: "◉" };

function parsePolys(d) {
  const out = [];
  for (const sub of String(d || "").split("M")) {
    if (!sub) continue;
    const pts = [];
    for (const pair of sub.split(/[LZ]/)) {
      const sp = pair.indexOf(" ");
      if (sp < 1) continue;
      const x = +pair.slice(0, sp), y = +pair.slice(sp + 1);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push(x, y);
    }
    if (pts.length > 3) out.push(pts);
  }
  return out;
}

function palette() {
  const light = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  return light
    ? { land: "#eef0ee", minor: "#ffffff", minorCase: "#dcdfdc", second: "#ffffff", secondCase: "#d3d7d3", major: "#fbe9b5", majorCase: "#e6cf8a", ring: "rgba(0,0,0,0.08)" }
    : { land: "#1c1e21", minor: "#2c3035", minorCase: "#1c1e21", second: "#363b41", secondCase: "#1c1e21", major: "#4a4f57", majorCase: "#2a2e33", ring: "rgba(255,255,255,0.08)" };
}

export default function StreetMap({ map, centre, places = [], selectedId = null, onSelect, height = 440 }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 }); // map px → screen px
  const [size, setSize] = useState({ w: 800, h: height });
  const drag = useRef(null);
  const polys = useMemo(() => map ? { major: parsePolys(map.major), secondary: parsePolys(map.secondary), minor: parsePolys(map.minor) } : null, [map]);

  // fit: the map's centre at the middle, scaled so the frame's height fills the box
  useEffect(() => {
    if (!map || !wrapRef.current) return;
    const w = wrapRef.current.clientWidth || 800;
    const s = Math.max(w / map.w, height / map.h) * 1.15;
    setSize({ w, h: height });
    setView({ scale: s, tx: w / 2 - (map.w / 2) * s, ty: height / 2 - (map.h / 2) * s });
  }, [map, height]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !polys) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext("2d");
    const P = palette();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.land; ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.tx, dpr * view.ty);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const draw = (list, width, color) => {
      ctx.beginPath();
      for (const pts of list) { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
      ctx.lineWidth = width / view.scale; ctx.strokeStyle = color; ctx.stroke();
    };
    // casings first, then fills — Apple's roads are white with a soft edge
    draw(polys.minor, 2.4, P.minorCase); draw(polys.secondary, 4.2, P.secondCase); draw(polys.major, 6.2, P.majorCase);
    draw(polys.minor, 1.2, P.minor); draw(polys.secondary, 2.6, P.second); draw(polys.major, 4.2, P.major);
    // the centre ring
    ctx.beginPath(); ctx.arc(map.w / 2, map.h / 2, 900 / 15.5, 0, Math.PI * 2); ctx.lineWidth = 1 / view.scale; ctx.strokeStyle = P.ring; ctx.stroke();
  }, [polys, view, size, map]);

  // theme changes repaint
  useEffect(() => {
    const mo = new MutationObserver(() => setView((v) => ({ ...v })));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  function project(p) {
    if (!map || !centre) return null;
    const kx = Math.cos((centre.lat * Math.PI) / 180) * 111320, ky = 110574;
    const mx = ((p.lng - centre.lng) * kx) / 15.5 + map.w / 2;
    const my = (-(p.lat - centre.lat) * ky) / 15.5 + map.h / 2;
    return { x: mx * view.scale + view.tx, y: my * view.scale + view.ty };
  }
  function zoomBy(f, cx = size.w / 2, cy = size.h / 2) {
    setView((v) => {
      const s = Math.min(6, Math.max(0.35, v.scale * f));
      const k = s / v.scale;
      return { scale: s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }
  function onPointerDown(e) { drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; e.currentTarget.setPointerCapture(e.pointerId); }
  function onPointerMove(e) { if (!drag.current) return; setView((v) => ({ ...v, tx: drag.current.tx + (e.clientX - drag.current.x), ty: drag.current.ty + (e.clientY - drag.current.y) })); }
  function onPointerUp() { drag.current = null; }
  function onWheel(e) { e.preventDefault(); const r = wrapRef.current.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }

  const pins = places.map((p) => ({ p, at: project(p) })).filter(({ at }) => at && at.x > -30 && at.x < size.w + 30 && at.y > -30 && at.y < size.h + 30);
  const sel = pins.find(({ p }) => p.id === selectedId);

  return (
    <div className="smap" ref={wrapRef} style={{ height }} role="group" aria-label={centre ? `street map around ${centre.label || "your base city"}` : "street map"}>
      <canvas ref={canvasRef} className="smapcanvas" style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
      {!map && <div className="smapempty">reading the streets around {centre ? (centre.label || "your city") : "you"}…</div>}
      {centre && map && (() => { const you = project({ lat: centre.lat, lng: centre.lng }); return you ? <span className="smapyou" style={{ left: you.x, top: you.y }} aria-hidden="true" /> : null; })()}
      {pins.map(({ p, at }) => (
        <button key={p.id} type="button" className={"smappin" + (p.sample ? " sample" : "") + (p.id === selectedId ? " sel" : "") + " " + p.kind}
          style={{ left: at.x, top: at.y }} aria-pressed={p.id === selectedId} aria-label={`${p.name} — ${p.kind}${p.sample ? ", sample fixture" : ""}`}
          onClick={() => onSelect && onSelect(p.id === selectedId ? null : p.id)}>
          <i>{GLYPH[p.kind] || "•"}</i>
        </button>
      ))}
      {sel && (
        <div className="smapcallout" style={{ left: sel.at.x, top: sel.at.y - 30 }} role="status">
          <b>{sel.p.name}</b>
          <span>{sel.p.kind.toUpperCase()}{sel.p.distanceKm != null ? ` · ${sel.p.distanceKm} KM` : ""}{sel.p.sample ? " · SAMPLE" : ""}</span>
        </div>
      )}
      <div className="smapctl" aria-label="zoom">
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="zoom out">−</button>
      </div>
      <span className="smapattr">{map ? map.attribution || "© OpenStreetMap contributors" : ""}</span>
    </div>
  );
}
