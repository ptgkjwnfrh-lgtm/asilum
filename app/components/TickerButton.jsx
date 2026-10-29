"use client";

// app/components/TickerButton.jsx — THE TICKER'S BUTTON (owner, 28 Oct 2026: "make like a phyical comic button in
// the middle right on the page so i can open and close the ad ticker"). A chunky comic push-button, inked and
// hard-shadowed, at the middle of the page's right edge: a press opens the ticker if it is folded and folds it
// if it is open. It sends the Design Console's own test (asilum:ticker-test, lib/placements.js TICKER_TESTS), so
// it is this page view only, and opened with nothing live the ticker runs its labelled samples — it never
// invents an ad.

import { useEffect, useState } from "react";
import { haptic } from "../../lib/haptics.js";
import { TICKER_TESTS } from "../../lib/placements.js";

const [OPEN, FOLD] = TICKER_TESTS;

/** Whether the ticker is open on the page now (AdStrip.jsx wears `open` while it is). */
const tickerOpen = () => typeof document !== "undefined" && !!document.querySelector(".adstrip.open");

export default function TickerButton() {
  const [open, setOpen] = useState(false);
  // follow the ticker itself, whoever opens or folds it (the console, the network, this button)
  useEffect(() => {
    const sync = () => setOpen(tickerOpen());
    sync();
    const strip = document.querySelector(".adstrip");
    if (!strip) return undefined;
    const mo = new MutationObserver(sync);
    mo.observe(strip, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  const press = () => {
    haptic("press");
    const next = tickerOpen() ? FOLD : OPEN;
    window.dispatchEvent(new CustomEvent("asilum:ticker-test", { detail: { mode: next } }));
  };
  return (
    <button type="button" className={"tickbtn" + (open ? " on" : "")} aria-pressed={open} onClick={press}
      aria-label={open ? "fold the ad ticker" : "open the ad ticker"} title={open ? "FOLD THE TICKER" : "OPEN THE TICKER"}>
      <span className="tickbtnface">ADs</span>
    </button>
  );
}
