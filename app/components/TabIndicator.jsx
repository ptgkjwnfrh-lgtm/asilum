"use client";

// app/components/TabIndicator.jsx — THE TAB INDICATOR (owner's fixture
// sketch, 19 Oct 2026, Figures 1 and 3): the small ring carved into the
// deck's top right, above its last cut. Dark at rest; a double red blink
// when a fixture key is pressed; a single blink and a steady light while the
// upload popup or the Passport is open — paced like a DVD player's front
// panel light (lib/indicator.js). Timing is lib/indicator.js's; the
// red is --warn (red in both palettes — in dark the accent is green). The
// glass does not refract round it (owner, 19 Oct 2026): it is a light set in
// the pane, not a carving. Reduced motion: no
// blinking — the hold still lights, the double blink is skipped.

import { useEffect, useRef } from "react";
import { INDICATOR_EVENT, doubleBlinkFrames, holdBlinkFrames } from "../../lib/indicator.js";
import { haptic } from "../../lib/haptics.js";

export default function TabIndicator({ held }) {
  const lampRef = useRef(null);
  const heldRef = useRef(held);
  const still = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

  useEffect(() => {
    const on = () => {
      const lamp = lampRef.current;
      if (!lamp || heldRef.current || still() || typeof lamp.animate !== "function") return;
      const { frames, duration } = doubleBlinkFrames();
      lamp.animate(frames, { duration, easing: "linear" });
      haptic("blink2");
    };
    window.addEventListener(INDICATOR_EVENT, on);
    return () => window.removeEventListener(INDICATOR_EVENT, on);
  }, []);

  useEffect(() => {
    const was = heldRef.current;
    heldRef.current = held;
    if (!held || was) return;
    const lamp = lampRef.current;
    haptic("blink");
    if (!lamp || still() || typeof lamp.animate !== "function") return;
    const { frames, duration } = holdBlinkFrames();
    lamp.animate(frames, { duration, easing: "linear" });
  }, [held]);

  return (
    <i className={"tabind" + (held ? " held" : "")} aria-hidden="true">
      <b ref={lampRef} className="tabindlamp" />
    </i>
  );
}
