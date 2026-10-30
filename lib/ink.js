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
  ".card.wpostcard.p2.withmedia:not(.f20post) .p2head", // Figure 20's head and foot float on the page: the ground's (GROUND_TEXT)
  ".card.wpostcard.p2.withmedia:not(.f20post) .p2foot",
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

// THE LOGO'S TINT (owner, 29 Oct 2026: "i still wanted the negative logo to be see through however i wanted it to be
// seemlessly reactive to tint once passing over a really bright card"). The word is cut out of the logo's brick;
// the tint under the cut (Wordmark.jsx .wmtint) shows only where a really bright card lies behind the letters,
// clipped to that card's own box, so it slides in and out with the card's edge, frame by frame.

/** How bright a card's plain ground must be for the letters over it to take the tint: really bright, white
 *  (the light cards are 0.92–1 white; the page's own ground and the glass are well under this). */
export const TINT_BRIGHT = 0.85;

/** Where the logo reads what is behind its word, on the screen: `n` points across the word's ink, along its top
 *  and its foot (a card coming up from below meets the foot first, one going up meets the top), 1px inside. */
export function tintPoints(word, n = 4) {
  if (!word || !(word.width > 0) || !(word.height > 0)) return [];
  const pts = [];
  for (const y of [word.top + 1, word.top + word.height - 1]) for (let i = 0; i < n; i++) pts.push([word.left + (word.width * (i + 0.5)) / n, y]);
  return pts;
}

/** The tint's clip: each bright card's box cut to the logo's `box`, in the box's own pixels, as a CSS path (the
 *  boxes joined, all drawn one way round, so where two overlap they are one). With none, a clip that shows
 *  nothing: the letters stay see-through. */
export const TINT_NONE = "inset(50%)";
export function tintClip(box, rects) {
  const n = (v) => +v.toFixed(2), parts = [];
  for (const r of rects || []) {
    if (!r) continue;
    const x0 = Math.max(0, r.left - box.left), y0 = Math.max(0, r.top - box.top);
    const x1 = Math.min(box.width, r.right - box.left), y1 = Math.min(box.height, r.bottom - box.top);
    if (x1 > x0 && y1 > y0) parts.push(`M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`);
  }
  return parts.length ? `path("${parts.join("")}")` : TINT_NONE;
}

// THE GROUND'S INK (owner, 29 Oct 2026: "all text should be reactive, glow when background is dark, solid black or
// grey when background is light, so THE FEED should glow in light mode because its on a dark background"). The
// words that sit on the page itself — no card, no fixture under them — take their ink from the page's own ground,
// which is a fixed gradient (app/globals.css --bg-grad): in light a dark blue at the screen's top and foot and the
// ice between, in dark near-black throughout. The words move through it as the page scrolls, so their ink is a mix
// that follows them, frame by frame (app/components/GroundInk.jsx): glowing white on the dark, solid ink on the ice,
// and in between a blend, never a jump.

/** The words on the page's own ground (every page's headline, the Feed's modes and filters, Figure 20's head and
 *  foot, which float on the page). */
export const GROUND_TEXT = Object.freeze([
  ".headline",
  ".fmodes .fmode",
  ".fmodes .txtbtn",
  ".filters .toggle",
  ".f20post .p2head",
  ".f20post .p2foot",
  ".eqkey", // the Feed's EQ key: its glass is near clear, so its glowing symbol takes the ground's ink (29 Oct 2026)
]);

/** The page's ground, as app/globals.css --bg-grad's linear gradient lays it over the screen: [fraction, colour]
 *  (tests/v2-ground.test.js holds these to the CSS). The two faint corner tints are left out. */
export const GROUND = Object.freeze({
  light: Object.freeze([[0, "#27465e"], [0.24, "#d7e8f4"], [0.5, "#e9f2f8"], [0.76, "#d7e8f4"], [1, "#27465e"]]),
  dark: Object.freeze([[0, "#0b0d0e"], [0.3, "#060708"], [0.62, "#020303"], [1, "#000000"]]),
});

/** The ground's brightness at a fraction of the way down it (0 the top, 1 the foot). */
export function groundLuma(frac, theme = "light") {
  const stops = GROUND[theme === "dark" ? "dark" : "light"];
  const f = Math.min(1, Math.max(0, Number(frac) || 0));
  let i = 0;
  while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
  const [f0, c0] = stops[i], [f1, c1] = stops[i + 1];
  const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
  const ch = (c, k) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
  const mix = (k) => ch(c0, k) + (ch(c1, k) - ch(c0, k)) * t;
  return luma(mix(0), mix(1), mix(2));
}

/** Where the words turn: the ground the owner reads as dark runs higher than a card's turn (INK_TURN). Measured
 *  29 Oct 2026 at the top of the light page: behind THE FEED 0.53–0.60 ("a dark background"), behind the modes
 *  under it 0.61–0.67 (the model says 0.69 there: it leaves out the row's own darker well); the ice of the middle
 *  is 0.9 and more. At a turn of 0.72 the modes sat mid-blend, a faint grey on the blue; at 0.76 they glow with the
 *  headline and the ice still takes the solid ink. The blend runs GROUND_BAND either side of the turn, wide enough
 *  that a word moving 6px a frame changes its mix by no more than 0.35 a frame (at a band of 0.06 one jumped
 *  0.44). */
export const GROUND_TURN = 0.76;
export const GROUND_BAND = 0.1;

/** How far the words lean to the dark ink, 0..1: 0 on a dark ground (glowing white), 1 on a bright one (solid
 *  ink), a smooth blend across the band. */
export function groundMix(l) {
  if (l == null || !Number.isFinite(l)) return 0;
  const x = Math.min(1, Math.max(0, (l - (GROUND_TURN - GROUND_BAND)) / (2 * GROUND_BAND)));
  return x * x * (3 - 2 * x);
}

/** Where on the ground a box sits, as a fraction of the way down it: on the screen when the ground is fixed there
 *  (it is, where the engine allows), on the page when it scrolls with it (WebKit on iOS). */
export function groundFrac(rect, { fixed = true, vh = 1, scrollY = 0, docH = 1 } = {}) {
  const mid = rect.top + rect.height / 2;
  return fixed ? mid / vh : (mid + scrollY) / docH;
}
