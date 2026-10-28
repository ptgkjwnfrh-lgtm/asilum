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
// Three layers on one box: the asterisk, glowing red (owner, the same day:
// "the asterisk must glow red" — the bar's glow, the same radii, in the
// asterisk's own red, --wm-glow-r); the bar, glowing the stark white of the
// Masthead's line (--wm-glow); and the type over them, which does not glow
// at all — the S's round foot laps the bar, as in the artwork.

/** The artwork's geometry, in the units of the word's 161 (measured 28 Oct 2026). */
export const WM = Object.freeze({
  word: 161, star: 131, cap: 120.75, base: 121,
  x: Object.freeze([0, 155.2, 307.7, 337.7, 453, 604.3]), // A S I L U M, each origin
  starY: 94.2, // Helvetica's asterisk stands 0.717em above its baseline: its top on the capitals' line
  bar: Object.freeze({ x: 3.3, w: 976.9, h: 82.6 }),
});
const VIEW = `${WM.bar.x} 0 ${WM.bar.w} ${+(WM.base + WM.bar.h).toFixed(1)}`;

export default function Wordmark({ href = "/", className = "" }) {
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmart" aria-hidden="true">
        <svg className="wmlit wmlitstar" viewBox={VIEW} focusable="false">
          <text className="wmstar" x="0" y={WM.starY}>*</text>
        </svg>
        <svg className="wmlit wmlitbar" viewBox={VIEW} focusable="false">
          <rect className="wmbar" x={WM.bar.x} y={WM.base} width={WM.bar.w} height={WM.bar.h} />
        </svg>
        <svg className="wmtype" viewBox={VIEW} focusable="false">
          <text className="wmink" x={WM.x.join(" ")} y={WM.base}>ASILUM</text>
        </svg>
      </span>
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
