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
// (above the bar) and the word over it. The word is set twice, cut at the bar's top: above it in the theme's
// ink, on it in the bar's — the artwork's black, both, in light; white, both, in dark (owner, the same day: "just
// make the text all white", white on the bar too, by their choice; before, red, white and the phosphor mint). The
// Masthead rests the bar on its line (.brandfix: "move the brick up, i want it to sit ontop of the mast head
// line"). (A stem rose from the bar's left end behind the asterisk for a while that day; then "forget the left
// side asterisk" — it is gone.)
//
// THE SET (the same day: "lets inside ever ever so slightly lower font size and move "*ASILUM" a bit to the
// right"): the asterisk and the word together at WM.set.s of the artwork's size, scaled about their left edge
// on the bar's top, so half the capitals still stand over the bar, and moved WM.set.dx along it.
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
  // the bar's foot (60.625 + 82.6), the mark's lowest edge: it rests on the Masthead's line
  foot: 143.225,
  // the asterisk and the word: a touch smaller (s), a little to the right (dx, in these units), scaled about
  // (0, the bar's top) so their middle stays on the bar's edge
  set: Object.freeze({ s: 0.96, dx: 40 }),
});
const VIEW = `${WM.bar.x} 0 ${WM.bar.w} ${WM.foot}`;
const SET = `translate(${WM.set.dx} ${+(WM.bar.y * (1 - WM.set.s)).toFixed(4)}) scale(${WM.set.s})`;

export default function Wordmark({ href = "/", className = "" }) {
  const id = useId().replace(/:/g, "");
  const above = "wma" + id, on = "wmo" + id;
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmart" aria-hidden="true">
        <svg className="wmlit wmlitbar" viewBox={VIEW} focusable="false">
          <rect className="wmbar" x={WM.bar.x} y={WM.bar.y} width={WM.bar.w} height={WM.bar.h} />
        </svg>
        <svg className="wmlit wmlitstar" viewBox={VIEW} focusable="false">
          <g transform={SET}><text className="wmstar" x="0" y={WM.starY}>*</text></g>
        </svg>
        <svg className="wmtype" viewBox={VIEW} focusable="false">
          <defs>
            <clipPath id={above}><rect x="-200" y="-200" width="1400" height={200 + WM.bar.y} /></clipPath>
            <clipPath id={on}><rect x="-200" y={WM.bar.y} width="1400" height="400" /></clipPath>
          </defs>
          {/* the cut is the frame's, outside the set's scale: the bar's top, wherever the letters stand */}
          <g clipPath={`url(#${above})`}><g transform={SET}><text className="wmink" x={WM.x.join(" ")} y={WM.base}>ASILUM</text></g></g>
          <g clipPath={`url(#${on})`}><g transform={SET}><text className="wmink wmonbar" x={WM.x.join(" ")} y={WM.base}>ASILUM</text></g></g>
        </svg>
      </span>
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
