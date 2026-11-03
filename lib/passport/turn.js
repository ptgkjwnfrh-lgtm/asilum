// lib/passport/turn.js — THE TURN of the lifted passport (PassportSpin.jsx;
// owner, 3 Nov 2026: "click on their passport and have it isolate it in
// space and spin it"), as a function of time, so the stage and the tests
// read one clock. Client-safe, no imports.
//
// The front held; a slow spin that winds into one fast full turn; slowing
// onto the back, where the asterisk blinks red three times and holds one
// glow; then round to the front again, where the angle rests at 720.

// name and length (seconds) of each part, in order
export const SEGMENTS = Object.freeze([
  ["hold", 1.0], ["slow", 2.0], ["fast", 0.75], ["settle", 1.4], ["back", 2.8], ["return", 1.8],
]);
export const TURN = SEGMENTS.reduce((s, [, d]) => s + d, 0);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const inCubic = (t) => t * t * t;
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The turn at time t (seconds from the lift): the card's angle in degrees, whether the asterisk is red, and how
 *  far its held glow has swelled (0–1). The three flashes sit inside one second, never more (WCAG 2.3.1). */
export function turnAt(t) {
  let u = t;
  for (const [name, d] of SEGMENTS) {
    if (u <= d) {
      const p = clamp(u / d, 0, 1);
      if (name === "hold") return { angle: 0, red: false, glow: 0 };
      if (name === "slow") return { angle: 100 * inCubic(p), red: false, glow: 0 };
      if (name === "fast") return { angle: 100 + 360 * p, red: false, glow: 0 };
      if (name === "settle") return { angle: 460 + 80 * outCubic(p), red: false, glow: 0 };
      if (name === "back") {
        const red = (u > 0.35 && u < 0.5) || (u > 0.6 && u < 0.75) || (u > 0.85 && u < 1.15);
        const glow = u > 1.3 && u < 2.6 ? Math.sin(Math.PI * clamp((u - 1.3) / 1.3, 0, 1)) : 0;
        return { angle: 540, red, glow };
      }
      return { angle: 540 + 180 * inOut(p), red: false, glow: 0 };
    }
    u -= d;
  }
  return { angle: 720, red: false, glow: 0 };
}
