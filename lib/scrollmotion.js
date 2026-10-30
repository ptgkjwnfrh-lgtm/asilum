// lib/scrollmotion.js — WHAT THE SCROLL MOVES (owner, 29 Oct 2026: "i would still want reactive shrinking on the
// center fixture so when a user scrolls down the fixture should shrink 15% seamlessly and if a button on the fixture is
// pressed it should go back to orignial size seamlessly and smoothly however the disc and upload button should stay the
// same size just. if a user scrolls up the size of the fixture should go back seamlessly. the toggle button should
// appear if the user scrolls up and if the user scrolls back down the toggle button should remain where it is so it
// appears like its being scrolled back up"). Pure: the deck (ControlCenter.jsx) and the Feed's EQ key (FeedEq.jsx)
// read it every scroll frame; the CSS makes the moves.

/** THE DECK'S SHRINK: 15% smaller while the reader scrolls down, whole again on the way up, near the top, or at a
 *  press. A direction counts once it has run SHRINK_AFTER px, so a finger's jitter does not pump it. */
export const DECK_SHRINK = 0.85;
export const SHRINK_AFTER = 12;
export const SHRINK_TOP = 48;

/** One scroll reading: `s` is { last, acc, shrunk } (where the page was, how far it has run one way, the state). */
export function shrinkStep(s, y) {
  const prev = s || { last: y, acc: 0, shrunk: false };
  const d = y - prev.last;
  const acc = d === 0 ? prev.acc : Math.sign(d) === Math.sign(prev.acc) ? prev.acc + d : d;
  let shrunk = prev.shrunk;
  if (y <= SHRINK_TOP) shrunk = false;
  else if (acc >= SHRINK_AFTER) shrunk = true;
  else if (acc <= -SHRINK_AFTER) shrunk = false;
  return { last: y, acc, shrunk };
}

/** THE KEY THAT COMES BACK (a "quick return"): `q` is how far above its resting place under the Masthead the key
 *  sits, from 0 (in view) to -hide (out of sight above it). Scrolling down by `d` takes q up by d — the key leaves
 *  at the page's own pace, as if scrolled away with it; scrolling up brings it down by d, into view, and there it
 *  waits. */
export function quickReturn(q, d, hide) {
  return Math.min(0, Math.max(-hide, q - d));
}

/** Where the key is drawn, as an offset from its own place in the page (`natural`, its top on the screen): never
 *  above its place, which is where it lives at the top of the Feed (inline with THE FEED); lower only to hold it at
 *  `stick` (under the Masthead) plus q. */
export function quickOffset(natural, stick, q) {
  return Math.max(0, stick + q - natural);
}
