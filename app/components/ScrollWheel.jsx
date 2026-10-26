"use client";

// app/components/ScrollWheel.jsx — THE SCROLL WHEEL (owner, 26 Oct 2026:
// "let's make the scroll wheel … the upload button should extend out like a
// cd player ejecting a disc and the scroll wheel should morph and appear";
// the sketch 6.jpg). A click wheel round the deck's POST disc: the deck
// ejects the disc on a tray (ControlCenter.jsx), and this ring grows out of
// it, centred on the tray, with four ticks at twelve, three, six and nine.
// Turning it scrolls the page: clockwise down, anticlockwise up, a whole turn
// one screen (lib/scrollwheel.js). It is the Disc's family: drag to turn,
// flick to coast, a tick while it turns, keys turn it a notch, reduced
// motion drops the coast. It is always mounted, so opening and closing are
// one continuous transformation in CSS, never a popup fading in.

import { useEffect, useRef } from "react";
import { angleOf, deltaDeg, scrollFor, notches, coast, flickSpeed, keyTurn, STOP_DEG_PER_S } from "../../lib/scrollwheel.js";
import { haptic } from "../../lib/haptics.js";

const TICKS = [0, 90, 180, 270];

export default function ScrollWheel({ open, onClose }) {
  const ref = useRef(null);
  const ringRef = useRef(null);
  const state = useRef({ angle: 0, drag: null, v: 0, raf: 0, last: 0 });

  // the ring shows the turn; the page scrolls by it
  function turn(deg) {
    const s = state.current;
    const before = s.angle;
    s.angle += deg;
    if (ringRef.current) ringRef.current.style.transform = `rotate(${s.angle}deg)`;
    const px = scrollFor(deg, window.innerHeight);
    if (px) window.scrollBy(0, px);
    if (notches(before, s.angle)) haptic("tick");
    if (ref.current) ref.current.setAttribute("aria-valuenow", String(scrolled()));
  }

  function scrolled() {
    const el = document.scrollingElement || document.documentElement;
    const max = Math.max(1, el.scrollHeight - window.innerHeight);
    return Math.round((window.scrollY / max) * 100);
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

  function key(e) {
    const k = keyTurn(e.key);
    if (e.key === "Escape") { e.preventDefault(); onClose(true); return; }
    if (k === null) return;
    e.preventDefault();
    stopCoast();
    if (k === "home") { window.scrollTo(0, 0); return; }
    if (k === "end") { window.scrollTo(0, (document.scrollingElement || document.documentElement).scrollHeight); return; }
    turn(k);
  }

  // closing stops a coast mid-turn
  useEffect(() => { if (!open) stopCoast(); }, [open]);
  useEffect(() => () => stopCoast(), []);

  return (
    <div
      ref={ref}
      className="ccwheel"
      role="slider"
      aria-label="scroll wheel: turn clockwise to scroll down"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
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
        {TICKS.map((t) => <i key={t} className="ccwtick" style={{ "--tick": `${t}deg` }} />)}
      </span>
    </div>
  );
}
