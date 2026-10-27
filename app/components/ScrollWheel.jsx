"use client";

// app/components/ScrollWheel.jsx — THE WHEEL (owner, 26 Oct 2026; the
// sketches 6.jpg and IMG_1166). A click wheel round the deck's POST disc,
// made of the fixtures' own liquid glass — the same pane, the same bend
// that moves every colour alike, no rainbow, "no added colors" — with four
// marks at twelve, three, six and nine pressed into it in the glass's own
// tone. It turns what the deck gives it: a Feed carousel that is centred on
// the screen, or the POST cards when the plus is pressed (ControlCenter.jsx
// says which). A step every 45°, clockwise on (lib/scrollwheel.js). It is
// the Disc's family: drag to turn, flick to coast, a tick each step, keys
// step it, reduced motion drops the coast. Always mounted, so it grows and
// folds as one transformation in CSS, never a popup fading in.

import { useEffect, useRef } from "react";
import { angleOf, deltaDeg, stepsFor, coast, flickSpeed, keyStep, STOP_DEG_PER_S, STEP_DEG } from "../../lib/scrollwheel.js";
import { useLiquidGlass } from "./LiquidGlass.jsx";
import { haptic } from "../../lib/haptics.js";

const MARKS = [0, 90, 180, 270];

export default function ScrollWheel({ open, label, onStep, onEnd }) {
  const ref = useRef(null);
  const ringRef = useRef(null);
  const state = useRef({ angle: 0, drag: null, v: 0, raf: 0, last: 0 });
  // the fixtures' glass: the same component, the one bend, no shine
  const glass = useLiquidGlass(ref, { id: "lg-wheel", strength: 1, bezel: "fixture", shine: false, active: open });

  // the ring shows the turn; every STEP_DEG crossed moves what it turns
  function turn(deg) {
    const s = state.current;
    const before = s.angle;
    s.angle += deg;
    if (ringRef.current) ringRef.current.style.transform = `rotate(${s.angle}deg)`;
    // the Clear Disc's spokes turn with it (ClearDisc.jsx), like light across a CD
    window.dispatchEvent(new CustomEvent("asilum:wheel-turn", { detail: { angle: s.angle } }));
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
    if (still || Math.abs(d.v) < STOP_DEG_PER_S || performance.now() - d.t > 80) return;
    // a flick: the wheel coasts, slowing by the Disc's friction
    s.v = d.v; s.last = performance.now();
    const step = (now) => {
      const dt = now - s.last; s.last = now;
      s.v = coast(s.v, dt);
      if (!s.v) { s.raf = 0; return; }
      turn((s.v * dt) / 1000);
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
    // a key turns the ring a step's worth, so the marks move with it
    turn(k * STEP_DEG);
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
      {glass}
      <span ref={ringRef} className="ccwring" aria-hidden="true">
        {MARKS.map((t) => <i key={t} className="ccwtick" style={{ "--tick": `${t}deg` }} />)}
      </span>
    </div>
  );
}
