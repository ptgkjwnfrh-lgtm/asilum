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
// the deck's silhouette and run on round the back; the entries crawl as one
// glowing white line of Share Tech Mono, right to left, out of the right side,
// across the face and round the left; ADs is knocked out of a glowing white
// chip at the face's left. Every entry prints its `ticker` words. The crawl
// holds on hover, focus, while the reader types, and under reduced motion; it
// is not announced (each entry is a link with its label spoken: a BRDCST is
// read as sponsored though it prints its title alone).

import { useLayoutEffect, useRef, useState } from "react";
import { HOUSE_LINES } from "../../lib/dock.js";
import { crawlFor, wrapSlices } from "../../lib/adcrawl.js";
import { usePlacements } from "./Placements.jsx";

// the two quarter cylinders, laid once
const WRAP = wrapSlices();

export default function AdStrip({ typing = false }) {
  const items = usePlacements();
  const [held, setHeld] = useState(false);
  // the entries, as the ticker prints them; with nothing eligible, the house lines
  const words = items && items.length
    ? items.map((it) => ({ id: it.id, text: it.ticker || it.line, href: it.href, said: it.label.toLowerCase() + ": " + (it.ticker || it.line) }))
    : (items === null ? [{ id: "wait", text: "…" }] : HOUSE_LINES.map((t, n) => ({ id: "house" + n, text: t })));
  const key = words.map((w) => w.id + w.text).join("|");
  // the crawl: one sequence measured, the band long enough to cover its whole unrolled length, one sequence a loop
  const trackRef = useRef(null), faceRef = useRef(null), seqRef = useRef(null);
  const [crawl, setCrawl] = useState({ copies: 2, len: 0, seconds: 0 });
  useLayoutEffect(() => {
    const track = trackRef.current, face = faceRef.current;
    if (!track || !face) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const seq = seqRef.current, r = face.offsetLeft;
      const c = crawlFor(seq ? seq.getBoundingClientRect().width : 0, track.offsetWidth - 2 * r + Math.PI * r);
      setCrawl((p) => (p.copies === c.copies && Math.abs(p.len - c.len) < 0.25 ? p : c));
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
  // a slice of a side: the band's arc laid flat, squeezed from its left edge, dimmed as it turns
  const slice = (side, g, n) => (
    <span key={side + n} className={"adslice " + side} aria-hidden="true" style={{ "--at": g.at.toFixed(5), "--from": g.from.toFixed(5), "--s": g.scale.toFixed(5), "--sh": g.shade.toFixed(4) }}>{band(false)}</span>
  );
  return (
    <div
      className={"adstrip" + (crawl.seconds > 0 ? " run" : "") + (held || typing ? " held" : "")}
      aria-label="ads and placements"
      style={{ "--crawl-l": `${crawl.len}px`, "--crawl-s": `${crawl.seconds}s`, "--arc": WRAP.arc.toFixed(5) }}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <div className="adtrack" ref={trackRef}>
        {WRAP.left.map((g, n) => slice("l", g, n))}
        <span className="adface" ref={faceRef}>
          {band(true)}
          <span className="adslot" aria-hidden="true">ADs</span>
        </span>
        {WRAP.right.map((g, n) => slice("r", g, n))}
      </div>
    </div>
  );
}
