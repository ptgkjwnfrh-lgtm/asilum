"use client";

// app/components/Blocks.jsx — THE DEVICE'S OWN LANGUAGE, a little of it
// (owner, 18 Oct 2026: "I want the app to feel like a physical device";
// 25 Oct 2026: "fuck the chevrons — use this image to replace the chevrons,
// I want them used as text place holders"). The chevron runs of 18 Oct are
// gone; BLOCKS stand in for text now (lib/feed/blocks.js, the owner's
// reference: Ref 1 a row of even blocks, Ref 2 blocks the length of words).
//
//   <BlockText text="…" />    the text loads in behind a run of even blocks
//                             sweeping left to right; the not-yet text keeps
//                             its place (transparent), so nothing reflows as
//                             it arrives. Plays once on mount, again when
//                             `play` changes. The full text is the accessible
//                             name from the first frame.
//   <BlockLine text="…" />    a folded line: every word a block of its own
//                             width, the text waiting inside (aria-hidden —
//                             the control that unfolds it names the text).
//   <Lamp />                  one square warning light, off at rest.
//   blinkLamp(eventOrEl)      blinks the lamp inside the pressed control
//                             like a CD tray's eject light — on, off, on,
//                             off — then it goes dark.
//
// prefers-reduced-motion: the text is simply there, the lamp lights once and
// goes dark without blinking, the cursor holds still.

import { useEffect, useRef } from "react";
import { haptic } from "../../lib/haptics.js";
import { blockFrame, blockWords, BLOCK_RUN as RUN } from "../../lib/feed/blocks.js";

export { blockFrame };

const STEP_MS = 14;       // per character
const MAX_MS = 900;       // a long description never takes longer than this

const still = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BlockText({ text, as: Tag = "span", className = "", play = 0 }) {
  const shownRef = useRef(null);
  const runRef = useRef(null);
  const restRef = useRef(null);
  const t = String(text || "");
  useEffect(() => {
    const s = shownRef.current, c = runRef.current, r = restRef.current;
    if (!s || !c || !r) return undefined;
    const paint = (n) => { const f = blockFrame(t, n); s.textContent = f.shown; c.textContent = f.run; r.textContent = f.rest; };
    if (still() || !t) { paint(t.length); return undefined; }
    const per = Math.min(STEP_MS, MAX_MS / Math.max(1, t.length + RUN));
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const n = Math.floor((now - start) / per) - RUN;
      paint(n);
      if (n < t.length) raf = requestAnimationFrame(tick);
    };
    paint(-RUN);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t, play]);
  return (
    <Tag className={"blktext " + className} aria-label={t}>
      <span ref={shownRef} aria-hidden="true" />
      <span ref={runRef} className="blkrun" aria-hidden="true" />
      <span ref={restRef} className="blkrest" aria-hidden="true">{t}</span>
    </Tag>
  );
}

/** A folded line: the words as blocks of their own width (Ref 2). Hidden
 *  from assistive technology — the control around it carries the words. */
export function BlockLine({ text, as: Tag = "span", className = "" }) {
  return (
    <Tag className={"blkline " + className} aria-hidden="true">
      {blockWords(text).map((w, i) => <i key={i} className="blkw">{w}</i>)}
    </Tag>
  );
}

/** One square warning light; dark at rest. Put it inside the control it reports on. */
export function Lamp({ className = "" }) {
  return <span className={"lamp " + className} aria-hidden="true" />;
}

/** Blink the lamp inside the control that was pressed (an event or an element), then let it go dark. */
export function blinkLamp(target, { quiet = false } = {}) {
  const el = target && target.currentTarget ? target.currentTarget : target;
  const lamps = el && el.querySelectorAll ? [...el.querySelectorAll(".lamp")] : [];
  if (!lamps.length) return;
  for (const lamp of lamps) {
    lamp.removeAttribute("data-blink");
    // restart the animation even when pressed twice in a row
    void lamp.offsetWidth;
    lamp.setAttribute("data-blink", still() ? "once" : "eject");
    clearTimeout(lamp.__off);
    lamp.__off = setTimeout(() => lamp.removeAttribute("data-blink"), 1900);
  }
  if (!quiet) haptic("press");
}

