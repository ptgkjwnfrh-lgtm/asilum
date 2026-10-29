"use client";

// app/components/Wordmark.jsx — THE WORDMARK. It left the shell's header
// when the header left (V.2 Blueprint, owner, 17 Oct 2026) and lived on the
// Feed's masthead; since 19 Oct 2026 it is a FIXTURE of its own (owner: "the
// *ASILUM logo becomes a fixture that permanently sits in the left hand
// corner"), mounted once by the Masthead (className "brandfix").
//
// THE NAME IS "*ASILUM" (owner, 17 Oct 2026: "when they type it in I just
// want it to look like *ASILUM"; "no more lower case i"). The asterisk and
// the six capitals are the whole name, everywhere — browser tab, social
// card, order mail, this component. tests/brand-name.test.js enforces it.
//
// THE LOGO OF 28 OCT 2026 (owner: "new logo, the asterisk should be in
// helvetica regular size font size 131 and "ASILUM" is in michroma regular
// size in font size 161 and tracking 5% with -15 kerning. the thick solid
// oblong white line should glow a stark white however the solid black text
// should not, the asterisk and the solid white line should have the same
// glow"; the numbers are Procreate's). Set as type, not an image, so it is
// sharp at every size — the artwork (docs/brand/asilum-logo-2026-10-28.jpg)
// measured, in the units of the word's 161: the capitals 120.75 tall (0.75em)
// on a baseline at 121; each letter's origin where the artwork puts it
// (Procreate's tracking and kerning come out at −15.5, −0.096em, between
// every pair); the asterisk at 131, its top on the capitals' line and its
// left edge on the A's; the bar flush under the baseline, 82.6 deep, from
// just left of the A (3.3) to 976.9 across — past the M, as drawn.
//
// THE LOGO OF 29 OCT 2026 (owner: "new logo with the masthead line intergated"; the reference is
// docs/brand/asilum-logo-2026-10-29.jpg, measured in lib/wordmark.js). The asterisk and the word sit wholly inside
// one white brick in the bar's glow, which runs on off the screen's left edge; at its right end the brick's top
// turns down in a slant — a shoulder, its bends rounded — to the line, as thick as drawn and flush with the brick's
// foot, and the Masthead's line carries on from there (.brandfix rests the foot on the line; the line takes the
// drawn thickness, --mh-line-h). The word is the artwork's black in both themes, unlit; the asterisk glows red.
// The word keeps its set (WM.set: 0.96 of the artwork's size, +40), from the evening before. (Before it, that
// evening: the word half over a brick, a Tron mark with an outline, a stem and a rise — replaced by this.)
//
// THE SAME EVENING (owner: "lets make the masthead line thinner and the lines under the buttons and make the whole
// thing flush it doesnt look flush and connected. and lets make the font a little bolder and make the [text]
// negative, and keep the asterisk full and red"): the line is thinner (lib/wordmark.js LINE, and the brick's line
// with it, the slant kept); the word is CUT OUT of the brick, the Masthead's glass showing through, a little bolder
// (BOLD, a stroke round each letter of the cut); the asterisk stays whole and red over the brick.
//
// Then (owner, circling the toe: "i still want the button breaks, make the circled area flush the curve kind of
// looks jagged and the glow doesnt look consistent throughout the whole thing, it looks like "*ASILUM" has a much
// more highlighted underline, make the glow consistent"): the bends wider (BEND); the brick ends where its toe's
// curve lands on the line and the Masthead's line starts there (it ran on under the whole brick, its glow on top
// of the brick's); and the glow comes off the brick's rim, as deep as the line is thick (rimPath), not off the
// whole slab — so the halo is the line's halo all the way round.
//
// Three layers on one box: the glow (the brick's rim in --wm-glow, the stark white of the Masthead's line, clipped
// away from the word's window so no haze fills the letters — glowWindow); the brick, unlit, the word cut out of it
// by a mask; and the asterisk, glowing red (--wm-glow-r, the same radii in the asterisk's own red).

import { useId } from "react";
import { brickGeometry, brickPath, rimPath, brickBox, glowWindow, BOLD, RUN } from "../../lib/wordmark.js";

/** The artwork's geometry, in the units of the word's 161 (measured 28 Oct 2026). */
export const WM = Object.freeze({
  word: 161, star: 131, cap: 120.75, base: 121,
  x: Object.freeze([0, 155.2, 307.7, 337.7, 453, 604.3]), // A S I L U M, each origin
  starY: 94.2, // Helvetica's asterisk stands 0.717em above its baseline: its top on the capitals' line
  // the asterisk and the word: a touch smaller (s), a little to the right (dx), scaled about (0, 60.625)
  set: Object.freeze({ s: 0.96, dx: 40 }),
});
const SET = `translate(${WM.set.dx} ${+(60.625 * (1 - WM.set.s)).toFixed(4)}) scale(${WM.set.s})`;
const BRICK = brickGeometry();
const BOX = brickBox(BRICK);
const VIEW = `${BOX.x} ${BOX.top} ${BOX.w} ${BOX.h}`;
const PATH = brickPath(BRICK);
const RIM = rimPath(BRICK);
const WINDOW = glowWindow(BOX);
// the mask's plane: the brick's whole run and the box, with room
const PLANE = { x: -RUN - 100, y: BOX.top - 100, w: RUN + BOX.end + 200, h: BOX.h + 200 };

export default function Wordmark({ href = "/", className = "" }) {
  const cut = "wmc" + useId().replace(/:/g, "");
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmart" aria-hidden="true">
        <svg className="wmlit wmglow" viewBox={VIEW} focusable="false" style={{ clipPath: WINDOW }}>
          <path className="wmbar" d={RIM} fillRule="evenodd" />
        </svg>
        <svg className="wmbrick" viewBox={VIEW} focusable="false">
          <defs>
            <mask id={cut} maskUnits="userSpaceOnUse" x={PLANE.x} y={PLANE.y} width={PLANE.w} height={PLANE.h}>
              <rect className="wmplane" x={PLANE.x} y={PLANE.y} width={PLANE.w} height={PLANE.h} />
              <g transform={SET}><text className="wmcut" x={WM.x.join(" ")} y={WM.base} strokeWidth={BOLD / WM.set.s}>ASILUM</text></g>
            </mask>
          </defs>
          <path className="wmbar" d={PATH} mask={`url(#${cut})`} />
        </svg>
        <svg className="wmlit wmlitstar" viewBox={VIEW} focusable="false">
          <g transform={SET}><text className="wmstar" x="0" y={WM.starY}>*</text></g>
        </svg>
      </span>
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
