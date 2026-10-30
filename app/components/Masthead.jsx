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
// masthead should be replaced by a solid thin white glowing line"; then "the
// line … should reach to the end of the hit box of the passport button. also
// the line should sit under the thick logo line … the stretched mast head
// line should break at the gap points of the buttons and there should be
// faint lines in between the buttons like on the center fixture"): one thin
// white line in the logo's white glow, a breath under the logo's bar, from
// the logo's brick (since 29 Oct 2026 from where the brick ends, the toe's
// curve; it ran under the whole brick before) to the Passport's hit box,
// broken where two keys' hit boxes meet (and where the first key begins); between two keys stands
// a faint cut, the deck's own hairline. The keys are measured (the music
// circle and the exploring key come and go), so lib/mastline.js lays the
// stretches; the line fades in once it is laid. It replaced the stamped
// line of graduated blocks (26 Oct).

import { useLayoutEffect, useRef, useState } from "react";
import { useLiquidGlass, useGlassLamps, FIXTURE_BEND } from "./LiquidGlass.jsx";
import Wordmark from "./Wordmark.jsx";
import InfoDock from "./InfoDock.jsx";
import PassportButton from "./PassportButton.jsx";
import { mastLine, sameLine } from "../../lib/mastline.js";
import { brickBox } from "../../lib/wordmark.js";

const BOX_W = brickBox().w; // the logo's box, in its units

// a strip: the bottom is the only real edge of the glass (module constant — the glass hook's effect keys on it)
export const MASTHEAD_OPEN = Object.freeze({ top: false, right: false, bottom: true, left: false });

// the line laid under the logo and the keys, re-laid whenever the keys' row or the bar changes size
function useMastLine(ref) {
  const [line, setLine] = useState(null);
  useLayoutEffect(() => {
    const mast = ref.current;
    const row = mast && mast.querySelector(".mhkeys");
    if (!row) return undefined;
    let raf = 0;
    const lay = () => {
      raf = 0;
      // the boxes on the Masthead, to the sub-pixel (the line ends exactly on the globe's hit box); a key
      // is measured by its layout width (unrounded), so a pressed key's hinge cannot narrow it
      const o = mast.getBoundingClientRect().left;
      const box = (el) => { const r = el.getBoundingClientRect(), mid = (r.left + r.right) / 2 - o, w = parseFloat(getComputedStyle(el).width) || el.offsetWidth; return { left: mid - w / 2, right: mid + w / 2 }; };
      // the line starts where the brick ends — its box's right edge is the end of the toe's curve (29 Oct 2026,
      // "make the circled area flush"; lib/wordmark.js brickBox). Its first stretch, from there to the first key, is
      // drawn by the logo as the brick's own foot (the TAIL, in the logo's units: lib/wordmark.js brickPath) — one
      // white and one glow round the toe; two pieces meeting there, however tucked, left a seam ("it still looks
      // jagged", the same evening) — and this line begins at the first break
      const art = mast.querySelector(".brandfix .wmart"), ar = art ? art.getBoundingClientRect() : null;
      const keys = [...row.querySelectorAll(".idkey, .passportbtn")].filter((k) => k.offsetWidth > 0).map(box);
      const laid = mastLine(ar ? ar.right - o : NaN, keys);
      const first = laid.segs[0] && laid.segs[0].gl === 0 ? laid.segs[0] : null;
      const probe = mast.querySelector(".mhbrk"), brk = probe ? probe.getBoundingClientRect().width : 0;
      const tail = first && ar && ar.width > 0 ? Math.max(0, first.b - first.a - (first.gr ? brk / 2 : 0)) * (BOX_W / ar.width) : 0;
      const next = { ...laid, segs: first ? laid.segs.slice(1) : laid.segs, tail };
      setLine((prev) => (sameLine(prev, next) && Math.abs((prev.tail || 0) - tail) < 0.5 ? prev : next));
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(lay); };
    lay();
    const ro = new ResizeObserver(wake);
    ro.observe(mast); ro.observe(row);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [ref]);
  return line;
}

export default function Masthead({ kind, pathname }) {
  const glassRef = useRef(null);
  const glass = useLiquidGlass(glassRef, { id: "lg-masthead", strength: 1, open: MASTHEAD_OPEN, bend: FIXTURE_BEND, bezel: "fixture", shine: false });
  useGlassLamps(glassRef);
  const line = useMastLine(glassRef);
  return (
    <header ref={glassRef} className="masthead fixture">
      {glass}
      <Wordmark className="brandfix" tail={line ? line.tail : 0} />
      <span className={"mhline" + (line ? " on" : "")} aria-hidden="true">
        {line ? line.segs.map((g, i) => <i key={i} style={{ "--a": `${g.a}px`, "--b": `${g.b}px`, "--gl": g.gl, "--gr": g.gr }} />) : null}
      </span>
      <span className="mhbrk" aria-hidden="true" />
      <span className="mhcuts" aria-hidden="true">
        {line ? line.cuts.map((c, i) => <i key={i} style={{ "--x": `${c}px` }} />) : null}
      </span>
      <div className="mhkeys">
        <InfoDock />
        <PassportButton kind={kind} pathname={pathname} />
      </div>
    </header>
  );
}
