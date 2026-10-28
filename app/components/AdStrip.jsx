"use client";

// app/components/AdStrip.jsx — THE AD TICKER, in its bubble on the deck
// (owner, 25 Oct 2026, last: beneath the keys and above the vent). What it
// carries: live BRDCST campaigns in reach, this device's own promotion
// drafts (to their author), then LISTED dated events from the places record
// — lib/placements.js is the law — and with nothing eligible the house lines
// (lib/dock.js HOUSE_LINES), never a blank and never an invented offer.
//
// HOW IT LOOKS (owner, 28 Oct 2026, the MAD-S player's wrap-round display as
// the reference): "lets have it stretch all the across the center fixture,
// so if the center fixture was a 3d object the add ticker should stretch all
// around it, the glowing red "ADs" should be a negative imprint in a solid
// glowing white mini rectangle … glowing white text … on an a heavly
// clouded track … i dont want its placement to move but i would like it
// ever so slightly lengthened … use share tech mono in regular with a -8.5
// to -9 kerning … all BRDCST should simply be displayed by their title and
// all actual ads should start with "AD:"". So: a clouded track whose face
// sits where the pill sat, a touch longer, and whose two ends CURL away
// round the deck's sides in perspective (lib/adcrawl.js CURL_DEG); the
// entries run as one glowing white line in Share Tech Mono that crawls out
// of the right curl, along the face and under the label (lib/adcrawl.js);
// the label is the status lights and ADs knocked out of a glowing white
// chip, like the reference's FLAC. Every entry prints its `ticker` words.
// The crawl holds on hover, focus, while the reader types, and under
// reduced motion; it is not announced (each entry is a link with its label
// spoken: a BRDCST is read as sponsored though it prints its title alone).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HOUSE_LINES } from "../../lib/dock.js";
import { crawlFor } from "../../lib/adcrawl.js";
import { usePlacements } from "./Placements.jsx";
import { Lamp, blinkLamp } from "./Blocks.jsx";

export default function AdStrip({ typing = false }) {
  const items = usePlacements();
  // THE STATUS LIGHTS (owner, 18 Oct 2026: blinking squares that turn off,
  // the CD tray's eject light): two red squares by the label, dark at rest;
  // anything put in the bag or any purchase control's lamp makes them blink
  // and settle dark again
  const lightsRef = useRef(null);
  useEffect(() => {
    const on = () => blinkLamp(lightsRef.current, { quiet: true });
    window.addEventListener("asilum:lamp", on);
    window.addEventListener("asilum:bag", on);
    return () => { window.removeEventListener("asilum:lamp", on); window.removeEventListener("asilum:bag", on); };
  }, []);
  const [held, setHeld] = useState(false);
  // the entries, as the ticker prints them; with nothing eligible, the house lines
  const words = items && items.length
    ? items.map((it) => ({ id: it.id, text: it.ticker || it.line, href: it.href, said: it.label.toLowerCase() + ": " + (it.ticker || it.line) }))
    : (items === null ? [{ id: "wait", text: "…" }] : HOUSE_LINES.map((t, n) => ({ id: "house" + n, text: t })));
  const key = words.map((w) => w.id + w.text).join("|");
  // the crawl: one sequence measured, the band long enough to cover the track, one sequence a loop
  const trackRef = useRef(null), winRef = useRef(null), seqRef = useRef(null);
  const [crawl, setCrawl] = useState({ copies: 2, len: 0, seconds: 0, winX: 0 });
  useLayoutEffect(() => {
    const track = trackRef.current, win = winRef.current;
    if (!track || !win) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const seq = seqRef.current;
      const c = crawlFor(seq ? seq.getBoundingClientRect().width : 0, track.offsetWidth);
      const winX = win.getBoundingClientRect().left - track.getBoundingClientRect().left;
      setCrawl((p) => (p.copies === c.copies && Math.abs(p.len - c.len) < 0.25 && Math.abs(p.winX - winX) < 0.25 ? p : { ...c, winX }));
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(wake);
    ro.observe(track);
    if (seqRef.current) ro.observe(seqRef.current);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(wake).catch(() => {});
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [key]);
  // the band: copy 0 of the face's band holds the links; every other copy is the picture of it
  const band = (live) => (
    <span className="adband">
      {Array.from({ length: crawl.copies }, (_, c) => (
        <span key={c} className="adseq" ref={live && c === 0 ? seqRef : undefined} aria-hidden={live && c === 0 ? undefined : true}>
          {words.map((w) => (live && w.href
            ? <a key={w.id} className="adword" href={w.href} aria-label={w.said} tabIndex={c === 0 ? undefined : -1}>{w.text}</a>
            : <span key={w.id} className="adword">{w.text}</span>))}
        </span>
      ))}
    </span>
  );
  return (
    <div
      className={"adstrip" + (crawl.seconds > 0 ? " run" : "") + (held || typing ? " held" : "")}
      aria-label="ads and placements"
      style={{ "--crawl-l": `${crawl.len}px`, "--crawl-s": `${crawl.seconds}s`, "--win-x": `${crawl.winX}px` }}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <div className="adtrack" ref={trackRef}>
        <span className="adcurl l" aria-hidden="true" />
        <span className="adface">
          <span className="adlabel" aria-hidden="true">
            <span className="devlights" ref={lightsRef}><Lamp /><Lamp /></span>
            <span className="adslot">ADs</span>
          </span>
          <span className="adwin" ref={winRef}>{band(true)}</span>
        </span>
        <span className="adcurl r" aria-hidden="true">{band(false)}</span>
      </div>
    </div>
  );
}
