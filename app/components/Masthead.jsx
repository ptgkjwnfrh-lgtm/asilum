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
// blur, no rainbow: the bend moves every colour alike (26 Oct 2026). Only the
// bottom edge is an edge of the glass
// (top, left and right are flush with the screen), so only it lenses, and on
// Safari the page bends under that edge alone. The lamp under the water
// follows the current key along the bar.
//
// THE LINE (owner, 28 Oct 2026: "the broken line that stretches across the
// masthead should be replaced by a solid thin white glowing line"): one solid
// thin white line, glowing with the logo's own white glow (--wm-glow), runs
// on from the end of the logo's bar to the Passport's globe, its top on the
// word's baseline — the bar's top — so the logo's line and the Masthead's are
// one edge. It replaced the stamped line of graduated blocks (26 Oct).

import { useRef } from "react";
import { useLiquidGlass, useGlassLamps, FIXTURE_BEND } from "./LiquidGlass.jsx";
import Wordmark from "./Wordmark.jsx";
import InfoDock from "./InfoDock.jsx";
import PassportButton from "./PassportButton.jsx";

// a strip: the bottom is the only real edge of the glass (module constant — the glass hook's effect keys on it)
export const MASTHEAD_OPEN = Object.freeze({ top: false, right: false, bottom: true, left: false });

export default function Masthead({ kind, pathname }) {
  const glassRef = useRef(null);
  const glass = useLiquidGlass(glassRef, { id: "lg-masthead", strength: 1, open: MASTHEAD_OPEN, bend: FIXTURE_BEND, bezel: "fixture", shine: false });
  useGlassLamps(glassRef);
  return (
    <header ref={glassRef} className="masthead fixture">
      {glass}
      <Wordmark className="brandfix" />
      <span className="mhline" aria-hidden="true" />
      <div className="mhkeys">
        <InfoDock />
        <PassportButton kind={kind} pathname={pathname} />
      </div>
    </header>
  );
}
