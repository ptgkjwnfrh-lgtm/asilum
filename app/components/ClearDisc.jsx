"use client";

// app/components/ClearDisc.jsx — THE CLEAR DISC (owner, 27 Oct 2026: "you
// see the rainbow effect from this version of asilum, i want this rainbow
// effect to be added to only the disc so the disc kind of looks like the
// yeezus album cover, obviously no red tape, but the cards on the feed would
// refract causing the rainbow warp effect mimicking the yeezus cover"; the
// references: V.1's FRONT COVER, whose glass strip split the letters beneath
// it into cyan / red / yellow fringes, and the cover's clear CD).
//
// The dark disc in the deck's slot (.ccspindle, the wheel's centre) becomes
// a clear CD: a silver face with spectral spokes turning off its middle, a
// clear hub ringed in black, a thin clear rim. And it is a LENS: whatever
// passes under it — a Feed card scrolling beneath the deck — is bent with
// the colours parted, red, green and blue each pulled its own distance
// (PRISM), the V.1 strip's split. THE ONLY GLASS THAT PARTS THE COLOURS:
// every other pane bends every colour alike (LiquidGlass.jsx, PULL; owner,
// 26 Oct: "take away the rainbow"), and tests/v2-fixtures-sketch.test.js
// fails if the split or the spectrum reaches any other glass.
//
// Why a layer of its own on <body>: the deck's glass is a backdrop-filter,
// which makes the deck a Backdrop Root — a backdrop-filter INSIDE it sees
// only the deck's own paint, never the Feed. So the lens is a fixed layer
// one level above the deck, kept on the dark disc's circle, pointer-events
// none (the disc under it is still the button). The split stays inside the
// circle: Chromium clips a backdrop-filter to the border radius, and the
// map is still (128) outside the circle on the Safari path, where the cards
// themselves are bent (createPageBend, the disc's prism chain).
// Reduced motion: the spokes hold still, the disc does not grow.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canRefract, drawRefractionMap, createPageBend, FIXTURE_BEND } from "./LiquidGlass.jsx";

export const DISC_ID = "lg-cd";
/** The green pull, as a share of the disc's diameter (the bend's whole
 *  depth is half the scale): the lens is the whole face, clear at the hub. */
export const DISC_PULL = 0.24;
/** THE PRISM: red, green and blue each pulled its own distance — the split
 *  that parts a card's edges into rainbow. The Disc's alone. */
export const PRISM = Object.freeze({ r: 0.42, g: 1, b: 1.58 });
/** How far the spokes turn: degrees per degree of the wheel, per px scrolled. */
export const SPOKE_TURN = Object.freeze({ wheel: 0.5, scroll: 0.08 });
// one channel kept, at full alpha (the three are summed after)
const ONLY = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};
const CH = ["r", "g", "b"];
export const prismScales = (w) => Object.fromEntries(CH.map((c) => [c, +(w * DISC_PULL * PRISM[c]).toFixed(1)]));

// The Safari path's chain: the card bent three times, once a colour, inside
// the disc's square (data-pb); outside it the card passes through untouched.
function prismChain(scales) {
  return (imgId, webkit) => `<feFlood flood-color="rgb(128,128,128)" result="flat"/>` +
    (webkit ? `<feImage href="#${imgId}" result="pane"/>` : `<feImage preserveAspectRatio="none" result="pane"/>`) +
    `<feComposite in="pane" in2="flat" operator="over" result="map"/>` +
    CH.map((c) => `<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="${scales[c]}" xChannelSelector="R" yChannelSelector="G" result="d${c}"/>` +
      `<feColorMatrix data-pb="1" in="d${c}" type="matrix" values="${ONLY[c]}" result="${c}"/>`).join("") +
    `<feComposite in="r" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg"/>` +
    `<feComposite in="rg" in2="b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens"/>` +
    `<feComposite in="lens" in2="SourceGraphic" operator="over"/>`;
}

export default function ClearDisc({ open, anchorRef }) {
  const [host, setHost] = useState(null);
  const lensRef = useRef(null);
  const mapRef = useRef(null);
  const weightRef = useRef(null);
  const xRef = useRef(null);
  const yRef = useRef(null);
  useEffect(() => { setHost(document.body); }, []);

  useEffect(() => {
    const el = lensRef.current;
    const anchor = anchorRef.current;
    if (!host || !el || !anchor) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const refract = canRefract();
    let bend = null, bendW = 0, drawnW = 0, raf = 0, wheelA = 0;
    const fit = () => {
      raf = 0;
      // the disc's own size (not its grow-in scale), on its centre
      const w = anchor.offsetWidth;
      const b = anchor.getBoundingClientRect();
      if (!w) return;
      const left = b.left + b.width / 2 - w / 2, top = b.top + b.height / 2 - w / 2;
      el.style.left = `${left}px`; el.style.top = `${top}px`;
      el.style.width = `${w}px`; el.style.height = `${w}px`;
      if (!still) el.style.setProperty("--cd-turn", `${(wheelA * SPOKE_TURN.wheel + window.scrollY * SPOKE_TURN.scroll).toFixed(1)}deg`);
      if (!open) return;
      const scales = prismScales(w);
      if (drawnW !== w && mapRef.current && weightRef.current) {
        drawRefractionMap(mapRef.current, weightRef.current, w, w, w / 2, null, [], w / 2, xRef.current, yRef.current);
        drawnW = w;
        for (const n of el.querySelectorAll("[data-ch]")) n.setAttribute("scale", scales[n.getAttribute("data-ch")]);
      }
      if (refract) {
        el.style.setProperty("--lg-filter", `url(#${DISC_ID})`);
        el.dataset.refract = "1";
        return;
      }
      // the Safari path: bend the cards under the disc, the prism's way
      if (bend && bendW !== w) { bend.dispose(); bend = null; }
      if (!bend) { bend = createPageBend({ id: DISC_ID, el, selector: FIXTURE_BEND, mapRef, ownChain: prismChain(scales) }); bendW = w; }
      bend.place({ left, top, right: left + w, bottom: top + w, width: w, height: w });
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(fit); };
    const onWheel = (e) => { wheelA = (e.detail && e.detail.angle) || 0; wake(); };
    const ro = new ResizeObserver(wake);
    ro.observe(anchor);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    window.addEventListener("asilum:wheel-turn", onWheel);
    const deck = anchor.closest(".ccenter");
    if (deck) deck.addEventListener("transitionend", wake);
    fit();
    // the deck settles after the disc grows in: once more when it has
    const settle = setTimeout(wake, 600);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      window.removeEventListener("asilum:wheel-turn", onWheel);
      if (deck) deck.removeEventListener("transitionend", wake);
      clearTimeout(settle);
      if (raf) cancelAnimationFrame(raf);
      if (bend) bend.dispose();
    };
  }, [host, open, anchorRef]);

  if (!host) return null;
  return createPortal(
    <span ref={lensRef} className="cdlens" data-open={open ? "1" : undefined} aria-hidden="true">
      <svg className="glass-defs" aria-hidden="true" focusable="false">
        {/* THE PRISM, the backdrop's way (Chromium): the bend drawn as two
            greys, as every pane's is (LiquidGlass.jsx), then run three times —
            red, green, blue, each at its own pull — and each pass keeps only
            its colour; summed, the colours land apart. */}
        <filter id={DISC_ID} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feImage ref={xRef} preserveAspectRatio="none" result="cdx" />
          <feImage ref={yRef} preserveAspectRatio="none" result="cdy" />
          <feColorMatrix in="cdx" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.5" result="cdxa" />
          <feColorMatrix in="cdy" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.5" result="cdya" />
          {CH.map((c) => [
            <feDisplacementMap key={c + "x"} data-ch={c} in="SourceGraphic" in2="cdxa" scale="0" xChannelSelector="R" yChannelSelector="A" result={c + "x"} />,
            <feDisplacementMap key={c + "y"} data-ch={c} in={c + "x"} in2="cdya" scale="0" xChannelSelector="A" yChannelSelector="R" result={c + "l"} />,
            <feColorMatrix key={c} in={c + "l"} type="matrix" values={ONLY[c]} result={c} />,
          ])}
          <feComposite in="r" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
          <feComposite in="rg" in2="b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
        <image ref={mapRef} width="0" height="0" />
        <image ref={weightRef} width="0" height="0" />
      </svg>
    </span>,
    host,
  );
}
