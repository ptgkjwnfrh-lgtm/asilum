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
// Then: "tint the letters but i want the transition as smooth as possible, seamless, fast and reactive", and, the
// tint on everywhere, "i still wanted the negative logo to be see through however i wanted it to be seemlessly
// reactive to tint once passing over a really bright card". Under the cut lies the word again in a translucent
// dark (.wmtint, lib/wordmark.js TINT_BLEED), shown ONLY where a really bright card lies behind the letters: each
// scroll frame the logo reads the bright cards in the band behind its word (InkWatch.jsx brightBoxes) and clips the tint
// to the bright cards' own boxes (lib/ink.js tintClip), so the tint's edge rides the card's edge in and out. Over
// the glass and everything else the letters stay see-through. In dark the tint is clear.
//
// Four layers on one box: the glow (the brick's rim in --wm-glow, the stark white of the Masthead's line, clipped
// away from the word's window so no haze fills the letters — glowWindow); the brick, unlit, the word cut out of it
// by a mask, the tint showing through it; and the asterisk, glowing red (--wm-glow-r, the same radii in the asterisk's own red).

import { useEffect, useId, useRef } from "react";
import { brickGeometry, brickPath, rimPath, brickBox, glowWindow, wordFrac, BOLD, RUN, TINT_BLEED } from "../../lib/wordmark.js";
import { TINT_BRIGHT, TINT_NONE, tintClip, INK_ZONES } from "../../lib/ink.js";
import { brightBoxes, forgetGrounds } from "./InkWatch.jsx";
import { subscribeFrame, requestFrame } from "../../lib/frame.js";

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

// the tint follows the bright cards behind the word: read on every scroll frame (and on a resize, a load, a
// settle, a theme turn), written only when it changes; nothing in dark, where the tint is clear
const WORD_AT = wordFrac(BOX);
function useCutTint(artRef, tintRef) {
  useEffect(() => {
    const art = artRef.current, tint = tintRef.current;
    if (!art || !tint) return undefined;
    let last = "";
    // THE BAND BEHIND THE WORD (29 Oct 2026, "checking the tracking"): the candidates — the cards, the BRDCSTs and
    // the blocks the ink watcher reads — that lie behind the word are kept by an IntersectionObserver whose root is
    // that band, worked out off the main thread; a frame reads only their boxes (InkWatch.jsx brightBoxes), with no
    // hit test (eight a frame cost 2.9ms of 3.0 at 375px). The logo is on the fixed Masthead, so the band is fixed;
    // it is measured again on a resize.
    const CANDS = [".card", ".brdcst", ".f20card", ...INK_ZONES].join(", "); // (Figure 20's cards are white frames of their own)
    const inBand = new Set();
    let io = null, band = null;
    const measure = () => {
      const a = art.getBoundingClientRect();
      band = { left: a.left + a.width * WORD_AT.x0, top: a.top + a.height * WORD_AT.y0, right: a.left + a.width * WORD_AT.x1, bottom: a.top + a.height * WORD_AT.y1 };
      if (io) io.disconnect();
      inBand.clear();
      // the observer's band reaches LEAD px past the word both ways: its news comes after a frame is drawn, so a card
      // is known before it reaches the word (measured: at the word's own band, 9 frames in 400 missed a card arriving)
      const LEAD = 100;
      const above = Math.max(0, band.top - LEAD), below = Math.max(0, window.innerHeight - band.bottom - LEAD);
      io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) inBand.add(e.target); else inBand.delete(e.target); } requestFrame(); }, { rootMargin: `-${above.toFixed(1)}px 0px -${below.toFixed(1)}px 0px` });
      document.querySelectorAll(CANDS).forEach((el) => io.observe(el));
    };
    measure();
    let mr = 0;
    const more = new MutationObserver(() => { if (!mr) mr = requestAnimationFrame(() => { mr = 0; if (io) document.querySelectorAll(CANDS).forEach((el) => io.observe(el)); }); });
    more.observe(document.body, { childList: true, subtree: true });
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(measure, 150); };
    window.addEventListener("resize", onResize);
    // in the one frame (lib/frame.js): read the bright boxes in the band, then write the clip. The theme is read off
    // the page's attribute (dark's tint is clear), never by a computed style
    const off = subscribeFrame({
      name: "logo-tint",
      read() {
        if (document.documentElement.dataset.theme !== "light" || !inBand.size || !band) return TINT_NONE;
        return tintClip(art.getBoundingClientRect(), brightBoxes(inBand, band, TINT_BRIGHT));
      },
      write(v) { if (v != null && v !== last) { last = v; tint.style.clipPath = v; } },
    });
    const ask = requestFrame;
    document.addEventListener("load", ask, true);
    document.addEventListener("f20settle", ask);
    const theme = new MutationObserver(() => { forgetGrounds(); ask(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", ask);
    return () => {
      off(); if (io) io.disconnect(); more.disconnect(); if (mr) cancelAnimationFrame(mr);
      window.removeEventListener("resize", onResize); clearTimeout(rt);
      document.removeEventListener("load", ask, true);
      document.removeEventListener("f20settle", ask);
      theme.disconnect(); mq.removeEventListener("change", ask);
    };
  }, [artRef, tintRef]);
}

export default function Wordmark({ href = "/", className = "" }) {
  const cut = "wmc" + useId().replace(/:/g, "");
  const artRef = useRef(null), tintRef = useRef(null);
  useCutTint(artRef, tintRef);
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span ref={artRef} className="wmart" aria-hidden="true">
        <svg className="wmlit wmglow" viewBox={VIEW} focusable="false" style={{ clipPath: WINDOW }}>
          <path className="wmbar" d={RIM} fillRule="evenodd" />
        </svg>
        <svg ref={tintRef} className="wmtint" viewBox={VIEW} focusable="false">
          <g transform={SET}><text className="wmtintink" x={WM.x.join(" ")} y={WM.base} strokeWidth={(BOLD + TINT_BLEED) / WM.set.s}>ASILUM</text></g>
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
