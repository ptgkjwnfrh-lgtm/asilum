"use client";
// LIQUID GLASS, shared: the optics of the header strip (shell.js) and of the
// item detail (page.js) are one thing — a clear pane whose open edges bend
// what lies beneath it through an SVG displacement filter, with a whisper of
// gloss on top. This file owns the map drawing, the filter, and a hook that
// keeps any element's map in step with its size and carries the pointer's
// shine. The header keeps its own lamps and meniscus in shell.js.
import { useEffect, useRef } from "react";

// LIQUID GLASS, the optics. Only Chromium runs an SVG filter as a
// backdrop-filter (WebKit parses it and paints nothing; Gecko drops it), so
// the refraction is gated on the engine, not on CSS.supports — which is true
// everywhere and proves nothing.
export function canRefract() {
  if (typeof window === "undefined") return false;
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands)) return brands.some((b) => /chromium/i.test(b.brand || ""));
  return !!window.chrome; // Chrome, Edge, Brave, Arc, Opera — all Blink
}

// The displacement map: a picture of how far each pixel of the backdrop is
// pulled, red for x and green for y, 128 meaning none, blue held at 128 so
// the still middle is a pure grey. A SECOND, greyscale picture carries how
// much of the pane is bezel (the lens ring) rather than frost. Two pictures,
// not one: Chromium colour-manages a feImage into the display's space, and
// on a P3 screen a pixel of (128,128,0) comes back with blue near 0.2 — a
// weight carried in one colour channel next to two others leaked a ghost of
// the sharp lens through the whole frosted middle. Greys survive the
// conversion; only greys are trusted here. The bezel is the
// outer BEZEL px of the rounded rect (measured by a rounded-rect signed
// distance); its profile is Apple's squircle, y = (1 - (1 - t)^4)^(1/4), and
// the bend per point is Snell's law for glass (n = 1.5) on that slope,
// pointing INWARD along the surface normal so no pixel ever samples beyond
// the pane (Chromium's backdrop stops at the pane's edge). The very lip is
// eased to nothing so the edge itself stays clean, the way Apple's does.
export const BEZEL = 56; // lengthened twice (owner, 8 Sep: "more distortion", then "still too subtle, push it") — 24, then 44
const GLASS_N = 1.5;
function bendProfile(t) {
  // t: 0 at the edge, 1 at the inner end of the bezel
  if (t <= 0 || t >= 1) return 0;
  const u = 1 - t;
  const slope = (u * u * u) / Math.pow(1 - u * u * u * u, 0.75); // dy/dt of the squircle
  const theta = Math.atan(slope);
  const delta = theta - Math.asin(Math.sin(theta) / GLASS_N);
  const lip = Math.min(1, t / 0.12); // ease in over the outer 12% of the bezel
  return Math.tan(delta) * lip;
}
// `open` says which edges are real edges of the glass: an edge flush with
// the viewport (the strip's top, left and right) has nothing beyond it and
// does not lens; only the edges the page passes under do.
export function drawRefractionMap(node, weightNode, w, h, radius, open) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const cw = document.createElement("canvas");
  cw.width = w; cw.height = h;
  const ctxw = cw.getContext("2d");
  if (!ctx || !ctxw) return;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const imgw = ctxw.createImageData(w, h);
  const dw = imgw.data;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const o = open || { top: true, right: true, bottom: true, left: true };
  // normalise the profile so the strongest bend uses the full channel
  let peak = 0;
  for (let i = 1; i < 200; i++) peak = Math.max(peak, bendProfile(i / 200));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // distance to each OPEN edge (a closed edge is infinitely far)
      const dl = o.left ? x + 0.5 : Infinity, dr = o.right ? w - x - 0.5 : Infinity;
      const dt = o.top ? y + 0.5 : Infinity, db = o.bottom ? h - y - 0.5 : Infinity;
      const dx = Math.min(dl, dr), dy = Math.min(dt, db);
      const sx = dl <= dr ? -1 : 1, sy = dt <= db ? -1 : 1; // outward signs
      let nx = 0, ny = 0, inside; // outward normal, distance to the edge
      if (r > 0 && dx < r && dy < r) {
        // a rounded corner between two open edges: radial distance
        const cx = r - dx, cy = r - dy;
        const len = Math.hypot(cx, cy) || 1;
        nx = (cx / len) * sx; ny = (cy / len) * sy;
        inside = r - len;
      } else if (dx < dy) {
        nx = sx; inside = dx;
      } else {
        ny = sy; inside = dy;
      }
      let m = 0;
      if (inside >= 0 && inside < BEZEL) m = bendProfile(inside / BEZEL) / (peak || 1);
      // the bezel's weight: 1 at the lip, easing to 0 a little past the bend
      const bw = Math.max(0, Math.min(1, 1 - inside / (BEZEL * 1.35)));
      const i = (y * w + x) * 4;
      d[i] = Math.round(128 - nx * m * 127);      // pull inward along -normal
      d[i + 1] = Math.round(128 - ny * m * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
      const wt = Math.round(255 * bw * bw * (3 - 2 * bw)); // smoothstep, as a grey
      dw[i] = wt; dw[i + 1] = wt; dw[i + 2] = wt; dw[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxw.putImageData(imgw, 0, 0);
  node.setAttribute("href", c.toDataURL("image/png"));
  weightNode.setAttribute("href", cw.toDataURL("image/png"));
}


// The filter, once per pane (each pane needs its own id: its map is its own
// size). Render it near the pane; it is 0×0 and paints nothing itself.
export function LiquidGlassDefs({ id, mapRef, weightRef }) {
  return (
    <svg className="glass-defs" aria-hidden="true" focusable="false">
    {/* THE OPTICS: the centre of the pane is CRYSTAL CLEAR (the backdrop
        untouched — the owner found any frost "oddly cloudy"); the
        bezel is a lens — the backdrop bent through the map, each
        colour a little differently (glass disperses: red bends least,
        blue most — the faint colour fringe on Apple's edges), only
        lightly softened — blended with the clear backdrop by the weight
        picture, a grey that says how much of each pixel is bezel. That is
        Apple's clear glass: a refracting rim around an untouched middle. */}
    <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      <feImage ref={mapRef} preserveAspectRatio="none" result="lgmap" />
      <feImage ref={weightRef} preserveAspectRatio="none" result="lgw" />
      <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="80" xChannelSelector="R" yChannelSelector="G" result="bentR" />
      <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="86" xChannelSelector="R" yChannelSelector="G" result="bentG" />
      <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="92" xChannelSelector="R" yChannelSelector="G" result="bentB" />
      <feColorMatrix in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
      <feColorMatrix in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
      <feColorMatrix in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
      <feComposite in="chR" in2="chG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="chRG" />
      <feComposite in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="bent" />
      <feGaussianBlur in="bent" stdDeviation="1.2" result="lens" />
      {/* lens × weight + clear × (1 − weight): the weight picture read
          into COLOUR at full alpha, and its complement, so the blend is
          plain arithmetic — no alpha mask, nothing premultiplied to
          darken the band. */}
      <feColorMatrix in="lgw" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="w" />
      <feColorMatrix in="lgw" type="matrix" values="-1 0 0 0 1  -1 0 0 0 1  -1 0 0 0 1  0 0 0 0 1" result="iw" />
      <feComposite in="lens" in2="w" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lensW" />
      <feComposite in="SourceGraphic" in2="iw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="frostW" />
      <feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    </svg>
  );
}

// Keep an element's refraction map in step with its size (Chromium only —
// see canRefract), mark it data-refract="1" with --lg-filter pointing at its
// filter, and carry the pointer's shine (--gx/--gy/--gs) for its gloss.
// `open` names the edges that lens (default all four; the header passes the
// edges flush with the viewport as closed). Returns the defs to render.
export function useLiquidGlass(elRef, { id, active = true, open = null } = {}) {
  const mapRef = useRef(null);
  const weightRef = useRef(null);
  useEffect(() => {
    const el = elRef.current;
    if (!active || !el) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const refract = canRefract();
    let raf = 0;
    const fit = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (refract && mapRef.current && weightRef.current && r.width > 0 && r.height > 0) {
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        drawRefractionMap(mapRef.current, weightRef.current, Math.round(r.width), Math.round(r.height), radius, open);
        el.style.setProperty("--lg-filter", `url(#${id})`);
        el.dataset.refract = "1";
      }
    };
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(fit); });
    ro.observe(el);
    fit();
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${((e.clientX - r.left) / Math.max(1, r.width)) * 100}%`);
      el.style.setProperty("--gy", `${((e.clientY - r.top) / Math.max(1, r.height)) * 100}%`);
      el.style.setProperty("--gs", "1");
    };
    const onLeave = () => el.style.setProperty("--gs", "0");
    if (!still) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    }
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [elRef, id, active, open]);
  return <LiquidGlassDefs id={id} mapRef={mapRef} weightRef={weightRef} />;
}
