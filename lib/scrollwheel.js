// lib/scrollwheel.js — THE SCROLL WHEEL's laws, as pure functions (owner,
// 26 Oct 2026: "let's make the scroll wheel … the upload button should
// extend out like a cd player ejecting a disc and the scroll wheel should
// morph and appear"; the sketch 6.jpg). The component
// (app/components/ScrollWheel.jsx) and the deck (ControlCenter.jsx) drive
// these; the tests hold them without a DOM.
//
// It is the Disc's physics (lib/disc.js) put to a scroll: drag round the
// ring to turn it, flick it and it coasts, a tick while it turns, arrow keys
// turn it a notch, reduced motion drops the coast.
//
//   opening   a swipe UP on the POST disc of at least EJECT_PX ejects the
//             tray (a tap still opens Post Selection, a long hold still
//             opens the compact menu); ArrowUp on the focused disc does too
//   turning   clockwise scrolls down, anticlockwise up; one full turn
//             (DEG_PER_SCREEN) scrolls one viewport height
//   coasting  a flick keeps turning, losing FRICTION of its speed every
//             16ms frame, until it is slower than STOP_DEG_PER_S
//   ticking   a tick at every NOTCH_DEG crossed
//   keys      ArrowDown / ArrowRight a notch on, ArrowUp / ArrowLeft a notch
//             back, PageDown / PageUp a whole turn, Home / End the ends

export const EJECT_PX = 24;
export const DEG_PER_SCREEN = 360;
export const NOTCH_DEG = 30;
export const KEY_STEP_DEG = NOTCH_DEG;
export const FRICTION = 0.94;
export const STOP_DEG_PER_S = 6;
/** the fastest a flick is taken to be: a coast never runs past about one
 *  screen (MAX_DEG_PER_S × 16ms / (1 − FRICTION) ≈ 290°) */
export const MAX_DEG_PER_S = 1080;

/** Is this vertical travel (px, negative is up) an eject? */
export function isEject(dy) {
  return Number.isFinite(dy) && dy <= -EJECT_PX;
}

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

/** Pixels to scroll for a turn of `deg` on a viewport `viewportH` tall:
 *  clockwise (positive) scrolls down. */
export function scrollFor(deg, viewportH) {
  if (!Number.isFinite(deg) || !Number.isFinite(viewportH) || viewportH <= 0) return 0;
  return (deg / DEG_PER_SCREEN) * viewportH;
}

/** How many notches a turn from `from` to `to` (unwrapped degrees) crosses. */
export function notches(from, to, every = NOTCH_DEG) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || every <= 0) return 0;
  return Math.abs(Math.floor(to / every) - Math.floor(from / every));
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

/** The turn a key asks for, in degrees; null for a key the wheel ignores,
 *  "home" / "end" for the ends. */
export function keyTurn(key) {
  switch (key) {
    case "ArrowDown": case "ArrowRight": return KEY_STEP_DEG;
    case "ArrowUp": case "ArrowLeft": return -KEY_STEP_DEG;
    case "PageDown": return DEG_PER_SCREEN;
    case "PageUp": return -DEG_PER_SCREEN;
    case "Home": return "home";
    case "End": return "end";
    default: return null;
  }
}
