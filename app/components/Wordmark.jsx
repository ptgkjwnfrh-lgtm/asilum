"use client";

import { useId } from "react";

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
// THE WORD ON THE BRICK (owner, 28 Oct 2026, last: "*ASILUM lets isolate that and move it down so its fully
// overtop of the glowing white brick", then "i want half of the asilum text to be sticking half way over the
// brick, and the brick should sit overtop the masthead line"): the bar's top edge on the capitals' middle, so
// the word's lower half stands on the bar and its upper half above it. The bar is drawn first, the asterisk
// (above the bar) and the word over it. The word is set twice, cut at the white: off it in the theme's ink
// (the artwork's black in light; white in dark — owner, the same day: "for dark mode lets make the logo white
// instead of green"), on it in the artwork's black — so every part reads in either theme. The Masthead rests
// the bar on its line (.brandfix: "move the brick up, i want it to sit ontop of the mast head line").
//
// THE STEM (owner, the same day: "on the left side of the brick i want a line to steam from the brick going
// upawards, the line should be thick enough to where the asterisk has the lines white background to be
// visible on"): from the bar's left end straight up, flush with it, as wide as the asterisk's ink and a
// margin (its ink measured in Chromium at 131px Helvetica: x 4 to 46, y -0.8 to 38.2), to a margin above the
// asterisk's top; one white shape with the bar, in the bar's glow, the red asterisk on it. Where the A's leg
// crosses it, the leg takes the black, as on the bar.
//
// Three layers on one box: the bar first (see THE WORD ON THE BRICK); the asterisk, glowing red (owner, the same day:
// "the asterisk must glow red" — the bar's glow, the same radii, in the
// asterisk's own red, --wm-glow-r); the bar, glowing the stark white of the
// Masthead's line (--wm-glow); and the type over them, which does not glow
// at all — the S's round foot laps the bar, as in the artwork.

/** The artwork's geometry, in the units of the word's 161 (measured 28 Oct 2026). */
export const WM = Object.freeze({
  word: 161, star: 131, cap: 120.75, base: 121,
  x: Object.freeze([0, 155.2, 307.7, 337.7, 453, 604.3]), // A S I L U M, each origin
  starY: 94.2, // Helvetica's asterisk stands 0.717em above its baseline: its top on the capitals' line
  // the bar's top on the capitals' middle (121 - 120.75 / 2): the word half over it
  bar: Object.freeze({ x: 3.3, w: 976.9, h: 82.6, y: 60.625 }),
  // the stem up from the bar's left end: the asterisk's ink (4..46 across, -0.8..38.2 down) with ~9 to spare
  stem: Object.freeze({ x: 3.3, w: 52, y: -10 }),
  top: -10, // the mark's highest edge: the stem's top
  // the bar's foot (60.625 + 82.6), the mark's lowest edge: it rests on the Masthead's line
  foot: 143.225,
});
const VIEW = `${WM.bar.x} ${WM.top} ${WM.bar.w} ${WM.foot - WM.top}`;
// the white, as one shape: the stem and the bar
const STEM_H = WM.bar.y - WM.stem.y;

export default function Wordmark({ href = "/", className = "" }) {
  const id = useId().replace(/:/g, "");
  const above = "wma" + id, on = "wmo" + id;
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmart" aria-hidden="true">
        <svg className="wmlit wmlitbar" viewBox={VIEW} focusable="false">
          <rect className="wmbar" x={WM.bar.x} y={WM.bar.y} width={WM.bar.w} height={WM.bar.h} />
          <rect className="wmbar wmstem" x={WM.stem.x} y={WM.stem.y} width={WM.stem.w} height={STEM_H + 1} />
        </svg>
        <svg className="wmlit wmlitstar" viewBox={VIEW} focusable="false">
          <text className="wmstar" x="0" y={WM.starY}>*</text>
        </svg>
        <svg className="wmtype" viewBox={VIEW} focusable="false">
          <defs>
            {/* off the white: everything but the bar's band and the stem */}
            <mask id={above} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="600">
              <rect x="-200" y="-200" width="1400" height="600" fill="#fff" />
              <rect x="-200" y={WM.bar.y} width="1400" height="400" fill="#000" />
              <rect x={WM.stem.x} y={WM.stem.y} width={WM.stem.w} height={STEM_H + 1} fill="#000" />
            </mask>
            {/* on the white: the bar's band and the stem */}
            <clipPath id={on}>
              <rect x="-200" y={WM.bar.y} width="1400" height="400" />
              <rect x={WM.stem.x} y={WM.stem.y} width={WM.stem.w} height={STEM_H + 1} />
            </clipPath>
          </defs>
          <text className="wmink" mask={`url(#${above})`} x={WM.x.join(" ")} y={WM.base}>ASILUM</text>
          <text className="wmink wmonbar" clipPath={`url(#${on})`} x={WM.x.join(" ")} y={WM.base}>ASILUM</text>
        </svg>
      </span>
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
