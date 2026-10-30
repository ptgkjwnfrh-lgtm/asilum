// lib/adcrawl.js — THE AD TICKER'S CRAWL AND WRAP (owner, 28 Oct 2026, with
// the MAD-S player's wrap-round display as the reference: "lets have it
// stretch all the across the center fixture, so if the center fixture was a
// 3d object the add ticker should stretch all around it"; then "i wanted the
// bar to stretch the entirety of the fixture like i meant if the fixture was
// a object the ad ticker would wrap around the whole thing 360 degrees not
// just stuck on the middle"). The ticker is a band round the deck: across
// its face edge to edge, and round each side as a quarter cylinder of radius
// R, so the words squeeze to nothing at the deck's silhouette and go on
// round the back. The entries crawl as one line, right to left.
// app/components/AdStrip.jsx draws it; this is the arithmetic.

/** The crawl's pace, in CSS pixels a second: an unhurried read. */
export const CRAWL_PX_S = 32;

/** How many flat slices draw each quarter cylinder's words (enough that the squeeze reads as a curve:
 *  at 6 the steps in the squeeze showed as kinks, owner, 28 Oct 2026: "the rendering of the 3d wrap is
 *  kind of choppy"). The cloud and the shade under them are one smooth piece a side, never sliced. */
export const WRAP_SLICES = 16;

/**
 * The slices of the two quarter cylinders, in units of the wrap's radius R.
 * A point at angle θ round a side (0 where the face meets it, 90° at the
 * silhouette) shows at R·sin θ in from the face's edge and lies R·(π/2 − θ)
 * along the band from the silhouette. Each slice is the band's arc between
 * two angles laid flat and squeezed by `scale` (its shown width over its arc
 * length), from its own left edge; `at` is where its left edge shows (from
 * the band's left end for the left side, from the face's right edge for the
 * right side) and `from` how far along the band it begins (from the left
 * silhouette; for the right side, from the face's right edge); `shade` dims
 * it as it turns from the light.
 */
export function wrapSlices(n = WRAP_SLICES) {
  const d = Math.PI / 2 / n, out = { left: [], right: [], arc: d };
  for (let j = 0; j < n; j++) {
    // left side, outermost first: from θ = 90° − j·d down to 90° − (j+1)·d
    const hi = Math.PI / 2 - j * d, lo = hi - d;
    out.left.push({ at: 1 - Math.sin(hi), from: j * d, scale: (Math.sin(hi) - Math.sin(lo)) / d, shade: 1 - Math.cos((hi + lo) / 2) });
  }
  for (let k = 0; k < n; k++) {
    // right side, innermost first: from θ = k·d up to (k+1)·d
    const lo = k * d, hi = lo + d;
    out.right.push({ at: Math.sin(lo), from: k * d, scale: (Math.sin(hi) - Math.sin(lo)) / d, shade: 1 - Math.cos((hi + lo) / 2) });
  }
  return out;
}

/**
 * The crawl for one sequence of entries `seqW` wide on a band `bandW` long
 * (unrolled): how many copies the band needs (it must cover its whole length
 * even when it has slid a whole sequence along), how far one loop slides
 * (one sequence: the next copy lands exactly where the first began, so the
 * loop has no seam) and how long it takes at CRAWL_PX_S. Nothing measured,
 * no crawl.
 */
export function crawlFor(seqW, bandW, pxPerS = CRAWL_PX_S) {
  if (!(seqW > 0) || !(bandW > 0) || !(pxPerS > 0)) return { copies: 2, len: 0, seconds: 0 };
  return { copies: Math.ceil(bandW / seqW) + 1, len: seqW, seconds: Math.round((seqW / pxPerS) * 100) / 100 };
}

/** Where the words are typed in and out, as an angle round each side: in as
 *  they come round the right side into view, out as they go round the left
 *  (owner, 28 Oct 2026: "instead of the text always appearing allow it to be
 *  typed in and typed out as its "circling" its way around the track"). */
export const TYPE_DEG = 60;

/**
 * THE TYPING (owner, 28 Oct 2026; and "all the adds on the ticker should be
 * flowing extremely smooth like a rolex no actual ticking"). The band glides
 * without a step; only the edges where words appear and vanish move in
 * steps, one whole character at a time, so each letter is TYPED in and out
 * while the line flows on. Share Tech Mono is monospaced, so the band is a
 * grid of character cells `cell` wide: one sequence is exactly `n` cells, a
 * loop slides exactly one sequence, and the typing edges sit on cell
 * boundaries — `out` and `in` along the unrolled band (from the left
 * silhouette), on the grid, at TYPE_DEG round each side of radius `r`; the
 * band `unrolled` long. The mask that carries them steps right one cell
 * every cell's worth of glide (n steps a loop), so in the band's frame it
 * climbs a staircase while the band slides: on the screen its edges hold
 * still within a cell, then each step uncovers (or covers) exactly one
 * whole character. Nothing measured, no typing.
 */
export function typingFor({ seqW, cell, r, unrolled, deg = TYPE_DEG }) {
  if (!(seqW > 0) || !(cell > 0) || !(r > 0) || !(unrolled > 0)) return null;
  const n = Math.max(1, Math.round(seqW / cell));
  const reach = r * (Math.PI / 2 - (deg * Math.PI) / 180); // along the band from the silhouette to the angle
  const snap = (x) => Math.round(x / cell) * cell;
  const out = snap(reach), inn = snap(unrolled - reach);
  return { n, len: n * cell, out, in: Math.max(out + cell, inn) };
}

// Share Tech Mono carries printable ASCII, Latin-1 and the common typographic
// marks (measured in Chromium, 28 Oct 2026: – — ‘ ’ “ ” … € ™ all one cell);
// any other character would fall back to another face, break the cell grid
// and let the typing edge cut a letter in two, so it is folded to its plain
// letter (é → e by decomposition) or, failing that, to "?"
const MONO_OK = /[\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac\u2122]/;
/** Text the ticker's monospaced grid can carry, character for character. */
export function monoText(text) {
  let out = "";
  for (const ch of String(text || "")) {
    if (MONO_OK.test(ch)) { out += ch; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += base && [...base].every((b) => MONO_OK.test(b)) ? base : "?";
  }
  return out;
}

/** What stands between two entries on the band: a dot in two cells of air each side. */
export const SEP = "  \u00b7  ";

/** THE BEZELS BECOME THE LINE (owner, 29 Oct 2026: "the ads wink isnt clean enough"). Each bezel's clip: the line's
 *  stretches (ControlCenter.jsx AD_LINE, [a, b] in the deck's drawn units) as ONE polygon — a comb, each stretch a
 *  rectangle, joined along its foot by edges of no area — open (whole: the band's full length, round both sides, no
 *  break) or shut (the line's own stretches, broken by --ad-brk at every cut, ending where the line ends). Both have
 *  the same points in the same order, so the one eases into the other while the bezels close: where they meet they
 *  are already the line, and the hand-over is light alone (measured before: whole hairlines met, then the ends
 *  vanished and the breaks opened as the line took over). RIM_GLOW px of room around it keeps the bezels' glow. */
export const RIM_GLOW = 8;
export function rimClip(line, shut) {
  const segs = (Array.isArray(line) ? line : []).filter((s) => Array.isArray(s) && s.length === 2 && s.every(Number.isFinite));
  if (!segs.length) return "none";
  // a cut's place; shut, half a break in from it (the line's own edge, ControlCenter.jsx .ccadline i)
  const x = (u, side) => (shut ? `calc(var(--u) * ${u} * var(--dk-sx) ${side < 0 ? "-" : "+"} var(--ad-brk) / 2)` : `calc(var(--u) * ${u} * var(--dk-sx))`);
  const top = `-${RIM_GLOW}px`, foot = `calc(100% + ${RIM_GLOW}px)`;
  const pts = [];
  segs.forEach(([a, b], i) => {
    const l = !shut && i === 0 ? `calc(0% - ${RIM_GLOW}px)` : x(a, 1);
    const r = !shut && i === segs.length - 1 ? `calc(100% + ${RIM_GLOW}px)` : x(b, -1);
    pts.push(`${l} ${foot}`, `${l} ${top}`, `${r} ${top}`, `${r} ${foot}`);
  });
  return `polygon(${pts.join(", ")})`;
}
