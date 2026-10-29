// lib/ink.js — THE REACTIVE INK (owner, 28 Oct 2026: "for all the text and
// symbols they must be reactive to go from dark to light depending on the
// background to strengthen ledibility"). The words and marks laid over a
// Feed card — its head, its foot, its three dots, a place's name, a
// BRDCST's words — take the dark ink or the light one by what is actually
// under them: a picture's own pixels where they sit on a picture, the page
// where they float on the page (Figure 20's head and foot). Before, a card
// took its ink from its tag's colour, and a light photograph under it got
// the light ink. app/components/InkWatch.jsx measures; this is the
// arithmetic, pure.

/** The blocks that read the ground under them, by selector. */
export const INK_ZONES = Object.freeze([
  ".card.piece.v-hero .pchead",
  ".card.piece.v-hero .pcfoot",
  ".card.wpostcard.p2.withmedia .p2head",
  ".card.wpostcard.p2.withmedia .p2foot",
  ".card.placecard.withphoto .placeopen",
  ".card.bstrip.withphoto .bsopen",
  ".fcell .carddots",
]);

/** How bright a ground is before the dark ink reads better than the light (the tiles' own line, stills.js inkFor). */
export const INK_TURN = 0.55;

/** Relative brightness of an sRGB colour, 0..1 (the tiles' own measure). */
export function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** A picture's brightness on a small grid: `rgba` is the picture drawn at `w` x `h`; a pixel's alpha mixes it
 *  with the ground behind the picture (`groundLuma`, the page's). Returns a Float32Array, row by row. */
export function lumaGrid(rgba, w, h, groundLuma = 1) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    out[i] = a * luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) + (1 - a) * groundLuma;
  }
  return out;
}

/** The mean brightness of a grid over a region given as fractions of the picture [x0, y0, x1, y1]; null when the
 *  region misses the picture. */
export function regionLuma(grid, w, h, [x0, y0, x1, y1]) {
  const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) * w)), cx1 = Math.min(w, Math.ceil(Math.max(x0, x1) * w));
  const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) * h)), cy1 = Math.min(h, Math.ceil(Math.max(y0, y1) * h));
  if (cx1 <= cx0 || cy1 <= cy0) return null;
  let sum = 0, n = 0;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { sum += grid[y * w + x]; n++; }
  return n ? sum / n : null;
}

/** Where a block falls on a picture drawn with object-fit (cover or contain, centred) in a box: `zone` and `box`
 *  are rectangles on the screen ({ left, top, width, height }), `nw` x `nh` the picture's own size. Returns the
 *  block as fractions of the picture [x0, y0, x1, y1]. */
export function zoneOnPicture(zone, box, nw, nh, fit = "cover") {
  if (!(box.width > 0) || !(box.height > 0) || !(nw > 0) || !(nh > 0)) return null;
  const s = fit === "contain" ? Math.min(box.width / nw, box.height / nh) : Math.max(box.width / nw, box.height / nh);
  const dw = nw * s, dh = nh * s;
  const ox = box.left + (box.width - dw) / 2, oy = box.top + (box.height - dh) / 2;
  return [(zone.left - ox) / dw, (zone.top - oy) / dh, (zone.left + zone.width - ox) / dw, (zone.top + zone.height - oy) / dh];
}

/** The ink for a ground: "dark" on a bright one, "light" on a dark one; null for no reading. */
export function inkOn(l) {
  if (l == null || !Number.isFinite(l)) return null;
  return l > INK_TURN ? "dark" : "light";
}
