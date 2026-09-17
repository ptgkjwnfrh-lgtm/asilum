// lib/roads/overpass.js — THE READER'S OWN STREET MAP (V.2, owner: "instead
// of the Paris street map, their street map is the background for the
// passport").
//
// A port of scripts/fetch-paris-roads.py into a server module: one Overpass
// query around a centre, projected into the same 1420×1000 frame at 15.5 m
// per pixel the Paris document uses, simplified, and returned in EXACTLY the
// shape public/paris-roads.json carries — so ParisMap, PassportSecurity and
// roadBuilder draw it unchanged. Data © OpenStreetMap contributors, ODbL;
// the attribution line already sits on the document.
//
// Cost discipline: the centre is rounded to two decimals (~1 km) so nearby
// readers share one document; one process-wide cache; a 25 s ceiling; a
// response byte cap; two mirrors. Overpass is public open-data
// infrastructure, not a retailer or a platform — the same source the Paris
// script used by hand. SERVER-ONLY.

const W = 1420, H = 1000;
export const M_PER_PX = 15.5;
export const ROAD_FRAME = Object.freeze({ w: W, h: H });
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const BYTE_CAP = 12 * 1024 * 1024;
const OVERPASS_TIMEOUT_MS = 25000;
const cache = new Map(); // key -> { at, map | promise }
const CACHE_TTL = 24 * 3600 * 1000;

export function roundCentre(lat, lng) {
  return { lat: +Number(lat).toFixed(2), lng: +Number(lng).toFixed(2) };
}

export function projector(lat0, lon0) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const ky = 110574;
  return (lat, lon) => [
    ((lon - lon0) * kx) / M_PER_PX + W / 2,
    (-(lat - lat0) * ky) / M_PER_PX + H / 2,
  ];
}

/** Douglas–Peucker, iterative. */
export function simplify(points, eps) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const norm = Math.hypot(dx, dy) || 1e-9;
    let imax = -1, dmax = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax > eps && imax > 0) { keep[imax] = 1; stack.push([a, imax], [imax, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Geometries ([{lat,lon}...] arrays) → one SVG path string in the frame. */
export function pathOf(geoms, project, eps, { bounds = null, closed = false } = {}) {
  const parts = [];
  let total = 0;
  const [x0, y0, x1, y1] = bounds || [-60, -60, W + 60, H + 60];
  for (const g of geoms) {
    let pts = g.map((p) => project(p.lat, p.lon));
    if (!closed) pts = pts.filter(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    if (pts.length < 2) continue;
    pts = simplify(pts, eps);
    if (pts.length < 2) continue;
    let d = `M${pts[0][0].toFixed(0)} ${pts[0][1].toFixed(0)}`;
    for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(0)} ${pts[i][1].toFixed(0)}`;
    if (closed) d += "Z";
    parts.push(d);
    total += pts.length;
  }
  return { d: parts.join(""), points: total };
}

const WIDE = new Set(["motorway", "trunk", "primary"]);

/**
 * Convert Overpass `out geom` elements into the passport map shape. Pure —
 * a test can feed it a handful of ways.
 */
export function convertElements(elements, centre) {
  const project = projector(centre.lat, centre.lng);
  const ways = elements.filter((e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length > 1);
  const major = [], second = [], minor = [];
  const use = new Map(); // node id -> number of ways through it
  for (const w of ways) {
    const hw = (w.tags && w.tags.highway) || "";
    if (WIDE.has(hw)) major.push(w.geometry);
    else if (hw === "secondary") second.push(w.geometry);
    else minor.push(w.geometry);
    if (Array.isArray(w.nodes)) for (const n of w.nodes) use.set(n, (use.get(n) || 0) + 1);
  }
  // junction stars: nodes where three or more ways meet, clustered to ~60 m
  const nodePos = new Map();
  for (const w of ways) {
    if (!Array.isArray(w.nodes)) continue;
    w.nodes.forEach((n, i) => { if ((use.get(n) || 0) >= 3 && !nodePos.has(n) && w.geometry[i]) nodePos.set(n, w.geometry[i]); });
  }
  const cell = 60 / M_PER_PX;
  const grid = new Map();
  for (const [, g] of nodePos) {
    const [x, y] = project(g.lat, g.lon);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    if (!grid.has(key)) grid.set(key, [x, y, 1]); else { const c = grid.get(key); c[0] += x; c[1] += y; c[2]++; }
  }
  const stars = [...grid.values()].map(([sx, sy, n]) => [Math.round(sx / n), Math.round(sy / n)]).slice(0, 400);
  const mj = pathOf(major, project, 1.6), sd = pathOf(second, project, 1.4), mn = pathOf(minor, project, 1.0);
  return {
    w: W, h: H, major: mj.d, secondary: sd.d, minor: mn.d, buildings: "", stars,
    centre, source: "openstreetmap-overpass", attribution: "© OpenStreetMap contributors · ODbL",
    counts: { ways: ways.length, points: mj.points + sd.points + mn.points, stars: stars.length },
  };
}

async function overpass(query) {
  const body = "data=" + encodeURIComponent(`[out:json][timeout:24];${query}`);
  let last = null;
  for (const url of MIRRORS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const r = await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "asilum-passport-map/2.0" }, signal: ctrl.signal, redirect: "manual" });
      if (!r.ok) throw new Error("overpass " + r.status);
      const len = Number(r.headers.get("content-length") || 0);
      if (len > BYTE_CAP) throw new Error("overpass response too large");
      const text = await r.text();
      if (text.length > BYTE_CAP) throw new Error("overpass response too large");
      return JSON.parse(text);
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw last || new Error("overpass unreachable");
}

/** The map around a centre — cached per rounded centre for a day. */
export async function roadMapFor(lat, lng) {
  const c = roundCentre(lat, lng);
  const key = `${c.lat},${c.lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.promise;
  const promise = (async () => {
    const q = `(way["highway"~"^(motorway|trunk|primary)$"](around:9000,${c.lat},${c.lng});` +
      `way["highway"="secondary"](around:6000,${c.lat},${c.lng});` +
      `way["highway"~"^(tertiary|unclassified|residential|living_street|pedestrian)$"](around:2600,${c.lat},${c.lng}););out geom qt;`;
    const data = await overpass(q);
    const map = convertElements(data.elements || [], c);
    if (!map.counts.ways) throw new Error("no roads here");
    return map;
  })();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}
