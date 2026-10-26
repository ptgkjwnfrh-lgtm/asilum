"use client";

// app/components/AdStrip.jsx — THE AD STRIP, off the deck (owner's fixture
// sketch, 19 Oct 2026: the Central Control Deck is the five keys, the cuts,
// the tab indicator and the foot grill — nothing else). It used to run under
// the deck as a stable-height part of the dock; it runs at the head of the
// Feed now, in the page's flow, so nothing extra floats. What it carries is
// unchanged: Sponsored placements first, then this device's own promotion
// drafts (to their author, labelled DRAFT), then LISTED dated events from the
// places record — lib/placements.js is the law — and with nothing eligible
// the house lines (lib/dock.js HOUSE_LINES) under the ASILUM tag, never a
// blank and never an invented offer.

import { useEffect, useRef, useState } from "react";
import { HOUSE_LINES } from "../../lib/dock.js";
import Icon from "./Icons.jsx";
import { usePlacements } from "./Placements.jsx";
import { Lamp, blinkLamp } from "./Blocks.jsx";

const ROTATE_MS = 7000;

/** The ad strip: Sponsored placements first, then this device's own
 *  promotion drafts (to their author, labelled DRAFT), then LISTED dated
 *  events from the places record — lib/placements.js is the law. With
 *  nothing eligible it carries the house lines (lib/dock.js HOUSE_LINES)
 *  under the ASILUM tag, never a blank and never an invented offer.
 *  Rotation pauses on hover, focus, reduced motion, and while the reader
 *  types; it is not announced. */
export default function AdStrip({ typing = false }) {
  const items = usePlacements();
  // THE STATUS LIGHTS (owner, 18 Oct 2026: blinking squares that turn off,
  // the CD tray's eject light): two red squares at the strip's end, dark at
  // rest; anything put in the bag or any purchase control's lamp makes them
  // blink and settle dark again
  const lightsRef = useRef(null);
  useEffect(() => {
    const on = () => blinkLamp(lightsRef.current, { quiet: true });
    window.addEventListener("asilum:lamp", on);
    window.addEventListener("asilum:bag", on);
    return () => { window.removeEventListener("asilum:lamp", on); window.removeEventListener("asilum:bag", on); };
  }, []);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  useEffect(() => {
    try { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
  }, []);
  const count = items && items.length ? items.length : HOUSE_LINES.length;
  useEffect(() => {
    if (count < 2 || paused || typing || reduced.current) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), ROTATE_MS);
    return () => clearInterval(t);
  }, [count, paused, typing]);
  const cur = items && items.length ? items[i % items.length] : null;
  const step = (d) => { if (items && items.length) setI((n) => (n + d + items.length) % items.length); };
  return (
    <div className="adstrip" aria-label="ads and placements" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {/* the slot's name, in red, as the owner drew it (18 Oct 2026: "*ADs") */}
      <span className="adslot" aria-hidden="true">ADs</span>
      {cur ? (
        <>
          <a className="adline" href={cur.href} aria-label={cur.label.toLowerCase() + " placement: " + cur.line}>
            <span className={"adtag " + cur.kind}>{cur.label}</span>
            <span className="adtext">{cur.line}</span>
          </a>
          {items.length > 1 && (
            <span className="adnav">
              <button className="adbtn" onClick={() => step(-1)} aria-label="previous placement"><Icon name="back" size={14} /></button>
              <span className="adcount" aria-hidden="true">{i % items.length + 1}/{items.length}</span>
              <button className="adbtn" onClick={() => step(1)} aria-label="next placement"><Icon name="back" size={14} className="flip" /></button>
            </span>
          )}
        </>
      ) : (
        <span className="adline notice" data-house="1">
          <span className="adtag asilum">ASILUM</span>
          <span className="adtext">{items === null ? "…" : HOUSE_LINES[i % HOUSE_LINES.length]}</span>
        </span>
      )}
      <span className="devlights" ref={lightsRef} aria-hidden="true"><Lamp /><Lamp /></span>
    </div>
  );
}

