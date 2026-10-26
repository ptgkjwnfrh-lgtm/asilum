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
const SVG = "http://www.w3.org/2000/svg";

export function canRefract() {
  if (typeof window === "undefined") return false;
  // the lab switch: <html data-lg-page="1"> or ?lgpage=1 takes the
  // page-side path (what Safari gets) in any engine, so it can be seen and
  // judged on a desktop
  if (document.documentElement.dataset.lgPage === "1") return false;
  try { if (new URLSearchParams(window.location.search).get("lgpage") === "1") return false; } catch { /* no URL */ }
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
// `radius` is one number or the four corners [tl, tr, br, bl] (the owner's
// fixture sketch of 19 Oct 2026: the info deck's right end and the passport
// button's left end are straight, the outer ends round).
// `features` are the shapes carved INTO the pane — the cuts between keys,
// the post disc's ring, the foot grill, the tab indicator (lensFeatures
// below): the backdrop bends around each of them too, so the glass warps
// where it is cut, the way the sketch's Figure 3 draws it.
// THE PULL, AS TWO GREYS (19 Oct 2026: the owner saw the warp "curve to the
// left a lot"; a grid laid under the deck showed every vertical line along
// its bottom lip hooking left). The pull used to travel as ONE colour
// picture — red for x, green for y — and Chromium colour-manages an
// feImage, which on a wide-gamut screen MIXES the channels: where the y pull
// was strong (the top and bottom lips) some of it leaked into red and became
// a sideways pull. The same lesson as the weight picture below: only greys
// survive the conversion. So the x pull and the y pull are each drawn as a
// grey (xNode, yNode) and recombined inside the filter, where nothing is
// colour-managed. The colour picture (node) is still drawn for the
// page-side bend.
export function drawRefractionMap(node, weightNode, w, h, radius, open, features = null, bezel = null, xNode = null, yNode = null) {
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
  const cx = document.createElement("canvas"); cx.width = w; cx.height = h;
  const cy = document.createElement("canvas"); cy.width = w; cy.height = h;
  const ctxx = cx.getContext("2d"), ctxy = cy.getContext("2d");
  const imgx = ctxx ? ctxx.createImageData(w, h) : null, imgy = ctxy ? ctxy.createImageData(w, h) : null;
  const rad = Array.isArray(radius) ? radius : [radius, radius, radius, radius];
  const [rtl, rtr, rbr, rbl] = rad.map((v) => Math.max(0, Math.min(v || 0, w / 2, h / 2)));
  const o = open || { top: true, right: true, bottom: true, left: true };
  const feats = Array.isArray(features) ? features : [];
  // the bezel is the full BEZEL (56px) deep wherever the pane has room; a
  // pane shorter than two bezels (the fixtures: 35–90px) keeps the same
  // profile over half its short side, so the bend still fades to nothing
  // at the middle instead of two lenses overlapping across it
  // `bezel` (a fraction of the short side) narrows it further — the
  // fixtures' bezel is a thin band that fades out, never a thick visible
  // ring (owner, 19 Oct 2026: "it should be a gradient")
  // a number under 1 is a fraction of the short side, 1 or more is px
  const bez = Math.max(6, Math.min(BEZEL, Math.min(w, h) / 2, bezel ? (bezel < 1 ? Math.min(w, h) * bezel : bezel) : Infinity));
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
      const r = sy < 0 ? (sx < 0 ? rtl : rtr) : (sx < 0 ? rbl : rbr); // this quadrant's corner
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
      if (inside >= 0 && inside < bez) m = bendProfile(inside / bez) / (peak || 1);
      // the bezel's weight: 1 at the lip, easing to 0 a little past the bend
      let bw = Math.max(0, Math.min(1, 1 - inside / (bez * 1.35)));
      let vx = -nx * m, vy = -ny * m; // pull inward along -normal
      // the carved shapes: each pulls what lies near its outline TOWARDS the
      // outline, from both sides, so the backdrop stretches into the cut
      for (const f of feats) {
        const px = f.kind === "cut" ? f.x : f.kind === "slot" ? Math.max(f.x0, Math.min(f.x1, x + 0.5)) : f.cx;
        const py = f.kind === "cut" ? Math.max(f.y0, Math.min(f.y1, y + 0.5)) : f.cy;
        const ex = x + 0.5 - px, ey = y + 0.5 - py;
        const len = Math.hypot(ex, ey) || 1;
        const sd = f.kind === "cut" ? len : len - f.r; // signed distance to the outline
        const t = Math.abs(sd) / f.band;
        if (t >= 1) continue;
        // a carving's pull is a fraction of the bezel's: at the September pull
        // (80–92px at full strength) anything stronger tears the letters apart
        const g = (1 - t) * (1 - t) * Math.min(1, t / 0.12) * (f.gain || 0.22);
        const sgn = sd >= 0 ? 1 : -1;
        vx -= (ex / len) * sgn * g; vy -= (ey / len) * sgn * g;
        bw = Math.max(bw, 1 - t * 0.8);
      }
      vx = Math.max(-1, Math.min(1, vx)); vy = Math.max(-1, Math.min(1, vy));
      const i = (y * w + x) * 4;
      d[i] = Math.round(128 + vx * 127);
      d[i + 1] = Math.round(128 + vy * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
      if (imgx && imgy) {
        const gx = d[i], gy = d[i + 1];
        imgx.data[i] = gx; imgx.data[i + 1] = gx; imgx.data[i + 2] = gx; imgx.data[i + 3] = 255;
        imgy.data[i] = gy; imgy.data[i + 1] = gy; imgy.data[i + 2] = gy; imgy.data[i + 3] = 255;
      }
      const wt = Math.round(255 * bw * bw * (3 - 2 * bw)); // smoothstep, as a grey
      dw[i] = wt; dw[i + 1] = wt; dw[i + 2] = wt; dw[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxw.putImageData(imgw, 0, 0);
  node.setAttribute("href", c.toDataURL("image/png"));
  weightNode.setAttribute("href", cw.toDataURL("image/png"));
  if (xNode && yNode && imgx && imgy) {
    ctxx.putImageData(imgx, 0, 0); ctxy.putImageData(imgy, 0, 0);
    xNode.setAttribute("href", cx.toDataURL("image/png"));
    yNode.setAttribute("href", cy.toDataURL("image/png"));
  }
}


// The filter, once per pane (each pane needs its own id: its map is its own
// size). Render it near the pane; it is 0×0 and paints nothing itself.
// The pull at the edge, R / G / B: glass disperses (red bends least, blue
// most), and the owner wants that faint rainbow on every pane of it ("I
// still want slight rainbow on all the liquid glass", 26 Oct 2026). Slight:
// 84 / 86 / 88, a third of the old 80 / 86 / 92 spread, which (widened
// further by the popup's `prism`) parted the colours into a hard red line on
// one edge and a yellow-green one on the other ("the odd red bezel line",
// the same day). One spread for every pane but the fixtures (FIXTURE_PULL,
// below), no prism. The header runs at 1;
// the popups at 0.8.
export const PULL = [84, 86, 88];
// THE FIXTURES' RAINBOW (owner, 26 Oct 2026: "a little more rainbow on the
// fixtures"): the Masthead and the deck — the panes on the fixture bezel —
// split a little wider, 83 / 86 / 89: half the old 12, never the hard line.
export const FIXTURE_PULL = [83, 86, 89];
const pulls = (strength, spread = PULL) => spread.map((v) => (v * strength).toFixed(1));
export function LiquidGlassDefs({ id, mapRef, weightRef, xRef, yRef, strength = 1, spread = PULL }) {
  const [sr, sg, sb] = pulls(strength, spread);
  return (
    <svg className="glass-defs" aria-hidden="true" focusable="false">
    {/* THE OPTICS: the centre of the pane is CRYSTAL CLEAR (the backdrop
        untouched — the owner found any frost "oddly cloudy"); the
        bezel is a lens — the backdrop bent through the map, each
        colour a little differently (a faint fringe, 84 / 86 / 88), only
        lightly softened — blended with the clear backdrop by the weight
        picture, a grey that says how much of each pixel is bezel. That is
        Apple's clear glass: a refracting rim around an untouched middle. */}
    <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      {/* THE PULL, NEVER A COLOUR (see drawRefractionMap). Each direction is
          its own grey, and the bend runs as two passes — sideways, then up and
          down — so no coloured picture ever reaches a displacement: a colour
          pixel is colour-managed even inside the filter, and on a wide-gamut
          screen that leaked the up-and-down pull of the top and bottom lips
          into a sideways one (the owner's "it curves to the left", 19 Oct;
          measured with a grid under the deck). The direction a pass leaves
          alone reads the alpha channel, held at exactly one half. */}
      <feImage ref={xRef} preserveAspectRatio="none" result="lgx" />
      <feImage ref={yRef} preserveAspectRatio="none" result="lgy" />
      <feColorMatrix in="lgx" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.5" result="lgxa" />
      <feColorMatrix in="lgy" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.5" result="lgya" />
      <feImage ref={weightRef} preserveAspectRatio="none" result="lgw" />
      {/* the lens chain, data-lens: restrictLens() confines these to the
          edge band when only one edge is open (the strip), so the clear
          middle costs nothing; red bends least, blue most, by a little */}
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgxa" scale={sr} xChannelSelector="R" yChannelSelector="A" result="sxR" />
      <feDisplacementMap data-lens="1" in="sxR" in2="lgya" scale={sr} xChannelSelector="A" yChannelSelector="R" result="bentR" />
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgxa" scale={sg} xChannelSelector="R" yChannelSelector="A" result="sxG" />
      <feDisplacementMap data-lens="1" in="sxG" in2="lgya" scale={sg} xChannelSelector="A" yChannelSelector="R" result="bentG" />
      <feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgxa" scale={sb} xChannelSelector="R" yChannelSelector="A" result="sxB" />
      <feDisplacementMap data-lens="1" in="sxB" in2="lgya" scale={sb} xChannelSelector="A" yChannelSelector="R" result="bentB" />
      <feColorMatrix data-lens="1" in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
      <feColorMatrix data-lens="1" in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
      <feColorMatrix data-lens="1" in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
      <feComposite data-lens="1" in="chR" in2="chG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="chRG" />
      <feComposite data-lens="1" in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens" />
      {/* lens × weight + clear × (1 − weight): the weight picture read
          into COLOUR at full alpha, and its complement, so the blend is
          plain arithmetic — no alpha mask, nothing premultiplied to
          darken the band. */}
      <feColorMatrix in="lgw" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="w" />
      <feColorMatrix in="lgw" type="matrix" values="-1 0 0 0 1  -1 0 0 0 1  -1 0 0 0 1  0 0 0 0 1" result="iw" />
      <feComposite data-lens="1" in="lens" in2="w" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lensW" />
      <feComposite in="SourceGraphic" in2="iw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="frostW" />
      <feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    {/* the colour picture of the pull: off the filter's chain, kept for the page-side bend */}
    <image ref={mapRef} width="0" height="0" />
    </svg>
  );
}

// Confine the lens chain of a pane's filter to the band inside its one open
// edge (the strip: the bottom), in the pane's own pixels — the clear middle
// then costs nothing on every scroll frame. `band` null lifts it.
export function restrictLens(filterEl, band) {
  if (!filterEl) return;
  for (const n of filterEl.querySelectorAll("[data-lens]")) {
    if (!band) { n.removeAttribute("x"); n.removeAttribute("y"); n.removeAttribute("width"); n.removeAttribute("height"); continue; }
    n.setAttribute("x", "0");
    n.setAttribute("y", band.y.toFixed(1));
    n.setAttribute("width", band.width.toFixed(1));
    n.setAttribute("height", band.height.toFixed(1));
  }
}
// The band a strip's lens needs: the bezel plus its easing, at the bottom.
export function bottomBand(w, h) {
  const deep = Math.min(h, Math.ceil(BEZEL * 1.35) + 2);
  return { y: h - deep, width: w, height: deep };
}

// THE PAGE-SIDE BEND. Where there is no backdrop refraction — WebKit never
// runs an SVG filter as a backdrop-filter, and a Chromium without GPU
// compositing drops it too — the page itself is bent instead: every element
// matching `selector` that lies under one of the pane's OPEN edges gets its
// own SVG filter, the pane's map placed in that element's coordinates over a
// flat 128 grey, so what passes under the edge bends the way a backdrop
// would. Bounded: only the elements the edge crosses, each filtered within
// its own box; nothing on the rest of the page pays. place(rect) on every
// change of the pane or the scroll; dispose() takes it all back.
export function createPageBend({ id, el, selector, strength = 1, mapRef, open = null, spread = PULL }) {
  let svg = null;
  const bent = new Map(); // element -> filter node
  const o = open || { top: true, right: true, bottom: true, left: true };
  // How the map reaches the filter differs by engine, and each engine
  // renders only its own form. WebKit renders an element as NOTHING when its
  // CSS filter carries an feImage with a data (or file) href — "the words
  // delete themselves" on Safari, 8 Sep — but renders and bends when the
  // feImage points by id at an <image> ELEMENT in the svg that carries the
  // data URL (probed in Safari with eleven variants). Chromium is the
  // reverse: the element reference places nothing, the data href bends.
  const webkit = typeof navigator !== "undefined" && /Apple Computer/.test(navigator.vendor || "");
  const chain = (imgId) => {
    // the same slight spread as the panes, and ONLY under the pane: the
    // bend runs in the pane's own rectangle (data-pb: place() sets each
    // primitive's subregion to it) and the element passes through untouched
    // everywhere else. Outside a pane the map is a flat 128 grey, which is
    // not quite neutral (127.5 is): it shifts every pixel by ~0.17px, by a
    // different hair per colour once the pulls differ, and that drew a faint
    // red-and-cyan line down the whole border of every bent card (26 Oct 2026)
    const [sr, sg, sb] = pulls(strength, spread);
    return `<feFlood flood-color="rgb(128,128,128)" result="flat"/>` +
      (webkit ? `<feImage href="#${imgId}" result="pane"/>` : `<feImage preserveAspectRatio="none" result="pane"/>`) +
      `<feComposite in="pane" in2="flat" operator="over" result="map"/>` +
      `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sr}" xChannelSelector="R" yChannelSelector="G" result="bR"/>` +
      `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sg}" xChannelSelector="R" yChannelSelector="G" result="bG"/>` +
      `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${sb}" xChannelSelector="R" yChannelSelector="G" result="bB"/>` +
      `<feColorMatrix data-pb="1" in="bR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR"/>` +
      `<feColorMatrix data-pb="1" in="bG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG"/>` +
      `<feColorMatrix data-pb="1" in="bB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB"/>` +
      `<feComposite data-pb="1" in="cR" in2="cG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="cRG"/>` +
      `<feComposite data-pb="1" in="cRG" in2="cB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens"/>` +
      `<feComposite in="lens" in2="SourceGraphic" operator="over"/>`;
  };
  let serial = 0;
  const crosses = (b, r) => {
    const d = BEZEL * 1.35;
    if (o.bottom && b.bottom > r.bottom - d && b.top < r.bottom) return true;
    if (o.top && b.top < r.top + d && b.bottom > r.top) return true;
    if (o.left && b.left < r.left + d && b.right > r.left) return true;
    if (o.right && b.right > r.right - d && b.left < r.right) return true;
    return false;
  };
  // What lies under the open edges, found by SAMPLING the bands with
  // elementsFromPoint rather than measuring every candidate on the page:
  // a point every STEP px along each open edge's band, the hit resolved to
  // the OUTERMOST element matching the selector (a card, never the column
  // that holds it, never the title inside it — one filter per thing), and
  // nothing larger than BIG is ever filtered (the columns of the catalog
  // are 9,000px tall; filtering one of those every scroll frame was the
  // glitch and the lag of 8 Sep).
  // BIG_AREA (9 Sep): WebKit rasterises the WHOLE filtered element through
  // three displacement passes on every scroll frame, and the owner's Safari
  // lagged once the page's big panes could bend — a 720×520 pane is 375k
  // pixels a frame. Under 260k px² an element bends; over it, it passes
  // under the edge unbent (the upload station's panes, the passport
  // document) — the words and rows inside them still do.
  const STEP = 40, BIG = 1600, BIG_AREA = 260000;
  const outermost = (hit) => {
    let node = hit && hit.closest ? hit.closest(selector) : null;
    while (node) {
      const up = node.parentElement && node.parentElement.closest(selector);
      if (!up) break;
      node = up;
    }
    return node;
  };
  const sample = (r) => {
    const found = new Set();
    const d = BEZEL * 1.35;
    const rows = [];
    if (o.bottom) rows.push([r.left, r.right, r.bottom - d * 0.5, "x"], [r.left, r.right, r.bottom - 3, "x"]);
    if (o.top) rows.push([r.left, r.right, r.top + d * 0.5, "x"], [r.left, r.right, r.top + 3, "x"]);
    if (o.left) rows.push([r.top, r.bottom, r.left + d * 0.5, "y"], [r.top, r.bottom, r.left + 3, "y"]);
    if (o.right) rows.push([r.top, r.bottom, r.right - d * 0.5, "y"], [r.top, r.bottom, r.right - 3, "y"]);
    const W = window.innerWidth, H = window.innerHeight;
    for (const [a, b, c, axis] of rows) {
      for (let t = a + STEP / 2; t < b; t += STEP) {
        const x = axis === "x" ? t : c, y = axis === "x" ? c : t;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        for (const hit of document.elementsFromPoint(x, y)) {
          if (el.contains(hit)) continue;
          const node = outermost(hit);
          if (node && !el.contains(node)) found.add(node);
        }
      }
    }
    return found;
  };
  const place = (r) => {
    const href = mapRef.current && mapRef.current.getAttribute("href");
    if (!href) return;
    if (!svg) {
      svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("class", "glass-defs");
      svg.setAttribute("aria-hidden", "true");
      document.body.appendChild(svg);
    }
    const under = new Set();
    for (const node of sample(r)) {
      const b = node.getBoundingClientRect();
      if (b.width === 0 || b.width > BIG || b.height > BIG || b.width * b.height > BIG_AREA) continue;
      if (!crosses(b, r)) continue;
      under.add(node);
      let f = bent.get(node);
      if (!f) {
        const n = serial++;
        let img = null;
        if (webkit) {
          img = document.createElementNS(SVG, "image");
          img.setAttribute("id", `${id}-m${n}`);
          img.setAttribute("preserveAspectRatio", "none");
          svg.appendChild(img);
        }
        f = document.createElementNS(SVG, "filter");
        f.setAttribute("id", `${id}-b${n}`);
        f.setAttribute("color-interpolation-filters", "sRGB");
        f.setAttribute("primitiveUnits", "userSpaceOnUse");
        f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", "100%"); f.setAttribute("height", "100%");
        f.innerHTML = chain(img ? img.getAttribute("id") : "");
        // the picture that carries the map: the <image> element (WebKit) or
        // the feImage itself (everything else) — both take x/y/width/height
        f.__img = img || f.querySelector("feImage");
        svg.appendChild(f);
        bent.set(node, f);
        node.style.filter = `url(#${f.getAttribute("id")})`;
      }
      const img = f.__img;
      if (img.getAttribute("href") !== href) img.setAttribute("href", href);
      const px = (r.left - b.left).toFixed(1), py = (r.top - b.top).toFixed(1), pw = r.width.toFixed(1), ph = r.height.toFixed(1);
      img.setAttribute("x", px);
      img.setAttribute("y", py);
      img.setAttribute("width", pw);
      img.setAttribute("height", ph);
      // the bend and its split stay inside the pane's rectangle (see chain)
      for (const n of f.querySelectorAll("[data-pb]")) { n.setAttribute("x", px); n.setAttribute("y", py); n.setAttribute("width", pw); n.setAttribute("height", ph); }
    }
    for (const [node, f] of bent) {
      if (under.has(node)) continue;
      node.style.removeProperty("filter"); if (f.__img !== f.querySelector("feImage")) f.__img.remove(); f.remove(); bent.delete(node);
    }
  };
  const dispose = () => {
    for (const [node] of bent) node.style.removeProperty("filter");
    bent.clear();
    if (svg) { svg.remove(); svg = null; }
  };
  return { place, dispose };
}

// Keep an element's refraction map in step with its size, mark it
// data-refract="1" with --lg-filter pointing at its filter where the engine
// bends backdrops (see canRefract) or bend the page under it where it does
// not (createPageBend), and carry the pointer's shine (--gx/--gy/--gs).
// `open` names the edges that lens (default all four; the header passes the
// edges flush with the viewport as closed). Returns the defs to render.
// `strength` scales the pull (the popups run at 0.5 of the header).
// `bend` is a selector: WHERE THERE IS NO BACKDROP REFRACTION (WebKit —
// Safari never runs an SVG filter as a backdrop-filter) the page itself is
// bent instead: every element matching `bend` that lies under the pane's
// edge gets its own SVG filter — the pane's map placed in that element's
// coordinates over a flat 128 grey — so what is under the edge bends the
// way a backdrop would. Bounded: only the elements under the pane, each
// filtered within its own box; nothing on the rest of the page pays.
// The shapes carved into a pane, read from the DOM: every descendant marked
// data-lens-shape — "cut" (a vertical groove: its centre line), "ring" (a
// circle: the element's box), "slot" (a stadium: the element's box) — in the
// pane's own pixels. data-lens-band widens or narrows the bend around it.
export function lensFeatures(el) {
  const box = el.getBoundingClientRect();
  const out = [];
  for (const n of el.querySelectorAll("[data-lens-shape]")) {
    const b = n.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const kind = n.getAttribute("data-lens-shape");
    const band = parseFloat(n.getAttribute("data-lens-band")) || 10;
    const gain = parseFloat(n.getAttribute("data-lens-gain")) || undefined; // how hard it pulls (a cut barely does)
    const l = b.left - box.left, t = b.top - box.top;
    if (kind === "cut") out.push({ kind, x: l + b.width / 2, y0: t, y1: t + b.height, band, gain });
    else if (kind === "ring") out.push({ kind, cx: l + b.width / 2, cy: t + b.height / 2, r: b.width / 2, band, gain });
    else if (kind === "slot") { const r = b.height / 2; out.push({ kind, x0: l + r, x1: l + b.width - r, cy: t + r, r, band, gain }); }
  }
  return out;
}

// `shine` false: the pane does not answer the pointer (the fixtures, 19 Oct 2026)
//
// THE RAINBOW FILM (owner, 26 Oct 2026: "where's the rainbow"). The colour
// split of the bend is kept slight — wide enough to show, it parts into the
// red line on one edge and the yellow-green on the other the owner called a
// red bezel — so the rainbow that reads is a film INSIDE the pane: light
// through glass, a soft iridescent sweep (globals.css .lgfilm), faded to
// nothing well before the rim. Every pane of the glass gets it with its
// filter: the hook renders the film beside the defs.
export function useLiquidGlass(elRef, { id, active = true, open = null, strength = 1, bend = null, bezel = null, shine = true } = {}) {
  const mapRef = useRef(null);
  const weightRef = useRef(null);
  const xRef = useRef(null);
  const yRef = useRef(null);
  useEffect(() => {
    const el = elRef.current;
    if (!active || !el) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const refract = canRefract();
    const pageBend = !refract && bend ? createPageBend({ id, el, selector: bend, strength, mapRef, open, spread: bezel === "fixture" ? FIXTURE_PULL : PULL }) : null;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (mapRef.current && weightRef.current && r.width > 0 && r.height > 0) {
        const cs = getComputedStyle(el);
        const radius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => parseFloat(v) || 0);
        drawRefractionMap(mapRef.current, weightRef.current, Math.round(r.width), Math.round(r.height), radius, open, lensFeatures(el), bezel === "fixture" ? fixtureBezel() : bezel, xRef.current, yRef.current);
        if (refract) {
          el.style.setProperty("--lg-filter", `url(#${id})`);
          el.dataset.refract = "1";
        } else if (pageBend) {
          pageBend.place(r);
        }
      }
    };
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(fit); });
    ro.observe(el);
    fit();
    // the page can still scroll under the pane on a phone: re-place the bend
    // — on alternate frames (9 Sep, the owner's Safari lag): the map trails
    // the edge by at most one frame, and WebKit re-rasterises half as often
    let skip = false;
    const onScroll = () => { if (!pageBend || raf) return; skip = !skip; if (!skip) raf = requestAnimationFrame(fit); };
    if (pageBend) window.addEventListener("scroll", onScroll, { passive: true });
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${((e.clientX - r.left) / Math.max(1, r.width)) * 100}%`);
      el.style.setProperty("--gy", `${((e.clientY - r.top) / Math.max(1, r.height)) * 100}%`);
      el.style.setProperty("--gs", "1");
    };
    const onLeave = () => el.style.setProperty("--gs", "0");
    if (!still && shine) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (pageBend) pageBend.dispose();
    };
  }, [elRef, id, active, open, strength, bend, bezel, shine]);
  return (
    <>
      <LiquidGlassDefs id={id} mapRef={mapRef} weightRef={weightRef} xRef={xRef} yRef={yRef} strength={strength} spread={bezel === "fixture" ? FIXTURE_PULL : PULL} />
      <i className="lgfilm" aria-hidden="true" />
    </>
  );
}

// ---- THE REACTIVE RAINBOW (owner, 18 Oct 2026: "the liquid glass isn't
// liquid enough — I want the OG reactive rainbow liquid glass you made for
// ASILUM"). The 8 Sep glass answered the hand: its bezel bent what passed
// beneath it, the pointer's shine slid across it and the lit word's lamp
// glided under it. This restores that answer on the V.2 fixtures, the deck
// and every popup: ONE listener set for the whole app (the pointer, the
// phone's tilt where the device shares it, the scroll), ONE rAF write per
// frame, and the writes are custom properties on the few glass elements
// themselves (`.lgrx`), never on <html> — a property set on the root
// re-styles the whole document every frame; on four small elements it
// re-styles four small subtrees. Nothing here reads layout: the pointer is
// read from the event, the tilt from the sensor, the scroll from scrollY.
//
//   --iris-a   the angle the rainbow rim's conic starts from: it turns
//              towards the pointer, leans with the phone and rolls with
//              the scroll, so the colours travel round the edge
//   --iris-x/y where the conic is centred: the light's position, from
//              the pointer or the tilt (a percentage of the element)
//   --tilt-x/y -1..1, the lean the sheen and the rim read
//
// The phone's tilt needs no prompt here: Android shares it; iOS shares it
// only once the passenger granted motion in a tap (askTilt in FloatView.jsx,
// the photograph that floats) — until then the pointer and the scroll drive
// it alone. prefers-reduced-motion: nothing listens, the rim stays still.
export const GLASS_REACTIVE = ".lgrx";
// THE FIXTURES' BEZEL, ONE WIDTH (owner, 19 Oct 2026: "the refraction bezel
// on the info dock and the passport button should match the central
// control"): 26% of the deck's 175-unit height, in px at this width — the
// same --u as globals.css (clamp(0.4px, 0.1vw, 0.5px)), so the Info Dock
// and the globe bend over the same band the deck does (each still capped
// at half its own height, which the 88-unit top fixtures barely reach).
export const FIXTURE_BEZEL_UNITS = 175 * 0.26;
export function fixtureBezel() {
  const u = Math.min(0.5, Math.max(0.4, (typeof window === "undefined" ? 1000 : window.innerWidth) * 0.001));
  return u * FIXTURE_BEZEL_UNITS;
}
// What bends under a fixture's edges where the engine cannot bend a backdrop
// (WebKit: Safari, every iPhone browser) — the September header's list, cut
// to what scrolls under the V.2 fixtures: the cards, the masthead's lines.
export const FIXTURE_BEND = ".card, .headline, .headsub, .deck, .demobanner, .adstrip, .ctmeta";
export function useGlassReactive() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const s = { px: 0.5, py: 0.25, tx: 0, ty: 0, base: null, gyro: false, scroll: 0, raf: 0, a: 200, ta: 200 };
    const W = () => window.innerWidth || 1, H = () => window.innerHeight || 1;
    const tick = () => {
      s.raf = 0;
      // the angle: towards the pointer from the middle of the screen, plus the
      // lean and the scroll, eased so the colours flow rather than jump
      const toward = (Math.atan2(s.py - 0.5, s.px - 0.5) * 180) / Math.PI;
      s.ta = 200 + toward * 0.6 + s.tx * 40 + s.scroll * 0.18;
      s.a += (s.ta - s.a) * 0.18;
      const ix = (50 + (s.px - 0.5) * 70 + s.tx * 30).toFixed(1) + "%";
      const iy = (50 + (s.py - 0.5) * 70 + s.ty * 30).toFixed(1) + "%";
      const a = s.a.toFixed(1) + "deg";
      for (const el of document.querySelectorAll(GLASS_REACTIVE)) {
        el.style.setProperty("--iris-a", a);
        el.style.setProperty("--iris-x", ix);
        el.style.setProperty("--iris-y", iy);
        el.style.setProperty("--tilt-x", s.tx.toFixed(3));
        el.style.setProperty("--tilt-y", s.ty.toFixed(3));
      }
      if (Math.abs(s.ta - s.a) > 0.2) s.raf = requestAnimationFrame(tick);
    };
    const wake = () => { if (!s.raf) s.raf = requestAnimationFrame(tick); };
    const onMove = (e) => { if (s.gyro) return; s.px = e.clientX / W(); s.py = e.clientY / H(); s.tx = (s.px - 0.5) * 2; s.ty = (s.py - 0.5) * 2; wake(); };
    const onScroll = () => { s.scroll = window.scrollY || 0; wake(); };
    const onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!s.base) s.base = { b: e.beta, g: e.gamma };
      s.gyro = true;
      s.tx = Math.max(-1, Math.min(1, (e.gamma - s.base.g) / 25));
      s.ty = Math.max(-1, Math.min(1, (e.beta - s.base.b) / 25));
      s.px = 0.5 + s.tx * 0.5; s.py = 0.5 + s.ty * 0.5;
      wake();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("deviceorientation", onOrient);
    wake();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onOrient);
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, []);
}

// ---- THE LAMP UNDER THE WATER (the September header, owner, 8 Sep 2026;
// carried onto the V.2 fixtures 19 Oct 2026). A .glass-light layer kept to
// the pane's rect, one level BELOW it (a sibling on <body>, so the pane's
// backdrop sees it), carrying the current key's coloured glow
// (--cx/--cy/--cs). The pane bends that light: a glow stick in water.
// THE GLASS DOES NOT ANSWER THE POINTER (owner, 19 Oct 2026: "there doesn't
// have to be surface hover reactions on the liquid glass — take that out"):
// no hovered-key lamp, no pointer trace, no meniscus dome. Nothing
// re-renders: CSS variables only.
export function useGlassLamps(elRef, { active = true, current = ".cur" } = {}) {
  useEffect(() => {
    const el = elRef.current;
    if (!active || !el || typeof document === "undefined") return undefined;
    const light = document.createElement("div");
    light.className = "glass-light";
    light.setAttribute("aria-hidden", "true");
    document.body.appendChild(light);
    const centreOf = (node) => {
      const r = el.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      return {
        x: `${((b.left + b.width / 2 - r.left) / Math.max(1, r.width)) * 100}%`,
        y: `${((b.top + b.height / 2 - r.top) / Math.max(1, r.height)) * 100}%`,
      };
    };
    // the lamp layer follows the pane; the current key's lamp follows the current key
    const placeCurrent = () => {
      const cur = el.matches(current) ? el : el.querySelector(current); // the globe is its own key
      if (!cur) { light.style.setProperty("--cs", "0"); return; }
      const c = centreOf(cur);
      light.style.setProperty("--cx", c.x);
      light.style.setProperty("--cy", c.y);
      light.style.setProperty("--cs", "1");
    };
    let raf = 0;
    const fit = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      light.style.top = `${r.top}px`;
      light.style.left = `${r.left}px`;
      light.style.width = `${r.width}px`;
      light.style.height = `${r.height}px`;
      light.style.borderRadius = getComputedStyle(el).borderRadius;
      light.style.opacity = getComputedStyle(el).opacity;
      placeCurrent();
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(fit); };
    const ro = new ResizeObserver(wake);
    ro.observe(el);
    const mo = new MutationObserver(wake); // a key turning current, a popup shrinking the fixture
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["class", "aria-current", "aria-pressed"] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-popup", "data-media", "data-dm"] });
    window.addEventListener("resize", wake);
    el.addEventListener("transitionend", wake);
    fit();
    return () => {
      ro.disconnect(); mo.disconnect();
      window.removeEventListener("resize", wake);
      el.removeEventListener("transitionend", wake);
      if (raf) cancelAnimationFrame(raf);
      light.remove();
    };
  }, [elRef, active, current]);
}
