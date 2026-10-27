"use client";

// app/components/ScrollWheel.jsx — THE WHEEL (owner, 26 Oct 2026; the
// sketches 6.jpg and IMG_1166; 27 Oct: "the disc is the actual liquid glass
// wheel … the upload button should be its middle and its turning point …
// i don't want the upload button to rotate, only the disc"). A click wheel
// of liquid glass centred on the POST plus — the plus is its hub and never
// turns — with four marks at twelve, three, six and nine pressed into it in
// the glass's own tone. Its glass is the one pane that parts the colours:
// the V.1 magazine's rainbow (27 Oct), so the Feed behind it bends and
// splits like the FRONT COVER letters under the old strip. It turns what the deck gives it: a Feed carousel that is centred on
// the screen, or the POST cards when the plus is pressed (ControlCenter.jsx
// says which). A step every 45°, clockwise on (lib/scrollwheel.js). It is
// the Disc's family: drag to turn, flick to coast, a tick each step, the
// Disc's magnet onto a detent when let go, keys step it, reduced motion
// drops the coast. Always mounted, so it grows and
// folds as one transformation in CSS, never a popup fading in.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { angleOf, deltaDeg, stepsFor, magnetStep, restAngle, flickSpeed, keyStep, STOP_DEG_PER_S, STEP_DEG } from "../../lib/scrollwheel.js";
import { useLiquidGlass } from "./LiquidGlass.jsx";
import { V1_RAINBOW } from "./RainbowGlass.jsx";
import { haptic } from "../../lib/haptics.js";

const MARKS = [0, 90, 180, 270];
// what the wheel bends where Safari cannot bend a backdrop: the Feed behind
// it — never the deck's own ad strip, which sits over the wheel's glass
export const WHEEL_BEND = ".card, .headline, .headsub, .demobanner, .ctmeta";
// the spokes: from the plus's ring (hub, a share of the radius) out to the
// rim, n × 2 wedges, each point pulled `reach` of the way back to the hub,
// the wedges narrowed by `sharp` (owner, 27 Oct: "stems out like in the
// yeezus cover"; tuned over stripes: a partial pull made blobs, a near-full
// pull back to the hub with broad wedges makes streaks — the stems)
export const SPOKES = Object.freeze({ hub: 0.38, n: 2, reach: 0.95, sharp: 0.5 });

export default function ScrollWheel({ open, label, onStep, onEnd }) {
  const ref = useRef(null);
  const ringRef = useRef(null);
  const glassRef = useRef(null);
  const [host, setHost] = useState(null);
  const state = useRef({ angle: 0, drag: null, v: 0, raf: 0, last: 0 });
  useEffect(() => { setHost(document.body); }, []);
  // THE GLASS IS A LAYER OF ITS OWN (27 Oct 2026). The deck's glass is a
  // backdrop-filter, which makes the deck a Backdrop Root: a backdrop-filter
  // inside it sees only the deck's own paint, never the Feed — the wheel's
  // bend reached nothing (stripes laid under it stayed straight). So the
  // wheel's pane (.ccwglass) lives on <body>, one level under the deck,
  // kept on the wheel's circle every frame it moves; the wheel in the deck
  // keeps the hand, the keys and the turning marks, and the plus — its hub
  // — paints over the glass. The pane carries the V.1 magazine's rainbow
  // (RainbowGlass.jsx), the one glass that parts the colours, with V.1's
  // own bezel; on Safari the cards under it are bent the same three ways.
  const glass = useLiquidGlass(glassRef, { id: "lg-wheel", strength: 1, shine: false, active: open && !!host, bend: WHEEL_BEND, dispersion: V1_RAINBOW });
  useEffect(() => {
    const el = ref.current, pane = glassRef.current;
    if (!el || !pane) return undefined;
    let raf = 0, until = performance.now() + 900;
    const sync = () => {
      raf = 0;
      // the wheel's circle as drawn this frame (it grows out of the plus):
      // sized, not scaled, so the glass's map is always drawn to its size
      const b = el.getBoundingClientRect();
      if (b.width) {
        pane.style.width = `${b.width}px`; pane.style.height = `${b.height}px`;
        pane.style.left = `${b.left}px`; pane.style.top = `${b.top}px`;
        pane.style.opacity = getComputedStyle(el).opacity;
      }
      if (performance.now() < until) raf = requestAnimationFrame(sync);
    };
    const wake = () => { until = performance.now() + 900; if (!raf) raf = requestAnimationFrame(sync); };
    sync();
    wake();
    window.addEventListener("resize", wake);
    el.addEventListener("transitionend", wake);
    return () => { window.removeEventListener("resize", wake); el.removeEventListener("transitionend", wake); if (raf) cancelAnimationFrame(raf); };
  }, [open, host]);

  // the ring shows the turn; every STEP_DEG crossed moves what it turns
  function turn(deg) {
    const s = state.current;
    const before = s.angle;
    s.angle += deg;
    if (ringRef.current) ringRef.current.style.transform = `rotate(${s.angle}deg)`;
    const steps = stepsFor(before, s.angle);
    if (steps) { haptic("tick"); onStep(steps); }
  }

  function stopCoast() {
    const s = state.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0; s.v = 0;
  }

  function centre() {
    const r = ref.current.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function down(e) {
    if (!open || e.button) return;
    stopCoast();
    const c = centre();
    state.current.drag = { id: e.pointerId, a: angleOf(e.clientX - c.x, e.clientY - c.y), t: performance.now(), v: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* an old engine */ }
  }

  function move(e) {
    const d = state.current.drag;
    if (!d || d.id !== e.pointerId) return;
    const c = centre();
    const a = angleOf(e.clientX - c.x, e.clientY - c.y);
    const da = deltaDeg(d.a, a);
    const now = performance.now();
    d.v = flickSpeed(da, now - d.t); // deg/s, for the coast
    d.a = a; d.t = now;
    if (da) turn(da);
  }

  function up(e) {
    const s = state.current;
    const d = s.drag;
    if (!d || d.id !== e.pointerId) return;
    s.drag = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // a fresh flick coasts first; any release ends on a detent
    const flick = !still && Math.abs(d.v) >= STOP_DEG_PER_S && performance.now() - d.t <= 80;
    settle(flick ? d.v : 0, still);
  }

  // THE MAGNET (owner, 27 Oct 2026: "a subtle magnetic snapping attached to
  // the cards and the disc"): let go, the wheel coasts and then the Disc's
  // pull draws it onto the detent of the card in front (lib/scrollwheel.js
  // magnetStep). Reduced motion: straight onto the detent, no glide.
  function settle(v, still) {
    const s = state.current;
    stopCoast();
    if (still) { turn(restAngle(s.angle) - s.angle); return; }
    s.v = v; s.last = performance.now();
    const step = (now) => {
      const dt = now - s.last; s.last = now;
      const next = magnetStep({ angle: s.angle, velocity: s.v }, dt);
      s.v = next.velocity;
      turn(next.angle - s.angle);
      if (next.settled) { s.raf = 0; return; }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }

  // Escape is the deck's alone (useEscape in ControlCenter.jsx): handled here
  // as well, React re-renders between the two and the second sees the cards
  // already gone, so one press both closed the cards and put the wheel away
  function key(e) {
    const k = keyStep(e.key);
    if (k === null) return;
    e.preventDefault();
    stopCoast();
    if (k === "first" || k === "last") { onEnd(k); return; }
    // a key turns the ring a step's worth, from its detent onto the next
    turn(restAngle(state.current.angle) + k * STEP_DEG - state.current.angle);
  }

  // closing stops a coast mid-turn
  useEffect(() => { if (!open) stopCoast(); }, [open]);
  useEffect(() => () => stopCoast(), []);

  return (
    <div
      ref={ref}
      className="ccwheel"
      role="slider"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={0}
      aria-hidden={open ? undefined : true}
      tabIndex={open ? 0 : -1}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <span ref={ringRef} className="ccwring" aria-hidden="true">
        {MARKS.map((t) => <i key={t} className="ccwtick" style={{ "--tick": `${t}deg` }} />)}
      </span>
      {host ? createPortal(
        <span ref={glassRef} className="ccwglass" data-open={open ? "1" : undefined} aria-hidden="true">
          {glass}
          {/* the spokes the face bends the Feed along, from the plus out (the Yeezus cover; LiquidGlass.jsx "spokes") */}
          <i className="ccwspokes" data-lens-shape="spokes" data-lens-hub={SPOKES.hub} data-lens-spokes={SPOKES.n} data-lens-reach={SPOKES.reach} data-lens-sharp={SPOKES.sharp} />
        </span>, host) : null}
    </div>
  );
}
