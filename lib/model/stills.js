// lib/model/stills.js — THE TILES (owner, 25 Oct 2026, last: "bring back the
// original multi-coloured cards"). Every picture the model shows — a post,
// a place, a broadcast, an author — is a tile in the palette the catalog's
// own placeholder cards wore from the start (lib/client.js thumbFor: the
// ten tags' grounds and accents), drawn as an SVG data URI, so it needs no
// file and cannot fail to load. The same key always yields the same tile.
// A piece keeps thumbFor itself (its initials, its tag). Nothing here is a
// photograph of anything.
//
// THE INK ON A TILE (owner: "the white font at 85% — a very light or a
// very dark blue depending on whether the card is light or dark"):
// inkFor(hex) reads the ground's luminance and answers with the light blue
// or the dark blue, at 85%.
//
// Isomorphic: plain strings.

export const TILE = Object.freeze([
  ["#232326", "#8a8a95"], ["#3d1220", "#c25a72"], ["#4a2a06", "#d99a3d"], ["#1d2430", "#7d93b5"], ["#2e2a20", "#b5a878"],
  ["#26262b", "#9fa3ad"], ["#26301f", "#8fae6b"], ["#12303a", "#5db4c9"], ["#1d3327", "#6dbb8a"], ["#33202e", "#b07fae"],
]);
export const INK_LIGHT = "rgba(219, 233, 245, 0.85)";
export const INK_DARK = "rgba(20, 40, 58, 0.85)";

function hash(key) {
  let h = 2166136261;
  const s = String(key ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The ink that reads on a ground: light blue on a dark ground, dark blue on a light one. */
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return INK_LIGHT;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? INK_DARK : INK_LIGHT;
}

/** The tile for a key: { src, base, accent, ink }. */
export function tileFor(key, { w = 600, h = 800 } = {}) {
  const n = hash(key);
  const [base, accent] = TILE[n % TILE.length];
  const angle = 100 + ((n >>> 8) % 80);
  const cx = 55 + ((n >>> 16) % 40), cy = 10 + ((n >>> 20) % 30);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.5"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${(cx / 100) * w}" cy="${(cy / 100) * h}" r="${w * 0.26}" fill="${accent}" opacity="0.16"/></svg>`;
  return { src: "data:image/svg+xml;utf8," + encodeURIComponent(svg), base, accent, ink: inkFor(base) };
}

export const stillFor = (key) => tileFor(key).src;
export const stillInk = (key) => tileFor(key).ink;
/** The tile in the shape a sample image takes: nothing to credit. */
export const stillImage = (key) => ({ src: stillFor(key), credit: "", license: "", url: "", alt: "a coloured tile", ink: stillInk(key) });
export const isStill = (src) => typeof src === "string" && src.startsWith("data:image/svg+xml");
