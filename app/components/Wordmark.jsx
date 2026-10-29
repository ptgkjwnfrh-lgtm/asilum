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
// ink, on it in the bar's — the artwork's black, both, in light; one darker green, both, in dark (owner, the same
// day: "go back to green but … a darker green so its ledgible i dont want there to be a odd cross section"). The
// Masthead rests the bar on its line (.brandfix: "move the brick up, i want it to sit ontop of the mast head
// line"). (A stem rose from the bar's left end behind the asterisk for a while that day; then "forget the left
// side asterisk" — it is gone.)
//
// THE SET (the same day: "lets inside ever ever so slightly lower font size and move "*ASILUM" a bit to the
// right"): the asterisk and the word together at WM.set.s of the artwork's size, scaled about their left edge
// on the bar's top, so half the capitals still stand over the bar, and moved WM.set.dx along it.
//
// THE TRON MARK, DARK ONLY (the same day: "lets mimic the tron logo just for dark mode, there should be a
// outline as thick as the font that outlines the top of the text now there should negative space in the brick
// where the font would be and now we can ad back the asterisk line and make sure its connected with the
// outline"): one white shape in the bar's glow — the bar, the word stroked WM.tron.t wide (Michroma's own
// stroke: its I measured 15 wide at 161, its L's bar 13), and the asterisk's stem — with the six letters cut
// out of it. On the bar the letters are holes; above it each is ringed by an outline as thick as its strokes;
// the stem rises from the bar under the asterisk, flush with the bar's left end, into the A's outline, so the red
// asterisk sits on the white; a tip fills the notch the outline's round corner left at the A's flat top.
// Light keeps the word on the brick (above); the CSS shows one mark or the other by theme.
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
  // the dark mark (THE TRON MARK): the outline's thickness in the word's units (Michroma's stroke, 13 to 15);
  // the asterisk's stem in the frame, flush with the bar's left end and the Masthead's line (owner, the same
  // day: "make it flush with the line"), past the asterisk's ink (set: 43.8 to 84.2) into the A's outline,
  // from the outline's top (the capitals' top less the outline, set) down into the bar; and the tip, closing
  // the notch the outline's round corner left between the stem and the A's flat top ("that little gap of the
  // tip of the a and the line lets close that"): from the stem to the A's top-left corner (Michroma: the
  // apex's top runs 74 to 96 at 161, set 111.04), from the outline's top down to the capitals' top
  tron: Object.freeze({
    t: 14,
    stem: Object.freeze({ x: 3.3, w: 96.7, y: -10.775 }),
    tip: Object.freeze({ x: 99, w: 12.04, h: 13.44 }),
  }),
  top: -12, // the mark's highest edge: the outline's top, and a breath
});
const VIEW = `${WM.bar.x} ${WM.top} ${WM.bar.w} ${WM.foot - WM.top}`;
const STEM = WM.tron.stem, TIP = WM.tron.tip;
const SET = `translate(${WM.set.dx} ${+(WM.bar.y * (1 - WM.set.s)).toFixed(4)}) scale(${WM.set.s})`;

export default function Wordmark({ href = "/", className = "" }) {
  const id = useId().replace(/:/g, "");
  const above = "wma" + id, on = "wmo" + id, knock = "wmk" + id;
  const word = (cls) => <g transform={SET}><text className={cls} x={WM.x.join(" ")} y={WM.base}>ASILUM</text></g>;
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmart" aria-hidden="true">
        <svg className="wmlit wmlitbar" viewBox={VIEW} focusable="false">
          <rect className="wmbar" x={WM.bar.x} y={WM.bar.y} width={WM.bar.w} height={WM.bar.h} />
        </svg>
        {/* dark: the bar, the stem and the word's outline as one white shape, the letters cut out of it */}
        <svg className="wmlit wmtron" viewBox={VIEW} focusable="false">
          <defs>
            <mask id={knock} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1600" height="600">
              <rect x="-200" y="-200" width="1600" height="600" fill="#fff" />
              {word("wmink wmknock")}
            </mask>
          </defs>
          <g mask={`url(#${knock})`}>
            <rect className="wmbar" x={WM.bar.x} y={WM.bar.y} width={WM.bar.w} height={WM.bar.h} />
            <rect className="wmbar" x={STEM.x} y={STEM.y} width={STEM.w} height={WM.bar.y - STEM.y + 1} />
            <rect className="wmbar" x={TIP.x} y={STEM.y} width={TIP.w} height={TIP.h} />
            {word("wmink wmoutline")}
          </g>
        </svg>
        {/* the holes kept dark: the glow reaches into a stroke barely 2px wide on a phone and greyed it, so the
            letters are laid back over their holes in the dark ground, unlit (measured 28 Oct 2026, the 5x proof) */}
        <svg className="wmtronink" viewBox={VIEW} focusable="false">{word("wmink wmhole")}</svg>
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
