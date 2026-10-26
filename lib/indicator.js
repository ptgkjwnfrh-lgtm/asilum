// lib/indicator.js — THE TAB INDICATOR's timing, as data (owner's fixture
// sketch, 19 Oct 2026, Figure 1: the small ring at the deck's top right).
//
//   any fixture key but POST   blinks red TWICE
//   POST (the upload key)      blinks ONCE, a break, then the light HOLDS
//   and the globe (Figure 5)   until that popup (or the Passport) is left
//
// THE TIMING, LIKE A DVD PLAYER'S LIGHT (owner, 19 Oct 2026, second word:
// "fix the animation times so it's longer — I want it to feel like a DVD
// player indicator"). The sketch's 17.5ms / 1ms / 17.5ms was shorter than a
// display frame, so the two blinks read as one flicker. Now each blink is
// lit for BLINK_ON_MS and goes dark with a short LED afterglow (FADE_MS)
// inside the BLINK_GAP_MS break, the way a front-panel LED steps: on, on,
// a beat apart. One subtle vibration at the start of each blink. Client-
// safe; no DOM here — the light listens for the event
// (app/components/TabIndicator.jsx).

export const INDICATOR_EVENT = "asilum:indicator";
export const BLINK_ON_MS = 140;
export const BLINK_GAP_MS = 90;
export const FADE_MS = 40;

/** Keyframes for the double blink: on, afterglow to dark, the break, on
 *  again, afterglow to dark. */
export function doubleBlinkFrames() {
  const second = BLINK_ON_MS + BLINK_GAP_MS; // 230ms: the second blink lights
  const total = second + BLINK_ON_MS + FADE_MS; // 410ms
  const at = (ms) => ms / total;
  return {
    duration: total,
    frames: [
      { opacity: 1, offset: 0 }, { opacity: 1, offset: at(BLINK_ON_MS) },
      { opacity: 0, offset: at(BLINK_ON_MS + FADE_MS) }, { opacity: 0, offset: at(second) },
      { opacity: 1, offset: at(second) }, { opacity: 1, offset: at(second + BLINK_ON_MS) },
      { opacity: 0, offset: 1 },
    ],
  };
}

/** Keyframes for the single blink before a hold: on, afterglow to dark, the
 *  break, and then the hold (the light's own lit state) takes over. */
export function holdBlinkFrames() {
  const total = BLINK_ON_MS + BLINK_GAP_MS; // 230ms
  const at = (ms) => ms / total;
  return {
    duration: total,
    frames: [{ opacity: 1, offset: 0 }, { opacity: 1, offset: at(BLINK_ON_MS) }, { opacity: 0, offset: at(BLINK_ON_MS + FADE_MS) }, { opacity: 0, offset: 1 }],
  };
}

/** Is the light held? The upload popup (Post Selection, the composer, the
 *  session hub the same key opens) or the Passport being open. */
export function indicatorHeld({ sheetId = null, hubOpen = false, onPassport = false } = {}) {
  return sheetId === "postselect" || sheetId === "post" || !!hubOpen || !!onPassport;
}

/** Ask the light for a double blink (a fixture key was pressed). */
export function blinkIndicator() {
  try { window.dispatchEvent(new CustomEvent(INDICATOR_EVENT, { detail: { kind: "double" } })); } catch {}
}
