"use client";

// app/components/AdStrip.jsx — THE AD TICKER, in its bubble on the deck
// (owner, 25 Oct 2026, last: beneath the keys and above the vent). What it
// carries: live BRDCST campaigns in reach, this device's own promotion
// drafts (to their author), then LISTED dated events from the places record
// — lib/placements.js is the law. With no ad and no BRDCST it carries nothing
// and folds to its line (28 Oct 2026; the house lines it used to fall back
// on, lib/dock.js HOUSE_LINES, can no longer show), never an invented offer.
//
// HOW IT LOOKS (owner, 28 Oct 2026, the MAD-S player's wrap-round display as
// the reference): "lets have it stretch all the across the center fixture,
// so if the center fixture was a 3d object the add ticker should stretch all
// around it, the glowing red "ADs" should be a negative imprint in a solid
// glowing white mini rectangle … the glowing white text … on an a heavly
// clouded track … use share tech mono in regular with a -8.5 to -9 kerning
// … all BRDCST should simply be displayed by their title and all actual ads
// should start with "AD:""; then "i said clouded no black, i just wanted it
// more clouded than the fixture and i wanted the bar to stretch the entirety
// of the fixture like i meant if the fixture was a object the ad ticker would
// wrap around the whole thing 360 degrees … also get rid of those two red
// squares". So: a band of cloud — frosted, heavier than the deck's glass —
// across the deck edge to edge, turning round each side as a quarter
// cylinder (lib/adcrawl.js wrapSlices), so the words squeeze to nothing at
// the deck's silhouette and run on round the back (each side one smooth
// piece of cloud and shade, the words over it in fine slices, fading into
// the silhouette: "the rendering of the 3d wrap is kind of choppy"); the entries crawl as one
// glowing white line of Share Tech Mono, right to left, out of the right side,
// across the face and round the left; ADs is knocked out of a glowing white
// chip at the face's left. Every entry prints its `ticker` words. The crawl
// holds on hover, focus, while the reader types, and under reduced motion; it
// is not announced (each entry is a link with its label spoken: a BRDCST is
// read as sponsored though it prints its title alone).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { crawlFor, wrapSlices, typingFor, monoText, SEP } from "../../lib/adcrawl.js";
import { tickerOpen } from "../../lib/placements.js";
import { usePlacements } from "./Placements.jsx";

// the two quarter cylinders, laid once
const WRAP = wrapSlices();

export default function AdStrip({ typing = false, onOpen = null }) {
  const items = usePlacements();
  const [held, setHeld] = useState(false);
  // no service, nothing live: the ticker shuts to its line, and opens again the moment service returns
  // (the placements hook reads again on "online")
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const open = tickerOpen(items, online);
  useEffect(() => { if (onOpen) onOpen(open); }, [open, onOpen]);
  // the entries, as the ticker prints them, on the monospaced grid (folded, there are none to print)
  const words = (items || []).map((it) => ({ id: it.id, text: monoText(it.ticker || it.line), href: it.href, said: it.label.toLowerCase() + ": " + (it.ticker || it.line) }));
  const key = words.map((w) => w.id + w.text).join("|");
  // the crawl and the typing: one sequence measured on the cell grid, the band long enough to cover its
  // whole unrolled length, one sequence a loop, the typing edges on cell boundaries
  const trackRef = useRef(null), faceRef = useRef(null), seqRef = useRef(null), probeRef = useRef(null);
  const [crawl, setCrawl] = useState({ copies: 2, len: 0, seconds: 0, type: null });
  useLayoutEffect(() => {
    const track = trackRef.current, face = faceRef.current;
    if (!track || !face) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const seq = seqRef.current, probe = probeRef.current, r = face.offsetLeft;
      const unrolled = track.offsetWidth - 2 * r + Math.PI * r;
      const cell = probe ? probe.getBoundingClientRect().width / 20 : 0;
      const type = typingFor({ seqW: seq ? seq.getBoundingClientRect().width : 0, cell, r, unrolled });
      const c = crawlFor(type ? type.len : 0, unrolled);
      setCrawl((p) => (p.copies === c.copies && Math.abs(p.len - c.len) < 0.01 && p.type && type && p.type.n === type.n && Math.abs(p.type.out - type.out) < 0.01 && Math.abs(p.type.in - type.in) < 0.01 ? p : { ...c, type }));
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
          {words.map((w) => (
            <span key={w.id} className="adentry">
              {live && w.href
                ? <a className="adword" href={w.href} aria-label={w.said} tabIndex={c === 0 ? undefined : -1}>{w.text}</a>
                : <span className="adword">{w.text}</span>}
              <span className="adsep" aria-hidden="true">{SEP}</span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
  // a side: one smooth piece of cloud and shade, the words over it in slices — each the band's arc laid
  // flat and squeezed from its left edge
  const side = (sideKey, slices) => (
    <span className={"adside " + sideKey} aria-hidden="true">
      {slices.map((g, n) => <span key={n} className="adslice" style={{ "--at": g.at.toFixed(5), "--from": g.from.toFixed(5), "--s": g.scale.toFixed(5) }}>{band(false)}</span>)}
    </span>
  );
  const t = crawl.type;
  return (
    <div
      className={"adstrip" + (crawl.seconds > 0 && t ? " run" : "") + (held || typing ? " held" : "") + (open ? " open" : " shut")}
      aria-label="ads and placements"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : "" /* React 18: the attribute present is inert */}
      style={{ "--crawl-l": `${crawl.len}px`, "--crawl-s": `${crawl.seconds}s`, "--arc": WRAP.arc.toFixed(5), "--t-out": `${t ? t.out : 0}px`, "--t-in": `${t ? t.in : 100000}px`, "--t-n": t ? t.n : 1 }}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <span className="adprobe" ref={probeRef} aria-hidden="true">00000000000000000000</span>
      <div className="adtrack" ref={trackRef}>
        {side("l", WRAP.left)}
        <span className="adface" ref={faceRef}>
          {band(true)}
          <span className="adslot" aria-hidden="true">ADs</span>
        </span>
        {side("r", WRAP.right)}
      </div>
    </div>
  );
}
