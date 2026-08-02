// app/components/roadBuilder.js — passport → /upload build animation
// (upload-station r5, owner decree). At click the overlay shows a still
// of EXACTLY the passport's own map — same fit, same pixels, isolated
// by a fast veil. That still is the base and it NEVER moves or rescales:
// roads assemble outward from the document's edges chunk by chunk
// (fresh major/secondary chunks flash as ASCII dashes riding the
// .os-scan 4px scanline grid) until Paris fills the frame at the
// passport's own scale, then the page hands off to /upload.
//
// Performance law (owner: "smooth, not heavy"): canvas, no shadowBlur
// anywhere. Glow matches the passport hologram exactly by putting the
// .pvroads-hot / .pvstars-hot drop-shadow filters on whole canvases
// (GPU, once per frame) — buildings keep their own unfiltered canvas
// because they never glow. Strokes batched into ONE path per layer per
// frame; the expansion is a single GPU transform on the wrapper.

const DURATION = 1500;
const STILL_MS = 150; // the isolated passport-map beat before growth
const ASCII_MS = 80; // how long a fresh chunk rides the scanlines
const SCAN_PITCH = 4; // .os-scan: repeating 0 2px transparent / 2px 4px line

const LAYERS = {
  buildings: { width: 0.35, alpha: 0.5, ascii: false },
  minor: { width: 0.55, alpha: 0.6, ascii: false },
  secondary: { width: 0.9, alpha: 0.8, ascii: true },
  major: { width: 1.4, alpha: 0.95, ascii: true },
};
const ROAD_DELAY = { major: 0, secondary: 60, minor: 120 };

// "M97 1079L96 1067M95 1067L97 1080" → [[[97,1079],[96,1067]], …]
function parsePolys(d) {
  const out = [];
  for (const sub of String(d || "").split("M")) {
    if (!sub) continue;
    const pts = [];
    for (const pair of sub.split(/[LZ]/)) {
      const sp = pair.indexOf(" ");
      if (sp < 1) continue;
      const x = +pair.slice(0, sp);
      const y = +pair.slice(sp + 1);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
    if (pts.length > 1) out.push(pts);
  }
  return out;
}

// Split a polyline into runs of 2–7 segments (adjacent runs share their
// boundary point) — the randomized "chunks" the road grows by.
function chunkPoly(pts) {
  const runs = [];
  let i = 0;
  while (i < pts.length - 1) {
    const n = 3 + Math.floor(Math.random() * 7);
    runs.push(pts.slice(i, i + n + 1));
    i += n;
  }
  return runs;
}

// Click-time smoothness: parsing ~52k points is the expensive part, so
// the passport page primes it while the bearer is still reading — the
// click itself only schedules and draws.
let parsedCache = null; // { map, layers: { key: polylines } }
export function primeRoads(map) {
  if (!map || (parsedCache && parsedCache.map === map)) return;
  const layers = {};
  for (const key of Object.keys(LAYERS)) layers[key] = parsePolys(map[key]);
  parsedCache = { map, layers };
}

export default function buildRoads(overlay, map, docRect, onDone) {
  const css = getComputedStyle(document.documentElement);
  const SIG = css.getPropertyValue("--sig").trim();
  const RED = css.getPropertyValue("--red").trim();
  const GREY = css.getPropertyValue("--grey").trim();
  const OSD = css.getPropertyValue("--osd").trim() || "monospace";

  const W = window.innerWidth;
  const H = window.innerHeight;
  // BASE fit: exactly the passport document's own map. Read the rendered
  // SVG's real transform so the still frame overlays it pixel-for-pixel
  // (the doc border shaves the box, so computing from the rect drifts ~1px)
  let s, tx, ty;
  const docSvg = document.querySelector(".ppholo-b svg");
  const ctm = docSvg && docSvg.getScreenCTM && docSvg.getScreenCTM();
  if (ctm) {
    s = ctm.a;
    tx = ctm.e;
    ty = ctm.f;
  } else {
    s = Math.max(docRect.width / map.w, docRect.height / map.h);
    tx = docRect.left + (docRect.width - map.w * s) / 2;
    ty = docRect.top + (docRect.height - map.h * s) / 2;
  }
  // document box in map coordinates — growth radiates from its edges
  const rl = (docRect.left - tx) / s;
  const rt = (docRect.top - ty) / s;
  const rr = (docRect.right - tx) / s;
  const rb = (docRect.bottom - ty) / s;
  const distToDoc = (p) => {
    const dx = Math.max(rl - p[0], 0, p[0] - rr);
    const dy = Math.max(rt - p[1], 0, p[1] - rb);
    return Math.hypot(dx, dy);
  };

  overlay.innerHTML = "";
  const veil = document.createElement("div");
  veil.className = "ppbuildveil";
  const mapWrap = document.createElement("div");
  mapWrap.className = "ppbuildmap";
  const cvBld = document.createElement("canvas");
  const cvRoads = document.createElement("canvas");
  cvRoads.className = "ppbuild-roads";
  const cvStars = document.createElement("canvas");
  cvStars.className = "ppbuild-stars";
  mapWrap.append(cvBld, cvRoads, cvStars);
  const fxWrap = document.createElement("div");
  fxWrap.className = "ppbuildfx";
  const fx = document.createElement("canvas");
  fxWrap.appendChild(fx);
  const grad = document.createElement("div");
  grad.className = "ppbuildgrad";
  overlay.append(veil, mapWrap, grad, fxWrap);
  overlay.style.display = "block";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("on"));
  });

  // persistent layers at capped retina; FX is transient — 1x is fine
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const ctxOf = (c) => {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.lineCap = "round";
    g.lineJoin = "round";
    return g;
  };
  const gBld = ctxOf(cvBld);
  const gRoads = ctxOf(cvRoads);
  const gStars = ctxOf(cvStars);
  fx.width = W;
  fx.height = H;
  const fctx = fx.getContext("2d");
  fctx.textAlign = "center";
  fctx.textBaseline = "middle";

  const X = (p) => p[0] * s + tx;
  const Y = (p) => p[1] * s + ty;

  // ---- schedule: every chunk gets an arrival time; distance from the
  // document's edge decides the wave, jitter keeps it uneven. Geometry
  // inside the document is NOT scheduled — it is the base still frame ----
  const events = [];
  let maxD = 1;
  primeRoads(map);
  const polysByLayer = parsedCache.layers;
  for (const key of Object.keys(LAYERS)) {
    for (const pts of polysByLayer[key]) {
      const dh = distToDoc(pts[0]);
      const dt = distToDoc(pts[pts.length - 1]);
      if (dt < dh) pts.reverse(); // grow away from the document
      const d = Math.min(dh, dt);
      pts.d = d;
      if (d > maxD) maxD = d;
    }
  }
  for (const key of Object.keys(LAYERS)) {
    for (const pts of polysByLayer[key]) {
      if (key === "buildings") {
        events.push({ t: STILL_MS + (pts.d / maxD) * 450 + Math.random() * 150, layer: key, pts });
        continue;
      }
      const runs = chunkPoly(pts);
      // quantize arrivals to ~90ms ticks: roads land in discrete pulses
      // (the chunk-wave feel) instead of a smooth drizzle
      let t0 = Math.min(
        STILL_MS + (pts.d / maxD) * 680 + Math.random() * 180 + ROAD_DELAY[key],
        1050
      );
      t0 = STILL_MS + Math.round((t0 - STILL_MS) / 90) * 90;
      let step = 55 + Math.random() * 70;
      const budget = DURATION - 150 - ASCII_MS - t0;
      if (step * runs.length > budget) step = budget / runs.length;
      runs.forEach((run, i) => {
        events.push({ t: t0 + i * step, layer: key, pts: run });
      });
    }
  }
  for (const [x, y] of map.stars) {
    events.push({
      t: STILL_MS + (distToDoc([x, y]) / maxD) * 680 + Math.random() * 180,
      star: true, x, y,
    });
  }
  events.sort((a, b) => a.t - b.t);

  // ---- drawing: one path per layer per frame, no canvas shadows;
  // glow lives on the canvas elements' CSS filters ----
  const batch = { buildings: [], minor: [], secondary: [], major: [], star: [] };

  function strokeBatch(g, list, width, alpha, color) {
    g.beginPath();
    for (const e of list) {
      g.moveTo(X(e.pts[0]), Y(e.pts[0]));
      for (let i = 1; i < e.pts.length; i++) g.lineTo(X(e.pts[i]), Y(e.pts[i]));
    }
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
    g.globalAlpha = 1;
    list.length = 0;
  }

  function drawStars(list) {
    gStars.globalAlpha = 0.95;
    gStars.fillStyle = RED;
    gStars.font = `${15 * s}px ${OSD}`;
    gStars.textAlign = "center";
    for (const e of list) gStars.fillText("*", e.x * s + tx, (e.y + 5) * s + ty);
    gStars.globalAlpha = 1;
    list.length = 0;
  }

  function flushBatch() {
    if (batch.buildings.length)
      strokeBatch(gBld, batch.buildings, LAYERS.buildings.width * s, LAYERS.buildings.alpha, GREY);
    for (const key of ["minor", "secondary", "major"]) {
      if (batch[key].length)
        strokeBatch(gRoads, batch[key], LAYERS[key].width * s, LAYERS[key].alpha, SIG);
    }
    if (batch.star.length) drawStars(batch.star);
  }

  // the base still frame: everything the passport itself shows, clipped
  // to the document box — identical fit, so it overlays its own map
  function drawStill() {
    for (const g of [gBld, gRoads, gStars]) {
      g.save();
      g.beginPath();
      g.rect(docRect.left, docRect.top, docRect.width, docRect.height);
      g.clip();
    }
    const all = { buildings: [], minor: [], secondary: [], major: [] };
    for (const key of Object.keys(all))
      for (const pts of polysByLayer[key]) all[key].push({ pts });
    strokeBatch(gBld, all.buildings, LAYERS.buildings.width * s, LAYERS.buildings.alpha, GREY);
    for (const key of ["minor", "secondary", "major"])
      strokeBatch(gRoads, all[key], LAYERS[key].width * s, LAYERS[key].alpha, SIG);
    drawStars(map.stars.map(([x, y]) => ({ x, y })));
    for (const g of [gBld, gRoads, gStars]) g.restore();
  }
  drawStill();

  // fresh chunk as scanline ASCII: dashes snapped to the .os-scan 4px
  // rows, sampled sparsely along the chunk — batched, capped, tiny font
  function drawAsciiBatch(list) {
    if (!list.length) return;
    fctx.globalAlpha = 0.8;
    fctx.fillStyle = SIG;
    fctx.font = `8px ${OSD}`;
    for (const e of list) {
      let drawn = 0;
      for (let i = 1; i < e.pts.length && drawn < 8; i++) {
        const x0 = X(e.pts[i - 1]);
        const y0 = Y(e.pts[i - 1]);
        const x1 = X(e.pts[i]);
        const y1 = Y(e.pts[i]);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.min(2, Math.max(1, Math.round(len / 12)));
        for (let j = 0; j <= n && drawn < 8; j++, drawn++) {
          const px = x0 + ((x1 - x0) * j) / n;
          const py = Math.round((y0 + ((y1 - y0) * j) / n) / SCAN_PITCH) * SCAN_PITCH;
          fctx.fillText("-", px, py);
        }
      }
    }
    fctx.globalAlpha = 1;
  }

  let start;
  let idx = 0;
  let raf;
  let finished = false;
  const pending = [];

  // rAF pauses in hidden tabs — never strand the bearer mid-build
  const failSafe = setTimeout(() => finish(), DURATION + 250);

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(failSafe);
    cancelAnimationFrame(raf);
    while (idx < events.length) {
      const e = events[idx++];
      (e.star ? batch.star : batch[e.layer]).push(e);
    }
    for (const p of pending) batch[p.e.layer].push(p.e);
    pending.length = 0;
    flushBatch();
    fctx.clearRect(0, 0, W, H);
    // hand the exact fit to /upload so its background renders the map at
    // the same passport scale — no reframe cut at landing
    try {
      window.sessionStorage.setItem(
        "asilum-warp-fit",
        JSON.stringify({ s, tx, ty, vw: W, vh: H })
      );
    } catch {}
    onDone();
  }

  function frame(now) {
    if (start === undefined) start = now;
    const t = now - start;
    if (t >= DURATION) {
      finish();
      return;
    }
    while (idx < events.length && events[idx].t <= t) {
      const e = events[idx++];
      if (e.star) batch.star.push(e);
      else if (LAYERS[e.layer].ascii) pending.push({ e, born: t });
      else batch[e.layer].push(e);
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (t - p.born >= ASCII_MS) {
        batch[p.e.layer].push(p.e);
        pending.splice(i, 1);
      }
    }
    flushBatch();
    fctx.clearRect(0, 0, W, H);
    drawAsciiBatch(pending.map((p) => p.e));
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return finish; // caller may force-complete (e.g. unmount)
}
