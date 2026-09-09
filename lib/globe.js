// lib/globe.js — THE PURCHASE GLOBE's renderer (client-safe, no imports).
//
// A wireframe earth drawn entirely from characters on a 2D canvas: latitude
// rings and meridians as ASCII lines whose glyph follows the line's slope
// (- / | \), the far hemisphere dimmed so the sphere reads as a see-through
// cage, a dotted silhouette, a faint polar axis, a centre reticle — the GPS
// globe of a 1998 Codec screen, the owner's reference — with a marker at
// every city handed to setPlaces(). Drag to spin, inertia on release, the
// arrow keys turn it; the hologram treatment (scanline banding, a flutter)
// is the ASTERISK dock's, so the two forms are one family.
//
// Pure canvas so it can be judged outside React: app/components/
// PurchaseGlobe.jsx wraps it; a harness page can mount it with any list of
// cities. Colours arrive through `tokens()` (the caller reads the CSS
// custom properties — nothing is hardcoded here).
//
// createGlobe(canvas, { tokens, reducedMotion, onFront }) →
//   { setPlaces, refreshTokens, fit, draw, start, stop, dispose }
//   tokens(): { sig, red, ink, font }   onFront(place | null): the marker
//   nearest the viewer changed (the readout names it).

const D2R = Math.PI / 180;

// A city → a point on the unit sphere. Longitude 0 faces the viewer at rest.
export function onSphere(lat, lon) {
  const p = lat * D2R, l = lon * D2R;
  return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) };
}

// Degrees → the Codec readout's D.MM.SS form ("35.39.17").
export function dms(v) {
  const a = Math.abs(v);
  const d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60);
  return `${d}.${String(m).padStart(2, "0")}.${String(s).padStart(2, "0")}`;
}

// The cage: rings of latitude every 22.5° and twelve meridians, each line
// a CHAIN of glyphs set close enough to touch (a glyph every ~0.75 of its
// own size along the great circle) so the characters read as lines, the
// way the Codec's did — not a field of dots. Each point carries its
// tangent so the glyph matches the line it sits on. Sizes are relative to
// the canvas (font = 0.032 W, radius = 0.36 W), so the chain length in
// glyphs is fixed: 2π · (0.36 / 0.032) / 0.75 ≈ 94 around the equator.
const CHAIN = 94;
function buildCage() {
  const cage = [];
  for (let lat = -67.5; lat <= 67.5; lat += 22.5) {
    const p = lat * D2R, r = Math.cos(p), y = Math.sin(p);
    const n = Math.max(12, Math.round(CHAIN * r));
    for (let j = 0; j < n; j++) {
      const th = (j / n) * Math.PI * 2;
      cage.push({
        x: Math.sin(th) * r, y, z: Math.cos(th) * r,
        tx: Math.cos(th) * r, ty: 0, tz: -Math.sin(th) * r,
        w: lat === 0 ? 1 : 0.62, // the equator reads a little stronger
      });
    }
  }
  for (let m = 0; m < 6; m++) {
    const lam = (m / 6) * Math.PI; // 6 half-planes = 12 meridians
    for (let j = 0; j < CHAIN; j++) {
      const phi = (j / CHAIN) * Math.PI * 2;
      cage.push({
        x: Math.sin(lam) * Math.sin(phi), y: Math.cos(phi), z: Math.cos(lam) * Math.sin(phi),
        tx: Math.sin(lam) * Math.cos(phi), ty: -Math.sin(phi), tz: Math.cos(lam) * Math.cos(phi),
        w: m === 0 ? 0.9 : 0.62,
      });
    }
  }
  return cage;
}

// yaw about the vertical axis, then pitch about the screen's horizontal
function rot(p, sy, cy, sp, cp) {
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return [x1, y1, z2];
}

// the glyph follows the projected slope of the line at this point
// (dx, dy in maths orientation: y up)
export function glyphFor(dx, dy) {
  const a = Math.atan2(dy, dx);
  const s = ((a % Math.PI) + Math.PI) % Math.PI; // 0..π
  if (s < Math.PI / 8 || s > (7 * Math.PI) / 8) return "-";
  if (s < (3 * Math.PI) / 8) return "/";
  if (s < (5 * Math.PI) / 8) return "|";
  return "\\";
}

export function createGlobe(canvas, { tokens, reducedMotion = false, onFront = null } = {}) {
  const cv = canvas;
  const x = cv.getContext("2d");
  const cage = buildCage();
  let T = tokens ? tokens() : { sig: "#46ff96", red: "#ff3838", ink: "#d4ffe8", font: "monospace" };
  let places = [];
  let yaw = 0.35, pitch = -0.32, vyaw = 0.004, vpitch = 0;
  let dragging = false, lastX = 0, lastY = 0, hover = 0, raf = 0, t = 0, paused = true, disposed = false;
  let frontCity = null;

  const draw = () => {
    if (!x || disposed) return;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W * 0.36;
    x.clearRect(0, 0, W, H);
    const flick = reducedMotion ? 1 : 0.84 + 0.16 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9));
    const sy = Math.sin(yaw), cyw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const fs = Math.max(7, W * 0.032);
    x.font = `${fs}px ${T.font}`;
    x.textAlign = "center";
    x.textBaseline = "middle";

    // the silhouette: a dotted rim where the sphere ends
    x.save();
    x.fillStyle = T.sig;
    x.globalAlpha = 0.28 * flick;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      x.fillText("·", cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02);
    }
    x.restore();

    // the cage: far side first, dim; near side over it, bright
    const pts = [];
    for (const p of cage) {
      const [X, Y, Z] = rot(p, sy, cyw, sp, cp);
      const [TX, TY] = rot({ x: p.tx, y: p.ty, z: p.tz }, sy, cyw, sp, cp);
      pts.push([cx + X * R, cy - Y * R, Z, glyphFor(TX, TY), p.w]);
    }
    pts.sort((a, b) => a[2] - b[2]);
    x.save();
    x.fillStyle = T.sig;
    for (const [px, py, z, g, w] of pts) {
      const near = z >= 0;
      const depth = near ? 0.5 + z * 0.5 : 0.18 + (z + 1) * 0.08;
      x.globalAlpha = Math.min(1, depth * w * (near ? 1 : 0.75)) * flick;
      if (near) { x.shadowColor = T.sig; x.shadowBlur = W * 0.012 * z; } else { x.shadowBlur = 0; }
      x.fillText(g, px, py);
    }
    x.restore();

    // the axis, faint, through the poles
    const [, nY] = rot({ x: 0, y: 1, z: 0 }, sy, cyw, sp, cp);
    x.save();
    x.strokeStyle = T.sig;
    x.globalAlpha = 0.16 * flick;
    x.lineWidth = 1;
    x.setLineDash([2, 5]);
    x.beginPath();
    x.moveTo(cx, cy - nY * R * 1.16);
    x.lineTo(cx, cy + nY * R * 1.16);
    x.stroke();
    x.restore();

    // the centre reticle (the Codec's): a small ring and a pointer
    x.save();
    x.strokeStyle = T.sig;
    x.fillStyle = T.sig;
    x.globalAlpha = (0.55 + hover * 0.2) * flick;
    x.lineWidth = Math.max(1, W * 0.004);
    x.beginPath();
    x.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
    x.stroke();
    x.font = `${fs * 1.1}px ${T.font}`;
    x.fillText("▸", cx + fs * 0.1, cy + fs * 0.05);
    x.restore();

    // the markers: every city a piece came from — near side bright and red
    // (the record's accent), far side a dim outline seen through the cage
    const marks = [];
    for (const pl of places) {
      const [X, Y, Z] = rot(onSphere(pl.lat, pl.lon), sy, cyw, sp, cp);
      marks.push({ pl, px: cx + X * R, py: cy - Y * R, z: Z });
    }
    marks.sort((a, b) => a.z - b.z);
    let best = null;
    x.save();
    x.font = `${fs * 1.35}px ${T.font}`;
    for (const m of marks) {
      const near = m.z >= 0;
      const big = Math.min(3, m.pl.count || 1);
      x.fillStyle = T.red;
      if (near) {
        x.shadowColor = T.red;
        x.shadowBlur = W * (0.014 + 0.006 * big);
        x.globalAlpha = (0.85 + 0.15 * m.z) * flick;
        x.fillText(big > 1 ? "◉" : "●", m.px, m.py);
        if (!best || m.z > best.z) best = m;
      } else {
        x.shadowBlur = 0;
        x.globalAlpha = 0.22 * flick;
        x.fillText("○", m.px, m.py);
      }
    }
    // the front-most city is named beside its marker, the way the Codec
    // pins a label to the fix it is reading
    if (best) {
      const lx = best.px + fs * 1.2, ly = best.py - fs * 0.9;
      x.strokeStyle = T.sig;
      x.globalAlpha = 0.5 * flick;
      x.lineWidth = 1;
      x.shadowBlur = 0;
      x.beginPath();
      x.moveTo(best.px + fs * 0.5, best.py - fs * 0.3);
      x.lineTo(lx - 2, ly + fs * 0.35);
      x.stroke();
      x.textAlign = "left";
      x.font = `${fs * 1.05}px ${T.font}`;
      x.fillStyle = T.ink;
      x.shadowColor = T.sig;
      x.shadowBlur = W * 0.01;
      x.globalAlpha = 0.95 * flick;
      x.fillText(String(best.pl.city || "").toUpperCase(), lx, ly);
      x.font = `${fs * 0.85}px ${T.font}`;
      x.fillStyle = T.sig;
      const n = best.pl.count || 1;
      x.fillText(`${n} PIECE${n === 1 ? "" : "S"}`, lx, ly + fs * 1.05);
    }
    x.restore();
    const city = best ? best.pl.city : null;
    if (city !== frontCity) {
      frontCity = city;
      if (onFront) onFront(best ? best.pl : null);
    }

    // ---- hologram treatment: scanline banding, nothing else ----
    x.globalCompositeOperation = "destination-out";
    x.fillStyle = "rgba(0,0,0,0.3)";
    for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 1.5);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
  };

  const frame = () => {
    raf = 0;
    if (paused || disposed) return;
    t += 0.014;
    if (!dragging) {
      yaw += vyaw;
      pitch += vpitch;
      vyaw += (0.004 - vyaw) * 0.01; // inertia settles back to the idle drift
      vpitch *= 0.95;
      pitch = Math.max(-1.25, Math.min(1.25, pitch));
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    paused = false;
    if (reducedMotion) { draw(); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const stop = () => { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  // ---- interaction: drag to spin, inertia on release; the keys turn it ----
  const down = (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    const k = 1 / (cv.getBoundingClientRect().width || 1);
    vyaw = (e.clientX - lastX) * k * 4 * 0.06;
    vpitch = (e.clientY - lastY) * k * 4 * 0.06;
    yaw += (e.clientX - lastX) * k * 4;
    pitch = Math.max(-1.25, Math.min(1.25, pitch + (e.clientY - lastY) * k * 4));
    lastX = e.clientX; lastY = e.clientY;
    if (reducedMotion) draw();
  };
  const up = () => { dragging = false; };
  const enter = () => { hover = 1; };
  const leave = () => { hover = 0; };
  const key = (e) => {
    const step = 0.12;
    if (e.key === "ArrowLeft") { yaw -= step; vyaw = 0; }
    else if (e.key === "ArrowRight") { yaw += step; vyaw = 0; }
    else if (e.key === "ArrowUp") { pitch = Math.max(-1.25, pitch - step); }
    else if (e.key === "ArrowDown") { pitch = Math.min(1.25, pitch + step); }
    else return;
    e.preventDefault();
    if (reducedMotion) draw();
  };
  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerenter", enter);
  cv.addEventListener("pointerleave", leave);
  cv.addEventListener("keydown", key);

  // the canvas is sized by CSS; its bitmap follows at 2× so the glyphs stay crisp
  const fit = () => {
    const w = Math.max(1, Math.round((cv.getBoundingClientRect().width || cv.width / 2 || 250) * 2));
    if (cv.width !== w) { cv.width = w; cv.height = w; if (reducedMotion || paused) draw(); }
  };

  return {
    setPlaces(list) { places = Array.isArray(list) ? list : []; if (reducedMotion || paused) draw(); },
    refreshTokens() { if (tokens) T = tokens(); if (reducedMotion || paused) draw(); },
    setYaw(v) { yaw = v; vyaw = 0; if (reducedMotion || paused) draw(); },
    fit, draw, start, stop,
    dispose() {
      disposed = true;
      stop();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerenter", enter);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("keydown", key);
    },
  };
}
