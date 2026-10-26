"use client";

// app/components/hinge.js — THE HINGED KEYS (owner, 19 Oct 2026: "I want the
// buttons to feel like physical music player buttons … the top of each button
// besides the upload button to have a hinge — I don't want it to be visible
// at all — when the button is clicked I want it to look like it's actually
// been clicked"). Each key is a flap hinged along its top edge: a press tips
// its lower edge INTO the glass (globals.css .hkey[data-pressed]), the face
// shades towards the bottom where it sinks and a hairline seam opens under
// it; the release springs it back past rest and settles, the way a cassette
// deck's transport key does. The hinge itself is never drawn.
//
// The pressed state is held here rather than left to :active, for two
// reasons: a quick tap on a phone lifts the finger before a frame is painted,
// so :active alone often shows nothing; and Space / Enter must press the key
// the same way a finger does. A press shows for at least MIN_PRESS_MS.

import { useEffect } from "react";

export const MIN_PRESS_MS = 110;

export function useHingedKeys(rootRef, selector = ".hkey", active = true) {
  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return undefined;
    const held = new Map(); // key -> the time it went down
    const down = (key) => {
      if (!key || held.has(key)) return;
      held.set(key, performance.now());
      key.dataset.pressed = "1";
    };
    const up = (key) => {
      if (!key || !held.has(key)) return;
      const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - held.get(key)));
      held.delete(key);
      setTimeout(() => { if (!held.has(key)) delete key.dataset.pressed; }, wait);
    };
    const keyOf = (e) => (e.target && e.target.closest ? e.target.closest(selector) : null);
    const onDown = (e) => { if (e.button) return; const k = keyOf(e); if (k && root.contains(k)) down(k); };
    const onUp = () => { for (const k of [...held.keys()]) up(k); };
    const onKeyDown = (e) => { if (e.key !== " " && e.key !== "Enter") return; const k = keyOf(e); if (k && root.contains(k)) down(k); };
    const onKeyUp = (e) => { if (e.key !== " " && e.key !== "Enter") return; onUp(); };
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("keyup", onKeyUp);
      for (const k of held.keys()) delete k.dataset.pressed;
    };
  }, [rootRef, selector, active]);
}
