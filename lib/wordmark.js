// lib/wordmark.js — THE BRICK AND ITS LINE, from the owner's reference (29 Oct 2026: "new logo with the masthead
// line intergated"; docs/brand/asilum-logo-2026-10-29.jpg). The word sits wholly inside a white brick that runs
// off the screen's left edge; at its right end the brick's top turns down in a slant (a shoulder) to the line,
// the line as thick as drawn and flush with the brick's foot, and the Masthead's line carries on from there.
// Pure: app/components/Wordmark.jsx draws it, app/globals.css sizes the box and the line from the same numbers.

/** The reference, measured in its own pixels (2000 x 1602; the dark ink, the white, the red, by column). */
export const REF = Object.freeze({
  capsTop: 797, base: 924,     // the word's ink, top to baseline
  aLeft: 126, mRight: 948,     // the word's ink, the A's left to the M's right (the asterisk's left is the A's)
  brickTop: 779, foot: 945,    // the brick, top to bottom
  lineTop: 914,                // the line's top (its bottom is the brick's foot): 31 thick
  shoulder: 996, toe: 1192,    // the slant's corners: its straight part (fitted, 1050 to 1150: 34.6°) met with the top and the line
  bend: 15,                    // the bends' rounding
});

/** The word as the logo sets it, in the logo's frame units (Wordmark.jsx WM, WM.set 0.96 and +40): the A's ink
 *  left (Michroma's A from 5 at 161), the M's ink right (its origin 604.3, its ink to 206 at 161), the capitals'
 *  top and the baseline. */
export const WORD = Object.freeze({ aInk: 44.8, mInk: 817.888, capsTop: 2.665, base: 118.585 });

/** The brick in frame units: the reference's proportions laid round the word as set (across by the word's width,
 *  down by the capitals' height). */
export function brickGeometry(ref = REF, word = WORD) {
  const fx = (word.mInk - word.aInk) / (ref.mRight - ref.aLeft);
  const fy = (word.base - word.capsTop) / (ref.base - ref.capsTop);
  const X = (px) => word.mInk + (px - ref.mRight) * fx;
  const Y = (py) => word.capsTop + (py - ref.capsTop) * fy;
  const r = (n) => Math.round(n * 1000) / 1000;
  return {
    top: r(Y(ref.brickTop)), foot: r(Y(ref.foot)), line: r(Y(ref.lineTop)),
    shoulder: r(X(ref.shoulder)), toe: r(X(ref.toe)), bend: r(ref.bend * fx),
    thick: r(Y(ref.foot) - Y(ref.lineTop)),
  };
}

/** How far left the brick runs, in the logo's units: past the screen's left edge wherever the logo sits, on a
 *  window as wide as 3840px at the logo's smallest unit (app/globals.css --wm-w's floor; tests/v2-logo-line.test.js). */
export const RUN = 32000;

/** The brick's outline as an SVG path: from `left` (off the screen) along the top, round the shoulder, down the
 *  slant, round onto the line, along it to `end`, and back along the foot. */
export function brickPath(g, { left = -RUN, end }) {
  const dx = g.toe - g.shoulder, dy = g.line - g.top, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, b = g.bend;
  const n = (v) => +v.toFixed(3);
  return [
    `M${left} ${n(g.top)}`, `H${n(g.shoulder - b)}`, `Q${n(g.shoulder)} ${n(g.top)} ${n(g.shoulder + b * ux)} ${n(g.top + b * uy)}`,
    `L${n(g.toe - b * ux)} ${n(g.line - b * uy)}`, `Q${n(g.toe)} ${n(g.line)} ${n(g.toe + b)} ${n(g.line)}`,
    `H${n(end)}`, `V${n(g.foot)}`, `H${left}`, "Z",
  ].join(" ");
}

/** The logo's box: its left edge (the deck's line; the brick runs on past it), its top (the brick's, and a
 *  breath for the glow), its right end (a little past the toe, where the Masthead's line takes over). */
export function brickBox(g = brickGeometry()) {
  const x = 28, top = -16, end = Math.round((g.toe + g.bend + 2) * 1000) / 1000;
  return { x, top, end, w: Math.round((end - x) * 1000) / 1000, h: Math.round((g.foot - top) * 1000) / 1000 };
}
