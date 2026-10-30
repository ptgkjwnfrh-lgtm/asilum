// lib/scrollwheel.js — THE WHEEL's laws, as pure functions (owner, 26 Oct
// 2026: "let's make the scroll wheel … the upload button should extend out
// like a cd player ejecting a disc and the scroll wheel should morph and
// appear"; then, the same day, the revision with the sketch IMG_1166: "the
// disc scroll wheel should spawn when a carousel is on center of the feed.
// if the upload button is pressed then small cards of the upload options
// should appear"). The wheel (app/components/ScrollWheel.jsx) and the deck
// (ControlCenter.jsx) drive these; the tests hold them without a DOM.
//
// It is the Disc's physics (lib/disc.js) put to a carousel: drag round the
// ring to turn it, flick it and it coasts, a step (and a tick) for every
// STEP_DEG turned, keys step it one card, reduced motion drops the coast.
//
//   spawning  the wheel is out while a Feed carousel (Figure 20) is centred
//             on the screen — its middle within CENTRE_BAND of the screen's
//             middle and at least VISIBLE_SHARE of it in view — or while the
//             POST cards are up
//   turning   clockwise moves the carousel on (the next card), anticlockwise
//             back; a step every STEP_DEG
//   coasting  a flick keeps turning, losing FRICTION of its speed every 16ms
//             frame, slower than STOP_DEG_PER_S it rests; capped at
//             MAX_DEG_PER_S so a coast never runs past a few cards
//   keys      ArrowRight / ArrowDown a card on, ArrowLeft / ArrowUp a card
//             back, Home / End the ends
//   snapping  (owner, 27 Oct 2026: "a subtle magnetic snapping attached to
//             the cards and the disc") every STEP_DEG is a detent, and a card
//             changes half-way between two: let go, and once slow the Disc's
//             magnet (lib/disc.js — the same pull, tuned for DETENTS) draws
//             the wheel onto the detent of the card in front, so the wheel's
//             marks and the cards always come to rest together

import { tuning, SLOW_DEG_PER_S } from "./disc.js";

export const STEP_DEG = 45;
export const FRICTION = 0.94;
export const STOP_DEG_PER_S = 6;
/** the fastest a flick is taken to be: a coast runs at most
 *  MAX_DEG_PER_S × 16ms / (1 − FRICTION) ≈ 290°, about six cards */
export const MAX_DEG_PER_S = 1080;
export const CENTRE_BAND = 0.22;
export const VISIBLE_SHARE = 0.5;
/** the detents round one turn — the Disc's tuning is read for this count */
export const DETENTS = 360 / STEP_DEG;

/** The angle of a point round the wheel's centre, in degrees clockwise from
 *  twelve o'clock, in [0, 360). dx right, dy down (screen coordinates). */
export function angleOf(dx, dy) {
  const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** The turn from one angle to the next, the short way round, in (-180, 180]. */
export function deltaDeg(prev, next) {
  let d = (next - prev) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** The steps a turn from `from` to `to` (unwrapped degrees) makes: signed,
 *  one for every half-way line between two detents crossed (clockwise
 *  positive) — so a detent is always the middle of a card's turn, and the
 *  magnet's settling never crosses one. */
export function stepsFor(from, to, every = STEP_DEG) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || every <= 0) return 0;
  return Math.round(to / every) - Math.round(from / every);
}

/** The detent nearest `angle` (unwrapped degrees). */
export function restAngle(angle, every = STEP_DEG) {
  if (!Number.isFinite(angle) || every <= 0) return 0;
  return Math.round(angle / every) * every;
}

/** One frame of the wheel let go: it coasts (coast(), capped flicks), and
 *  once slower than the Disc's SLOW_DEG_PER_S the Disc's magnet pulls it
 *  toward the nearest detent — a whisper at the threshold, firm near rest
 *  (lib/disc.js stepMomentum, unwrapped so the steps count true). */
export function magnetStep({ angle, velocity }, dtMs = 16) {
  const dt = Math.max(1, Number.isFinite(dtMs) ? dtMs : 16);
  let a = angle + ((velocity || 0) * dt) / 1000;
  const v = coast(velocity || 0, dt);
  if (Math.abs(v) > SLOW_DEG_PER_S) return { angle: a, velocity: v, settled: false };
  const pull = Math.min(1, (tuning(DETENTS).snap * (1 - Math.abs(v) / SLOW_DEG_PER_S) * dt) / 16);
  const to = restAngle(a);
  a += (to - a) * pull;
  if (!v && Math.abs(to - a) < 0.25) return { angle: to, velocity: 0, settled: true };
  return { angle: a, velocity: v, settled: false };
}

/** The speed (deg/s) of a turn of `deg` over `dtMs`, timed over at least 8ms
 *  (one sample a hair apart is not a flick) and capped at MAX_DEG_PER_S. */
export function flickSpeed(deg, dtMs) {
  if (!Number.isFinite(deg) || !Number.isFinite(dtMs)) return 0;
  const v = (deg / Math.max(8, dtMs)) * 1000;
  return Math.max(-MAX_DEG_PER_S, Math.min(MAX_DEG_PER_S, v));
}

/** The speed (deg/s) a coasting wheel keeps after `dtMs`. */
export function coast(velocity, dtMs, friction = FRICTION) {
  if (!Number.isFinite(velocity) || !Number.isFinite(dtMs) || dtMs <= 0) return velocity || 0;
  const v = velocity * Math.pow(friction, dtMs / 16);
  return Math.abs(v) < STOP_DEG_PER_S ? 0 : v;
}

/** The step a key asks for: +1 / -1, "first" / "last", or null. */
export function keyStep(key) {
  switch (key) {
    case "ArrowRight": case "ArrowDown": return 1;
    case "ArrowLeft": case "ArrowUp": return -1;
    case "Home": return "first";
    case "End": return "last";
    default: return null;
  }
}

/** Which carousel is centred: of `rects` ({ top, bottom } in viewport px),
 *  the one whose middle is nearest the middle of a viewport `viewH` tall,
 *  within CENTRE_BAND of it, with at least VISIBLE_SHARE of it in view.
 *  -1 when none is. */
export function centredIndex(rects, viewH, band = CENTRE_BAND, share = VISIBLE_SHARE) {
  if (!Array.isArray(rects) || !(viewH > 0)) return -1;
  const mid = viewH / 2;
  let best = -1, bestD = Infinity;
  rects.forEach((r, i) => {
    if (!r || !(r.bottom > r.top)) return;
    const h = r.bottom - r.top;
    const seen = Math.max(0, Math.min(r.bottom, viewH) - Math.max(r.top, 0));
    if (seen < h * share) return;
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d <= viewH * band && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

/** The POST cards' ring: `count` cards stand evenly round it, card i at
 *  i × 360 / count; `index` (any integer, unbounded so a turn never swings
 *  the long way round) is the card at the front. The item at the front, and
 *  the ring's spin that brings it there. */
export function ringItem(index, count) {
  if (!(count > 0)) return 0;
  return ((index % count) + count) % count;
}
export function ringSpin(index, count) {
  if (!(count > 0)) return 0;
  return (-index * 360) / count;
}
