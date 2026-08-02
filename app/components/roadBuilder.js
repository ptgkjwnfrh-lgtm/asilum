// app/components/roadBuilder.js — passport → /upload build animation
// (upload-station r5, owner decree). The map never moves: the passport
// document is the root, and a full-viewport Paris assembles around it —
// roads arriving chunk by chunk (nearest the document first, spreading
// outward), each segment flashing up as ASCII line-art for a beat before
// it solidifies into a phosphor stroke. Chunk lengths are randomized so
// the growth reads uneven, like terrain streaming in. Exactly 2s; the
// final frame matches /upload's static background (map at 0.5 under the
// same gradient), so the hand-off stays continuous.
//
// Canvas, not SVG: the map is ~26k polylines / ~52k points — an
// accumulating canvas draws each chunk once; an FX canvas above it is
// cleared per frame for the ASCII materialization and star pops.

const DURATION = 2000;
const ASCII_MS = 90; // how long a fresh segment stays ASCII before solidifying

const LAYERS = {
  buildings: { width: 0.35, alpha: 0.5, glow: 0, ascii: false },
  minor: { width: 0.55, alpha: 0.6, glow: 5, ascii: true },
  secondary: { width: 0.9, alpha: 0.8, glow: 7, ascii: true },
  major: { width: 1.4, alpha: 0.95, glow: 10, ascii: true },
};
const ROAD_DELAY = { major: 0, secondary: 90, minor: 180 };

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
    const n = 2 + Math.floor(Math.random() * 6);
    runs.push(pts.slice(i, i + n + 1));
    i += n;
  }
  return runs;
}

// Direction → ASCII line-art character (screen y grows downward).
const DIR_CHARS = ["-", "\\", "|", "/"];

export default function buildRoads(overlay, map, docRect, onDone) {
  const css = getComputedStyle(document.documentElement);
  const SIG = css.getPropertyValue("--sig").trim() || "#38e08f";
  const RED = css.getPropertyValue("--red").trim() || "#e5342b";
  const GREY = css.getPropertyValue("--grey").trim() || "#8a8f98";
  const OSD = css.getPropertyValue("--osd").trim() || "monospace";

  const W = window.innerWidth;
  const H = window.innerHeight;
  // same fit as the SVG's preserveAspectRatio="xMidYMid slice"
  const s = Math.max(W / map.w, H / map.h);
  const tx = (W - map.w * s) / 2;
  const ty = (H - map.h * s) / 2;
  // the root: passport document centre, in map coordinates
  const rx = (docRect.left + docRect.width / 2 - tx) / s;
  const ry = (docRect.top + docRect.height / 2 - ty) / s;

  overlay.innerHTML = "";
  const veil = document.createElement("div");
  veil.className = "ppbuildveil";
  const mapWrap = document.createElement("div");
  mapWrap.className = "ppbuildmap";
  const base = document.createElement("canvas");
  mapWrap.appendChild(base);
  const grad = document.createElement("div");
  grad.className = "ppbuildgrad";
  const fxWrap = document.createElement("div");
  fxWrap.className = "ppbuildfx";
  const fx = document.createElement("canvas");
  fxWrap.appendChild(fx);
  overlay.append(veil, mapWrap, grad, fxWrap);
  overlay.style.display = "block";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("on"));
  });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [base, fx]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  const bctx = base.getContext("2d");
  const fctx = fx.getContext("2d");
  bctx.scale(dpr, dpr);
  fctx.scale(dpr, dpr);
  bctx.lineCap = "round";
  bctx.lineJoin = "round";
  fctx.textAlign = "center";
  fctx.textBaseline = "middle";

  const X = (p) => p[0] * s + tx;
  const Y = (p) => p[1] * s + ty;

  // ---- schedule: every chunk gets an arrival time; distance from the
  // root decides the wave, jitter + per-chunk step keep it uneven ----
  const events = [];
  let maxD = 1;
  const polysByLayer = {};
  for (const key of Object.keys(LAYERS)) {
    const polys = parsePolys(map[key]);
    polysByLayer[key] = polys;
    for (const pts of polys) {
      const head = pts[0];
      const tail = pts[pts.length - 1];
      const dh = Math.hypot(head[0] - rx, head[1] - ry);
      const dt = Math.hypot(tail[0] - rx, tail[1] - ry);
      if (dt < dh) pts.reverse(); // grow away from the root
      const d = Math.min(dh, dt);
      pts.d = d;
      if (d > maxD) maxD = d;
    }
  }
  for (const key of Object.keys(LAYERS)) {
    const L = LAYERS[key];
    for (const pts of polysByLayer[key]) {
      if (key === "buildings") {
        // substrate: thin dim outlines, no ASCII, settled early
        events.push({ t: (pts.d / maxD) * 700 + Math.random() * 250, layer: key, pts });
        continue;
      }
      const runs = chunkPoly(pts);
      const t0 = Math.min(
        (pts.d / maxD) * 1150 + Math.random() * 350 + ROAD_DELAY[key],
        1500
      );
      let step = 45 + Math.random() * 75;
      const budget = DURATION - 120 - ASCII_MS - t0;
      if (step * runs.length > budget) step = budget / runs.length;
      runs.forEach((run, i) => {
        events.push({ t: t0 + i * step, layer: key, pts: run });
      });
    }
  }
  for (const [x, y] of map.stars) {
    events.push({ t: 1500 + Math.random() * 380, star: true, x, y });
  }
  events.sort((a, b) => a.t - b.t);

  // ---- drawing ----
  function commit(e) {
    if (e.star) {
      bctx.save();
      bctx.font = `${15 * s}px ${OSD}`;
      bctx.textAlign = "center";
      bctx.fillStyle = RED;
      bctx.shadowColor = RED;
      bctx.shadowBlur = 9;
      bctx.fillText("*", e.x * s + tx, (e.y + 5) * s + ty);
      bctx.restore();
      return;
    }
    const L = LAYERS[e.layer];
    bctx.save();
    bctx.globalAlpha = L.alpha;
    bctx.strokeStyle = e.layer === "buildings" ? GREY : SIG;
    bctx.lineWidth = L.width * s;
    if (L.glow) {
      bctx.shadowColor = SIG;
      bctx.shadowBlur = L.glow;
    }
    bctx.beginPath();
    bctx.moveTo(X(e.pts[0]), Y(e.pts[0]));
    for (let i = 1; i < e.pts.length; i++) bctx.lineTo(X(e.pts[i]), Y(e.pts[i]));
    bctx.stroke();
    bctx.restore();
  }

  // fresh segment as ASCII line-art: direction-matched characters laid
  // along the line, rerolled every few frames so it flickers
  function drawAscii(e, age) {
    const flick = Math.floor(age / 45);
    fctx.globalAlpha = 0.85;
    fctx.fillStyle = SIG;
    fctx.font = `9px ${OSD}`;
    for (let i = 1; i < e.pts.length; i++) {
      const x0 = X(e.pts[i - 1]);
      const y0 = Y(e.pts[i - 1]);
      const x1 = X(e.pts[i]);
      const y1 = Y(e.pts[i]);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const oct = ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4;
      const n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k <= n; k++) {
        const ch = (k + flick) % 5 === 0 ? "·" : DIR_CHARS[oct];
        fctx.fillText(ch, x0 + (dx * k) / n, y0 + (dy * k) / n);
      }
    }
  }

  function drawStarPop(e, age) {
    const k = 1 - age / ASCII_MS; // shrink into place
    fctx.globalAlpha = 0.9;
    fctx.fillStyle = RED;
    fctx.font = `${(15 + 10 * k) * s}px ${OSD}`;
    fctx.fillText("*", e.x * s + tx, (e.y + 5) * s + ty);
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
    while (idx < events.length) commit(events[idx++]);
    for (const p of pending) commit(p.e);
    fctx.clearRect(0, 0, W, H);
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
      if (!e.star && !LAYERS[e.layer].ascii) commit(e);
      else pending.push({ e, born: t });
    }
    fctx.clearRect(0, 0, W, H);
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      const age = t - p.born;
      if (age >= ASCII_MS) {
        commit(p.e);
        pending.splice(i, 1);
      } else if (p.e.star) {
        drawStarPop(p.e, age);
      } else {
        drawAscii(p.e, age);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return finish; // caller may force-complete (e.g. unmount)
}
