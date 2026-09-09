// lib/globe.js — THE PURCHASE GLOBE's renderer (client-safe, no imports).
//
// A wireframe earth as a HOLOGRAM OF GLOWING LINES on a 2D canvas (owner,
// 9 Sep: "get rid of the ASCII structure … make the globe look like a
// Star Wars hologram made of glowing lines"): latitude rings and meridians
// are stroked polylines — each line a pale hot core inside a soft bloom of
// the signal colour — the far hemisphere dimmed so the sphere reads as a
// see-through cage, a faint rim, a faint polar axis, the Codec's centre
// reticle drawn as a ring and a pointer. The hologram treatment is the
// projector's: a flutter, a slow band of light rolling down the image,
// the odd horizontal tear where a slice of the picture slips sideways for
// a frame, and the dock's scanline banding. Markers sit at every city
// handed to setPlaces(). Drag to spin, inertia on release, the arrow keys
// turn it.
//
// No canvas shadowBlur anywhere (trap 158: a shadow per glyph cost /upload
// 37ms a frame). The glow is three stroke passes per depth bucket — wide
// and faint, mid, then the core — a dozen batched paths a frame in all.
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

// The cage: rings of latitude every 22.5° and twelve meridians, each a
// closed polyline of SEG samples on the unit sphere. Every sample carries
// the line's weight (the equator and the prime meridian read a little
// stronger). The samples are projected per frame and stroked as segments
// bucketed by depth, so a line fades as it turns away.
const SEG = 96;
function buildCage() {
  const lines = [];
  for (let lat = -67.5; lat <= 67.5; lat += 22.5) {
    const p = lat * D2R, r = Math.cos(p), y = Math.sin(p);
    const pts = [];
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      pts.push({ x: Math.sin(th) * r, y, z: Math.cos(th) * r });
    }
    lines.push({ pts, w: lat === 0 ? 1 : 0.62 });
  }
  for (let m = 0; m < 6; m++) {
    const lam = (m / 6) * Math.PI; // 6 great circles = 12 meridians
    const pts = [];
    for (let j = 0; j < SEG; j++) {
      const phi = (j / SEG) * Math.PI * 2;
      pts.push({ x: Math.sin(lam) * Math.sin(phi), y: Math.cos(phi), z: Math.cos(lam) * Math.sin(phi) });
    }
    lines.push({ pts, w: m === 0 ? 0.9 : 0.62 });
  }
  return lines;
}

// yaw about the vertical axis, then pitch about the screen's horizontal
function rot(p, sy, cy, sp, cp) {
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return [x1, y1, z2];
}

// Depth buckets: a segment's mean z picks its alpha. Far side first, dim,
// so the near side draws over it bright — the see-through cage.
const BUCKETS = [
  { lo: -1.01, hi: -0.5, a: 0.13 },
  { lo: -0.5, hi: 0, a: 0.2 },
  { lo: 0, hi: 0.3, a: 0.42 },
  { lo: 0.3, hi: 0.6, a: 0.62 },
  { lo: 0.6, hi: 0.85, a: 0.82 },
  { lo: 0.85, hi: 1.01, a: 1 },
];

// Hologram timing: a rolling band of light every ROLL_S seconds; a tear
// (a slice of the picture slipping sideways) roughly every TEAR_S, held
// for TEAR_HOLD seconds; a brightness dropout riding the same clock.
const ROLL_S = 3.6;
const TEAR_S = 2.8;
const TEAR_HOLD = 0.12;

export function createGlobe(canvas, { tokens, reducedMotion = false, onFront = null } = {}) {
  const cv = canvas;
  const x = cv.getContext("2d");
  const cage = buildCage();
  let T = tokens ? tokens() : { sig: "#46ff96", red: "#ff3838", ink: "#d4ffe8", font: "monospace" };
  let places = [];
  let yaw = 0.35, pitch = -0.32, vyaw = 0.004, vpitch = 0;
  let dragging = false, lastX = 0, lastY = 0, hover = 0, raf = 0, t = 0, paused = true, disposed = false;
  let frontCity = null;
  // the tears are seeded per glitch so the slices sit somewhere new each time
  let tearSeed = 0, tearAt = -1;

  // three passes per bucket — bloom, mid, core — from one path
  const strokeGlow = (alpha, lw, core) => {
    x.strokeStyle = T.sig;
    x.globalAlpha = alpha * 0.16;
    x.lineWidth = lw * 6;
    x.stroke();
    x.globalAlpha = alpha * 0.34;
    x.lineWidth = lw * 2.4;
    x.stroke();
    x.strokeStyle = core;
    x.globalAlpha = alpha;
    x.lineWidth = lw;
    x.stroke();
  };

  const draw = () => {
    if (!x || disposed) return;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W * 0.36;
    x.clearRect(0, 0, W, H);
    // the flutter, plus a short dropout as a tear passes
    const tearing = !reducedMotion && (t % TEAR_S) < TEAR_HOLD;
    const flick = reducedMotion ? 1
      : (0.86 + 0.14 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9))) * (tearing ? 0.72 : 1);
    const sy = Math.sin(yaw), cyw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const fs = Math.max(7, W * 0.032);
    const lw = Math.max(1, W * 0.0028);
    x.lineCap = "round";
    x.lineJoin = "round";
    x.font = `${fs}px ${T.font}`;
    x.textAlign = "center";
    x.textBaseline = "middle";

    // the rim: a faint ring where the sphere ends
    x.save();
    x.beginPath();
    x.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
    strokeGlow(0.3 * flick, lw * 0.8, T.sig);
    x.restore();

    // the cage: every line's samples projected, then each segment binned by
    // its mean depth; one path per bucket, far to near, three strokes each
    const bins = BUCKETS.map(() => []);
    for (const line of cage) {
      const n = line.pts.length;
      const proj = new Array(n);
      for (let i = 0; i < n; i++) {
        const [X, Y, Z] = rot(line.pts[i], sy, cyw, sp, cp);
        proj[i] = [cx + X * R, cy - Y * R, Z];
      }
      for (let i = 0; i < n; i++) {
        const a = proj[i], b = proj[(i + 1) % n];
        const z = (a[2] + b[2]) / 2;
        let k = 0;
        while (k < BUCKETS.length - 1 && z >= BUCKETS[k].hi) k++;
        bins[k].push(a[0], a[1], b[0], b[1], line.w);
      }
    }
    x.save();
    for (let k = 0; k < BUCKETS.length; k++) {
      const seg = bins[k];
      if (!seg.length) continue;
      // the weight splits a bucket into two paths at most (0.62 / strong)
      for (const wt of [0.62, 1]) {
        x.beginPath();
        let any = false;
        for (let i = 0; i < seg.length; i += 5) {
          const strong = seg[i + 4] > 0.62;
          if ((wt === 1) !== strong) continue;
          x.moveTo(seg[i], seg[i + 1]);
          x.lineTo(seg[i + 2], seg[i + 3]);
          any = true;
        }
        if (!any) continue;
        const near = k >= 2;
        const alpha = Math.min(1, BUCKETS[k].a * (wt === 1 ? 1 : 0.8)) * flick;
        strokeGlow(alpha, lw * (wt === 1 ? 1.15 : 0.9), near ? T.ink : T.sig);
      }
    }
    x.restore();

    // the axis, faint, through the poles
    const [, nY] = rot({ x: 0, y: 1, z: 0 }, sy, cyw, sp, cp);
    x.save();
    x.strokeStyle = T.sig;
    x.globalAlpha = 0.18 * flick;
    x.lineWidth = lw * 0.8;
    x.setLineDash([2, 5]);
    x.beginPath();
    x.moveTo(cx, cy - nY * R * 1.16);
    x.lineTo(cx, cy + nY * R * 1.16);
    x.stroke();
    x.restore();

    // the centre reticle (the Codec's): a small ring and a pointer, drawn
    x.save();
    x.beginPath();
    x.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
    strokeGlow((0.55 + hover * 0.2) * flick, lw, T.ink);
    x.fillStyle = T.ink;
    x.globalAlpha = (0.7 + hover * 0.2) * flick;
    x.beginPath();
    x.moveTo(cx - fs * 0.22, cy - fs * 0.3);
    x.lineTo(cx + fs * 0.3, cy);
    x.lineTo(cx - fs * 0.22, cy + fs * 0.3);
    x.closePath();
    x.fill();
    x.restore();

    // the markers: every city a piece came from — near side a lit red disc
    // in its own red bloom (the record's accent), far side a dim ring seen
    // through the cage
    const marks = [];
    for (const pl of places) {
      const [X, Y, Z] = rot(onSphere(pl.lat, pl.lon), sy, cyw, sp, cp);
      marks.push({ pl, px: cx + X * R, py: cy - Y * R, z: Z });
    }
    marks.sort((a, b) => a.z - b.z);
    let best = null;
    x.save();
    for (const m of marks) {
      const near = m.z >= 0;
      const big = Math.min(3, m.pl.count || 1);
      const r = fs * (0.28 + 0.06 * big);
      if (near) {
        const a = (0.85 + 0.15 * m.z) * flick;
        x.fillStyle = T.red;
        x.globalAlpha = a * 0.18;
        x.beginPath(); x.arc(m.px, m.py, r * 3.2, 0, Math.PI * 2); x.fill();
        x.globalAlpha = a * 0.4;
        x.beginPath(); x.arc(m.px, m.py, r * 1.9, 0, Math.PI * 2); x.fill();
        x.globalAlpha = a;
        x.beginPath(); x.arc(m.px, m.py, r, 0, Math.PI * 2); x.fill();
        if (big > 1) {
          x.strokeStyle = T.red;
          x.lineWidth = lw;
          x.globalAlpha = a * 0.9;
          x.beginPath(); x.arc(m.px, m.py, r * 1.6 + lw, 0, Math.PI * 2); x.stroke();
        }
        if (!best || m.z > best.z) best = m;
      } else {
        x.strokeStyle = T.red;
        x.lineWidth = lw;
        x.globalAlpha = 0.22 * flick;
        x.beginPath(); x.arc(m.px, m.py, r * 0.9, 0, Math.PI * 2); x.stroke();
      }
    }
    // the front-most city is named beside its marker, the way the Codec
    // pins a label to the fix it is reading
    if (best) {
      const lx = best.px + fs * 1.2, ly = best.py - fs * 0.9;
      x.strokeStyle = T.sig;
      x.globalAlpha = 0.5 * flick;
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(best.px + fs * 0.5, best.py - fs * 0.3);
      x.lineTo(lx - 2, ly + fs * 0.35);
      x.stroke();
      x.textAlign = "left";
      x.font = `${fs * 1.05}px ${T.font}`;
      x.fillStyle = T.ink;
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

    // ---- hologram treatment ----
    if (!reducedMotion) {
      // a slow band of light rolls down the picture, lighting only what
      // is drawn (source-atop): the projector's refresh
      const rollY = ((t % ROLL_S) / ROLL_S) * (H * 1.3) - H * 0.15;
      const band = H * 0.11;
      const g = x.createLinearGradient(0, rollY - band, 0, rollY + band);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.globalCompositeOperation = "source-atop";
      x.globalAlpha = 1;
      x.fillStyle = g;
      x.fillRect(0, rollY - band, W, band * 2);
      x.globalCompositeOperation = "source-over";
      // the tear: for a few frames two or three slices of the image slip
      // sideways — the canvas copied onto itself, band by band
      if (tearing) {
        const glitch = Math.floor(t / TEAR_S);
        if (glitch !== tearAt) { tearAt = glitch; tearSeed = Math.random(); }
        const slices = 2 + Math.floor(tearSeed * 2);
        for (let i = 0; i < slices; i++) {
          const yy = Math.floor(((tearSeed * 7.1 + i * 0.37) % 1) * H * 0.9);
          const hh = Math.max(2, Math.floor(H * (0.012 + ((tearSeed * 13 + i) % 1) * 0.03)));
          const dx = Math.round((((tearSeed * 3.3 + i * 0.61) % 1) - 0.5) * W * 0.08);
          x.drawImage(cv, 0, yy, W, hh, dx, yy, W, hh);
        }
      }
    }
    // the dock's scanline banding
    x.globalCompositeOperation = "destination-out";
    x.fillStyle = "rgba(0,0,0,0.3)";
    for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 1.5);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
  };

  // half rate (9 Sep): the globe drifts slowly, so every other frame is
  // enough — half the raster work for the owner's Safari; a drag draws on
  // every frame so the hand feels no lag
  let odd = false;
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
    odd = !odd;
    if (odd || dragging) draw();
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

  // the canvas is sized by CSS; its bitmap follows at 2× so the lines stay crisp
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
