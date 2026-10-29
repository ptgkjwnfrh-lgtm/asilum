"use client";

// app/components/SideButtons.jsx — THE SIDE BUTTONS: chunky comic push-buttons, inked and hard-shadowed, stacked
// at the middle of the page's right edge (owner, 28 Oct 2026).
//
// THE TICKER'S ("make like a phyical comic button in the middle right on the page so i can open and close the ad
// ticker"): a press opens the ticker if it is folded and folds it if it is open. It sends the Design Console's own
// test (asilum:ticker-test, lib/placements.js TICKER_TESTS), so it is this page view only, and opened with nothing
// live the ticker runs its labelled samples — it never invents an ad.
//
// THE THEME'S ("also add a button in the same spot to switch from light to dark"): a press turns the page to the
// other theme and keeps it, the way Settings pins one (asilum-theme, data-theme on <html>); Settings' SYSTEM
// hands it back to the device.

import { useEffect, useState } from "react";
import { haptic } from "../../lib/haptics.js";
import { TICKER_TESTS } from "../../lib/placements.js";

const [OPEN, FOLD] = TICKER_TESTS;

/** Whether the ticker is open on the page now (AdStrip.jsx wears `open` while it is). */
const tickerOpen = () => typeof document !== "undefined" && !!document.querySelector(".adstrip.open");

function TickerButton() {
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

/** The theme the page shows now. */
const themeNow = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");

function ThemeButton() {
  const [theme, setTheme] = useState("dark");
  // follow the page's theme, whoever turns it (this button, Settings, the device)
  useEffect(() => {
    const sync = () => setTheme(themeNow());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  const press = () => {
    haptic("toggle");
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("asilum-theme", next); } catch {}
  };
  return (
    <button type="button" className={"tickbtn themebtn " + theme} onClick={press}
      aria-label={"switch to the " + next + " theme"} title={next === "light" ? "LIGHT MODE" : "DARK MODE"}>
      <span className="tickbtnface">{next === "light" ? "LIGHT" : "DARK"}</span>
    </button>
  );
}

export default function SideButtons() {
  return (
    <div className="sidebtns">
      <TickerButton />
      <ThemeButton />
    </div>
  );
}
