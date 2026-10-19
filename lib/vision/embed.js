// lib/vision/embed.js — IMAGE EMBEDDING v0 (r27). The first thing in this
// system that turns pixels into a VECTOR rather than into words.
//
// WHY THIS EXISTS. Everything the brain knows about a garment today arrives as
// tags — a curated vocabulary applied by hand or inferred from text. Two pieces
// that look nothing alike can carry identical tags, and two that are visually
// twins can carry none in common. Fashion is a visual medium and the engine has
// been reading captions.
//
// WHAT THIS IS. A classical content-based image descriptor: colour distribution,
// texture energy, and spatial layout, packed into 50 numbers whose cosine is a
// similarity. This is real computer vision — the family that ran image search
// for two decades before deep learning — and it runs offline, deterministically,
// in a few milliseconds, with no API key and no model download.
//
// WHAT THIS IS NOT, stated here because the gap matters more than the feature.
// It has NO SEMANTICS. It cannot tell you that something is a trench coat, that
// a lapel is peaked, or that a boot is Chelsea rather than Chukka. It sees
// colour, busyness and arrangement. A black wool coat and a black leather coat
// are near-identical to it. A learned model (CLIP-class) is what closes that,
// and `embedImage` in ./index.js is the seam where it plugs in — v0 lives
// behind the same call, exactly as lib/embeddings keeps a live tag-space v0
// behind its gated v1.
//
// HONEST STATUS AT WRITING. The catalog carries ZERO images (all 915 items have
// img = null; the site draws deterministic SVG placeholders), so nothing in
// production feeds this yet. That is a supply problem, not a code problem, and
// it is named rather than hidden — this module is validated against controlled
// images with known properties (tests/vision-embed.test.js), which proves the
// arithmetic and proves nothing at all about garments. The first real photo is
// what turns this from correct into useful.
//
// MEASURED, and it corrected an expectation: I predicted the texture block
// would be resolution-dependent (a gradient histogram counts adjacent-pixel
// differences, so doubling the size should halve every local step). It is not —
// when the STRUCTURE scales with the frame, the ratio of edge pairs to flat
// pairs is preserved, and all three blocks hold above 0.99 across a 2x resize.
// What remains untested is a real photograph, whose fine detail (weave, grain,
// sensor noise) does NOT scale with the frame. Embedding everything at one
// canonical size therefore stays the house rule — as prudence about an
// untested case rather than as a proven necessity.
//
// Pure module: zero imports, no I/O, no clock, no randomness. Runs identically
// in a browser on an uploaded moodboard image and on a server at ingest.

// ---- descriptor layout (declared; asserted in the battery) ------------------
//
//   [ 0..23]  chromatic colour — 12 hue bins x 2 saturation bands
//   [24..29]  achromatic       — 6 lightness bins (black/grey/white matter more
//                                in fashion than in any other image domain)
//   [30..37]  texture          — 8-bin gradient-magnitude histogram
//   [38..49]  layout           — 3 rows x 2 cols, each {mean luma, mean sat}
//
export const HUE_BINS = 12;
export const SAT_BANDS = 2;
export const GREY_BINS = 6;
export const TEXTURE_BINS = 8;
export const GRID_ROWS = 3;
export const GRID_COLS = 2;

export const COLOR_DIM = HUE_BINS * SAT_BANDS + GREY_BINS;   // 30
export const TEXTURE_DIM = TEXTURE_BINS;                      // 8
export const LAYOUT_DIM = GRID_ROWS * GRID_COLS * 2;          // 12
export const IMAGE_EMBED_DIM = COLOR_DIM + TEXTURE_DIM + LAYOUT_DIM; // 50

export const IMAGE_EMBED_VERSION = "image-v0";

/**
 * Block weights. They are applied as sqrt(w) on each unit-normalised block, so
 * each block contributes exactly w to the squared length and the concatenated
 * vector comes out unit-length for free — which is what lets cosine similarity
 * be a plain dot product.
 *
 * Colour carries the most because in garments it is the strongest and most
 * reliable visual signal, and because this codebase already established colour
 * as genuine taste evidence (lib/vision/palette.js, shipped in r13). Texture
 * and layout split the rest evenly: both are real but coarser at this
 * resolution. These are DECLARED, not fitted — there is no labelled fashion
 * data to fit them against yet, and inventing one would be fitting to noise.
 */
export const BLOCK_WEIGHTS = Object.freeze({ color: 0.6, texture: 0.2, layout: 0.2 });

// A pixel is "coloured" rather than "grey" above these; below, its hue is
// numerically unstable and would smear noise across the hue histogram.
const CHROMA_MIN = 0.15;
const VALUE_MIN = 0.10;
// Gradient-magnitude bin edges, in luminance units (0..1). Deliberately
// front-loaded: the interesting distinction is smooth-vs-slightly-textured,
// not busy-vs-very-busy.
const TEXTURE_EDGES = [0.02, 0.05, 0.09, 0.15, 0.24, 0.36, 0.52];
const MIN_OPAQUE_PIXELS = 16;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** HSV from 0..1 RGB. Hue in [0,360), sat and val in [0,1]. */
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: mx > 0 ? d / mx : 0, v: mx };
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function l2normalize(vec, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += vec[i] * vec[i];
  if (sum <= 0) return false;
  const inv = 1 / Math.sqrt(sum);
  for (let i = from; i < to; i++) vec[i] *= inv;
  return true;
}

/**
 * Describe an image as a unit vector.
 *
 * @param {Uint8ClampedArray|number[]} rgba  flat RGBA, as canvas getImageData
 * @param {number} width                     pixel width; needed to see 2D
 * @param {object} [opts.weights]            override BLOCK_WEIGHTS (batteries
 *                                           use this to prove each block is
 *                                           load-bearing rather than decorative)
 * @returns {Float64Array|null}  null when there is nothing describable — too
 *   few opaque pixels, or an image too small to have neighbours. Null is a real
 *   answer: a zero vector would silently score cosine 0 against everything and
 *   read as "maximally different" rather than "unknown".
 */
export function embedImage(rgba, width, { weights = BLOCK_WEIGHTS } = {}) {
  const w = width | 0;
  const n = rgba ? Math.floor(rgba.length / 4) : 0;
  const h = w > 0 ? Math.floor(n / w) : 0;
  if (w < 2 || h < 2) return null;

  const vec = new Float64Array(IMAGE_EMBED_DIM);
  const L = new Float64Array(w * h);
  const S = new Float64Array(w * h);
  const A = new Uint8Array(w * h); // opacity mask
  let opaque = 0;

  // ---- pass 1: per-pixel colour, and the luma/sat fields the later blocks read
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (rgba[i + 3] < 128) continue;
      A[p] = 1; opaque++;
      const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
      const { h: hue, s, v } = hsv(r, g, b);
      L[p] = luma(r, g, b);
      S[p] = s;
      if (s >= CHROMA_MIN && v >= VALUE_MIN) {
        const hb = Math.min(HUE_BINS - 1, Math.floor((hue / 360) * HUE_BINS));
        const sb = s < 0.5 ? 0 : 1;
        vec[hb * SAT_BANDS + sb] += 1;
      } else {
        const gb = Math.min(GREY_BINS - 1, Math.floor(clamp01(v) * GREY_BINS));
        vec[HUE_BINS * SAT_BANDS + gb] += 1;
      }
    }
  }
  if (opaque < MIN_OPAQUE_PIXELS) return null;

  // ---- texture: gradient magnitude over opaque neighbours ------------------
  // Counted per pixel-pair rather than per pixel so the histogram is a
  // distribution over EDGES, and therefore resolution-independent: the same
  // picture at twice the size produces the same shape.
  const tBase = COLOR_DIM;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!A[p]) continue;
      for (const q of [x + 1 < w ? p + 1 : -1, y + 1 < h ? p + w : -1]) {
        if (q < 0 || !A[q]) continue;
        const g = Math.abs(L[p] - L[q]);
        let bin = TEXTURE_EDGES.length;
        for (let k = 0; k < TEXTURE_EDGES.length; k++) {
          if (g < TEXTURE_EDGES[k]) { bin = k; break; }
        }
        vec[tBase + bin] += 1;
      }
    }
  }

  // ---- layout: coarse grid of mean luminance and saturation ---------------
  // Where the light and the colour SIT. At 3x2 this is silhouette-adjacent for
  // a garment shot — shoulders, waist, hem — without pretending to segment.
  const gBase = COLOR_DIM + TEXTURE_DIM;
  const cellSum = new Float64Array(GRID_ROWS * GRID_COLS * 2);
  const cellN = new Float64Array(GRID_ROWS * GRID_COLS);
  for (let y = 0; y < h; y++) {
    const gr = Math.min(GRID_ROWS - 1, Math.floor((y / h) * GRID_ROWS));
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!A[p]) continue;
      const gc = Math.min(GRID_COLS - 1, Math.floor((x / w) * GRID_COLS));
      const c = gr * GRID_COLS + gc;
      cellSum[c * 2] += L[p];
      cellSum[c * 2 + 1] += S[p];
      cellN[c] += 1;
    }
  }
  for (let c = 0; c < GRID_ROWS * GRID_COLS; c++) {
    if (!cellN[c]) continue;
    vec[gBase + c * 2] = cellSum[c * 2] / cellN[c];
    vec[gBase + c * 2 + 1] = cellSum[c * 2 + 1] / cellN[c];
  }

  // ---- normalise each block, then weight it -------------------------------
  const blocks = [
    [0, COLOR_DIM, weights.color],
    [tBase, tBase + TEXTURE_DIM, weights.texture],
    [gBase, gBase + LAYOUT_DIM, weights.layout],
  ];
  let any = false;
  for (const [from, to, weight] of blocks) {
    const ok = l2normalize(vec, from, to);
    const scale = Math.sqrt(Math.max(0, weight));
    for (let i = from; i < to; i++) vec[i] *= scale;
    any = any || ok;
  }
  if (!any) return null;
  // A block that was entirely empty (a fully flat image has no texture edges
  // above zero only in the degenerate case) leaves its weight unspent, so
  // renormalise rather than assume the weights summed to one in practice.
  l2normalize(vec, 0, IMAGE_EMBED_DIM);
  return vec;
}

/** Cosine similarity. Unit vectors in, so this is a dot product. */
export function imageSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Per-block similarity — WHY two images look alike, not just how much.
 * The engine explains every other decision it makes (bridges, zones, reasons);
 * a visual match that cannot say "same colour, different texture" would be the
 * one opaque thing in it.
 */
export function blockSimilarities(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  const spans = {
    color: [0, COLOR_DIM],
    texture: [COLOR_DIM, COLOR_DIM + TEXTURE_DIM],
    layout: [COLOR_DIM + TEXTURE_DIM, IMAGE_EMBED_DIM],
  };
  const out = {};
  for (const [name, [from, to]] of Object.entries(spans)) {
    let dot = 0, na = 0, nb = 0;
    for (let i = from; i < to; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    out[name] = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
  }
  return out;
}

/** Nearest neighbours by appearance. Plain scan — the catalog is 915 items, and
 *  a pgvector index is the r18 deferral trigger, not this round's problem. */
export function nearestByImage(query, gallery, { limit = 8, floor = 0 } = {}) {
  if (!query) return [];
  return gallery
    .filter((g) => g && g.vector)
    .map((g) => ({ id: g.id, sim: imageSim(query, g.vector) }))
    .filter((r) => r.sim > floor)
    .sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}
