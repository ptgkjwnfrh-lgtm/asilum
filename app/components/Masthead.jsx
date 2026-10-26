"use client";

// app/components/Masthead.jsx — THE MASTHEAD (owner, 26 Oct 2026: "I kind of
// miss the liquid glass full-length header, let's add it so the logo can sit
// on it and the infodeck can be taken away leaving just the buttons"). One
// pane of the September glass the whole width of the page, flush with the
// top: the *ASILUM wordmark sits on it at the left, in line with the deck's
// left edge, and the keys — LIKES · BAG · NOTICES and the Passport's globe —
// sit on it bare at the right, in line with the deck's right edge. The Info
// Dock and the Passport Button lost their own glass to it: they are buttons
// on this bar now, not panes. Only the V.1 strip comes back — no ticker, no
// nav row (the Feed is the root; the deck navigates).
//
// The glass is the fixtures' own: the same near-clear fill and tint, no
// blur, no rainbow rim, and the fixtures' rainbow in the bend — a split a
// little wider than the other glass (FIXTURE_PULL, 26 Oct 2026). Only the
// bottom edge is an edge of the glass
// (top, left and right are flush with the screen), so only it lenses, and on
// Safari the page bends under that edge alone. The lamp under the water
// follows the current key along the bar.
//
// THE STAMPED LINE (owner, 26 Oct 2026, the reference "4.jpg", Ref 2, then
// "from thinner to larger"): the bar of blocks that sat under the word in
// the artwork runs the length of the Masthead instead, pressed into the
// glass — from the left edge of the A (not the asterisk) to the Passport's
// globe. Graduated, left to right: three small and a large, four times,
// each group a size up (small ½ → ¾ → 1 → 1¼, each large twice its group's
// small), every gap 0.45; the last large block, blue, centred under the
// globe. The columns are fractions, so the pattern fills its span exactly at
// every width. The word's masks carry no bar (public/model/logo-word-ink.png,
// logo-word-light.png — renamed from logo-ink / logo-light when the bar was
// cut, so no cached copy of the old artwork can draw it under the word).

import { useRef } from "react";
import { useLiquidGlass, useGlassLamps, FIXTURE_BEND } from "./LiquidGlass.jsx";
import Wordmark from "./Wordmark.jsx";
import InfoDock from "./InfoDock.jsx";
import PassportButton from "./PassportButton.jsx";

// a strip: the bottom is the only real edge of the glass (module constant — the glass hook's effect keys on it)
export const MASTHEAD_OPEN = Object.freeze({ top: false, right: false, bottom: true, left: false });
// left to right: four groups of three small and one large, each group a size up; the last is the blue one under the globe
export const STAMP_SMALL = Object.freeze([0.5, 0.75, 1, 1.25]);
export const STAMP = Object.freeze(STAMP_SMALL.flatMap((s) => [s, s, s, 2 * s]));
export const STAMP_GAP = 0.45;
// the grid: a bar, a gap, … ; the last bar's column is half its length (the line ends on the globe's
// centre, and the blue block, twice its column, is centred there)
export const STAMP_COLUMNS = STAMP.map((w, i) => (i === STAMP.length - 1 ? `${w / 2}fr` : `${w}fr ${STAMP_GAP}fr`)).join(" ");

export default function Masthead({ kind, pathname }) {
  const glassRef = useRef(null);
  const glass = useLiquidGlass(glassRef, { id: "lg-masthead", strength: 1, open: MASTHEAD_OPEN, bend: FIXTURE_BEND, bezel: "fixture", shine: false });
  useGlassLamps(glassRef);
  return (
    <header ref={glassRef} className="masthead fixture">
      {glass}
      <Wordmark className="brandfix" />
      <span className="mhstamp" aria-hidden="true" style={{ gridTemplateColumns: STAMP_COLUMNS }}>
        {STAMP.map((w, i) => <i key={i} className={i === STAMP.length - 1 ? "lit" : undefined} style={{ gridColumn: 2 * i + 1 }} />)}
      </span>
      <div className="mhkeys">
        <InfoDock />
        <PassportButton kind={kind} pathname={pathname} />
      </div>
    </header>
  );
}
