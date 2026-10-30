// lib/fig20.js — FIGURE 20's ring, as pure functions (owner, 28 Oct 2026:
// "for carousels they should be infinite, however the first and last card
// should have a slight magnetic drag"). app/components/Fig20.jsx draws it.
//
// The carousel is a ring: `pos` (the card at the centre) is unbounded, a
// card's place is its offset from `pos` the short way round, and past the
// last card comes the first. The SEAM — the stretch between the last card
// and the first — is where the magnet is:
//   dragging  the hand moves the ring at SEAM_DRAG of its speed across the
//             seam, so the last card holds on a moment before the first
//             comes round
//   letting go a flick stops on the card at the seam (the last, or the
//             first) rather than flying past it; the next swipe from there
//             crosses — the drag is slight, never a wall
//   keys, the wheel and a tap go round freely.

/** How much of the hand's travel the ring keeps across the seam. */
export const SEAM_DRAG = 0.5;

/** A card's index in [0, n). */
export function wrap(i, n) {
  if (!(n > 0)) return 0;
  return ((Math.round(i) % n) + n) % n;
}

/** Card i's offset from `pos`, the short way round, in [-n/2, n/2). */
export function ringOffset(i, pos, n) {
  if (!(n > 0)) return 0;
  let d = (((i - pos) % n) + n) % n;
  if (d >= n / 2) d -= n;
  return d;
}

/** The unbounded place of card i nearest to `from` (where to go to show it). */
export function nearestTo(i, from, n) {
  const base = Math.round(from);
  return base + Math.round(ringOffset(i, base, n));
}

/** Whether `p` lies on the seam, between the last card and the first. */
export function inSeam(p, n) {
  if (!(n > 1)) return false;
  const f = ((p % n) + n) % n;
  return f > n - 1;
}

/** Where the ring is after the hand moves it `effort` cards from `start`:
 *  the hand's travel across the seam counts SEAM_DRAG of itself. */
export function seamDrag(start, effort, n, k = SEAM_DRAG) {
  if (!(n > 1) || !effort || !Number.isFinite(effort)) return start + (effort || 0);
  const dir = Math.sign(effort);
  let p = start, left = Math.abs(effort);
  const STEP = 0.01;
  while (left > 1e-9) {
    const s = Math.min(STEP, left);
    p += dir * s * (inSeam(p + (dir * s) / 2, n) ? k : 1);
    left -= s;
  }
  return p;
}

/** Where a released ring settles: the nearest card after the throw, but a
 *  throw does not carry past the seam — it stops on the card there, unless
 *  it starts on it (then it crosses, and goes on no further than the seam's
 *  other side allows). */
export function settleTarget(pos, throwCards, n) {
  const from = Math.round(pos);
  const target = Math.round(pos + (Number.isFinite(throwCards) ? throwCards : 0));
  if (!(n > 1) || target === from) return target;
  const dir = Math.sign(target - from);
  let t = from;
  while (t !== target) {
    const atSeam = wrap(t, n) === (dir > 0 ? n - 1 : 0);
    if (atSeam && t !== from) break;
    t += dir;
  }
  return t;
}
