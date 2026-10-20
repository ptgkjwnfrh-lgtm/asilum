"use client";

// app/components/Wordmark.jsx — THE WORDMARK. It left the shell's header
// when the header left (V.2 Blueprint, owner, 17 Oct 2026) and lived on the
// Feed's masthead; since 19 Oct 2026 it is a FIXTURE of its own (owner: "the
// *ASILUM logo becomes a fixture that permanently sits in the left hand
// corner"), mounted once by the shell (className "brandfix").
//
// THE NAME IS "*ASILUM" (owner, 17 Oct 2026: "when they type it in I just
// want it to look like *ASILUM"; "no more lower case i"). The MAGAZINE and
// FASHION TERMINAL lines of the August lockup are retired with the word:
// the asterisk and the six capitals are the whole mark, everywhere —
// browser tab, social card, order mail, this component.
// tests/brand-name.test.js enforces it.

import { useEffect, useRef, useState } from "react";

// THE LINE'S OTHER FACE (owner, 19 Oct 2026: "the thick line should have a
// 10% chance to appear as >>>>>>>"): decided once a load, after hydration so
// the server and the first paint agree — the device language's chevron run,
// as many chevrons as fill the line ("add more >>>"), measured, not guessed.
export const CHEVRON_CHANCE = 0.1;
const MIN_CHEVRONS = 7;

export default function Wordmark({ href = "/", className = "" }) {
  const [chev, setChev] = useState(false);
  const [count, setCount] = useState(MIN_CHEVRONS);
  const runRef = useRef(null);
  useEffect(() => { if (Math.random() < CHEVRON_CHANCE) setChev(true); }, []);
  useEffect(() => {
    const run = runRef.current;
    if (!chev || !run) return undefined;
    const fit = () => {
      const one = run.firstElementChild ? run.firstElementChild.getBoundingClientRect().width : 0;
      if (one > 0) setCount(Math.max(MIN_CHEVRONS, Math.floor(run.clientWidth / one)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(run);
    return () => ro.disconnect();
  }, [chev]);
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmword"><i>*</i><span className="wmcaps">ASILUM</span></span>
      {/* the bar under the name (owner, 19 Oct 2026): a thick translucent
          line and one lit square, within the word's own width — one load in
          ten the line is a run of chevrons */}
      <span className={"wmbar" + (chev ? " chev" : "")} aria-hidden="true">
        {chev ? <span className="wmchev" ref={runRef}>{Array.from({ length: count }, (_, i) => <b key={i}>{">"}</b>)}</span> : null}
        <b className="wmsq" />
      </span>
    </a>
  );
}
