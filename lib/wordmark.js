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
  bend: 15,                    // the bends' rounding, as drawn (the logo rounds them wider: BEND)
});

/** The word as the logo sets it, in the logo's frame units (Wordmark.jsx WM, WM.set 0.96 and +40): the A's ink
 *  left (Michroma's A from 5 at 161), the M's ink right (its origin 604.3, its ink to 206 at 161), the capitals'
 *  top and the baseline. */
export const WORD = Object.freeze({ aInk: 44.8, mInk: 817.888, capsTop: 2.665, base: 118.585 });

/** The line's thickness in the logo's units, thinner than drawn (owner, 29 Oct 2026, the same evening: "lets make
 *  the masthead line thinner and the lines under the buttons"): 16 of the drawn 28.3 — 2px on a phone, 2.9 on a
 *  desktop. The Masthead's line takes it too (app/globals.css --mh-line-h). */
export const LINE = 16;

/** The bends' rounding in the logo's units, wider than drawn (owner, 29 Oct 2026, the same evening, circling the
 *  toe: "make the circled area flush the curve kind of looks jagged"): the drawn 15 came to 14 units, under 2px on
 *  a phone — a kink, not a curve. 36 is 4.6px on a phone, 6.5 on a desktop. */
export const BEND = 36;

/** The brick in frame units: the reference's proportions laid round the word as set (across by the word's width,
 *  down by the capitals' height); the line `line` thick (null: as drawn), its top lowered to suit, the slant kept
 *  at the reference's angle so the toe moves along the line. */
export function brickGeometry(ref = REF, word = WORD, line = LINE, bend = BEND) {
  const fx = (word.mInk - word.aInk) / (ref.mRight - ref.aLeft);
  const fy = (word.base - word.capsTop) / (ref.base - ref.capsTop);
  const X = (px) => word.mInk + (px - ref.mRight) * fx;
  const Y = (py) => word.capsTop + (py - ref.capsTop) * fy;
  const r = (n) => Math.round(n * 1000) / 1000;
  const drawn = Y(ref.foot) - Y(ref.lineTop), thick = line == null ? drawn : line;
  const top = Y(ref.brickTop), foot = Y(ref.foot), shoulder = X(ref.shoulder);
  const run = (X(ref.toe) - shoulder) / (Y(ref.lineTop) - top); // across per unit down, along the slant
  return {
    top: r(top), foot: r(foot), line: r(foot - thick),
    shoulder: r(shoulder), toe: r(shoulder + (foot - thick - top) * run), bend: r(bend == null ? ref.bend * fx : bend),
    thick: r(thick),
  };
}

/** How far left the brick runs, in the logo's units: past the screen's left edge wherever the logo sits, on a
 *  window as wide as 3840px at the logo's smallest unit (app/globals.css --wm-w's floor; tests/v2-logo-line.test.js). */
export const RUN = 32000;

/** The brick's outline as an SVG path: from `left` (off the screen) along the top, round the shoulder, down the
 *  slant and round onto the line's top — where it ends, the bend's tangent level with the line, and drops to its
 *  foot. The Masthead's line takes over there (Masthead.jsx starts it at the brick's end): one piece of white
 *  under the curve, never two stacked (they stood a hair apart at the toe, and the curve read jagged).
 *  THE TAIL (owner, 29 Oct 2026, circling the toe again: "whats circled isnt clean it still looks jagged"): at 8x the
 *  toe was a SEAM — the brick (SVG, its edges anti-aliased where they fall) handing to the Masthead's line (a box, its
 *  edges snapped to the pixel grid, tucked a pixel under) a quarter pixel apart, and each with its own glow, which
 *  fades at its own end: the haze above the line stopped dead where the line's own halo began with a bright cap.
 *  So the line's first stretch, from the toe to the first key, is the brick's own: `tail` units of foot past the toe's
 *  bend, in the same path and the same glow, and the Masthead's line begins at the first break, where a break is
 *  meant to be. */
export function brickPath(g, { left = -RUN, tail = 0 } = {}) {
  const dx = g.toe - g.shoulder, dy = g.line - g.top, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, b = g.bend;
  const n = (v) => +v.toFixed(3);
  return [
    `M${left} ${n(g.top)}`, `H${n(g.shoulder - b)}`, `Q${n(g.shoulder)} ${n(g.top)} ${n(g.shoulder + b * ux)} ${n(g.top + b * uy)}`,
    `L${n(g.toe - b * ux)} ${n(g.line - b * uy)}`, `Q${n(g.toe)} ${n(g.line)} ${n(g.toe + b)} ${n(g.line)}`,
    ...(tail > 0 ? [`H${n(g.toe + b + tail)}`] : []),
    `V${n(g.foot)}`, `H${left}`, "Z",
  ].join(" ");
}

/** The brick's GLOW SOURCE: its rim, `g.thick` deep inside its edge, as one evenodd path (the outline and, inside
 *  it, the outline drawn in by the line's thickness). Owner, the same evening: "the glow doesnt look consistent
 *  throughout the whole thing, it looks like "*ASILUM" has a much more highlighted underline". A glow's strength
 *  follows how much white it comes off: the whole brick (and the line laid under it) glowed far brighter than the
 *  thin line. Its rim is as deep as the line is thick, and along the foot it is the line exactly, so the halo
 *  round the brick is the halo round the line. */
export function rimPath(g, { left = -RUN, tail = 0 } = {}) {
  const dx = g.toe - g.shoulder, dy = g.line - g.top, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, t = g.thick;
  const n = (v) => +v.toFixed(3);
  // the slant drawn in by t (its inward normal points down and to the left), met with the rim's top and foot
  const at = (y) => g.shoulder - t * uy + (y - g.top - t * ux) * (ux / uy);
  const inner = [`M${left} ${n(g.top + t)}`, `H${n(at(g.top + t))}`, `L${n(at(g.line))} ${n(g.line)}`, `H${left}`, "Z"].join(" ");
  return brickPath(g, { left, tail }) + " " + inner; // along the tail the rim is the whole foot: the line exactly
}

/** The logo's box: its left edge (the deck's line; the brick runs on past it), its top (the brick's, and a
 *  breath for the glow), its right end (the brick's: the end of the toe's bend, where the Masthead's line takes
 *  over). */
export function brickBox(g = brickGeometry()) {
  const x = 28, top = -16, end = Math.round((g.toe + g.bend) * 1000) / 1000;
  return { x, top, end, w: Math.round((end - x) * 1000) / 1000, h: Math.round((g.foot - top) * 1000) / 1000 };
}

/** How bold the cut word is: a stroke round each letter of the cut, in the logo's units (owner, 29 Oct 2026, the
 *  same evening: "make the font a little bolder and make the [text] negative, and keep the asterisk full and
 *  red"). Michroma has one weight; 5 units (2.5 a side) thickens its strokes by about a quarter. */
export const BOLD = 5;

/** Where the glow must not reach: the word's ink box, padded by the bold stroke and a breath, as a CSS clip-path
 *  polygon in percentages of the logo's box (evenodd: the whole plane but that window). The glow is the brick's
 *  own drop-shadow, which would otherwise fill the cut letters with white haze (the Tron mark's trouble, 28 Oct);
 *  the window sits wholly inside the brick, so outside it the white brick covers whatever glow lies beneath. */
/** The word's ink as fractions of the logo's box (x0, y0, x1, y1), padded by `pad` units: where the logo reads
 *  what is behind its letters (Wordmark.jsx, for the tint). */
export function wordFrac(box = brickBox(), word = WORD, pad = 0) {
  const fx = (v) => (v - box.x) / box.w, fy = (v) => (v - box.top) / box.h;
  return { x0: fx(word.aInk - pad), y0: fy(word.capsTop - pad), x1: fx(word.mInk + pad), y1: fy(word.base + pad) };
}

export function glowWindow(box = brickBox(), word = WORD, pad = BOLD / 2 + 2) {
  const px = (v) => `${+(((v - box.x) / box.w) * 100).toFixed(3)}%`;
  const py = (v) => `${+(((v - box.top) / box.h) * 100).toFixed(3)}%`;
  const x0 = px(word.aInk - pad), x1 = px(word.mInk + pad), y0 = py(word.capsTop - pad), y1 = py(word.base + pad);
  return `polygon(evenodd, -9999% -9999%, 9999% -9999%, 9999% 9999%, -9999% 9999%, -9999% -9999%, ${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}, ${x0} ${y0})`;
}

/** The TINT under the cut letters, in the logo's units past the cut's own stroke (owner, 29 Oct 2026: "tint the
 *  letters but i want the transition as smooth as possible, seamless, fast and reactive"). The letters are holes,
 *  so over a white card in light the word vanished. Under each hole lies the word again in a TRANSLUCENT dark
 *  (app/globals.css --wm-cut-tint), and the glass shows through it: white behind turns grey, the blue glass a deeper
 *  blue, a dark card stays dark — pixel by pixel, every frame, by plain compositing, no script and nothing to wait
 *  for. (A multiply was tried first and measured flat: inside the Masthead's glass a blend sees only the glass's
 *  own layer, never the page under it.) It reaches 2 units past the cut so the hole's soft edge always lies over it (the white brick covers
 *  the rest). */
export const TINT_BLEED = 2;
