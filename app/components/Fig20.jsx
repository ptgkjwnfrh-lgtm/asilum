"use client";

// app/components/Fig20.jsx — FIGURE 20 (owner's feed sketch, 25 Oct 2026):
// a post's carousel of stills, and the row of recommended motions. THREE
// cards lie flat in the middle; EVERY other card is visible, stacked at the
// two ends as thin slivers — a carousel of twenty shows three flat and the
// other seventeen split between the stacks (owner: "if 3 are laid flat I
// want 17 divided by 2 visibly stacked side by side on the right and left").
// Each stacked card stands on its OUTER edge and is TUCKED OUTWARD: its
// inner edge swings toward the viewer, so the stacks open away from the
// middle (owner, 25 Oct 2026, late: "invert the animations, it's being
// tucked in inward, I want it tucked outward" — the reverse of the turn
// the earlier cut settled on); a card coming off a stack flattens as it
// reaches the middle, and leaves the other way.
//
// THE FLAT CARDS FILL THE HEIGHT (same night: the carousel is "almost the
// same height and width of a regular motion or still post"): as many lie
// flat — three at most — as fit across FLAT_SHARE of the width at the
// stage's full height; in a post-sized cell that is one, centred, the iPod's
// way; in a short band, three.
//
// The component lays its cards out itself — a scroller cannot show every
// card at once — from one number, `pos`, the card at the centre. A drag, a
// swipe, a sideways wheel or the arrow keys move it; letting go settles on
// the nearest card. A tap on a stacked or side card brings it to the
// centre; a tap on the centre card is the card's own (it opens). The deck's
// wheel turns it too, by an f20step event, while it is centred. The page
// still scrolls vertically through it (touch-action: pan-y). Reduced
// motion: no gliding — the cards jump to their places.
//
// THE RING (owner, 28 Oct 2026: "for carousels they should be infinite,
// however the first and last card should have a slight magnetic drag"):
// past the last card comes the first, either way; every card takes its
// place by its offset from the centre the short way round, so the stacks
// either side always hold the rest. The seam between the last card and
// the first holds the hand back a little and stops a flick on its card
// (lib/fig20.js). Keys, the deck's wheel and a tap go round freely.

import { useEffect, useRef } from "react";
import { wrap, ringOffset, nearestTo, seamDrag, settleTarget } from "../../lib/fig20.js";

export const FLAT = 3;            // cards that lie flat
const FLAT_SHARE = 0.72;          // of the width the flat cards may take
const EDGE_DEG = 72;              // how far a stacked card turns
export const GLIDE = 0.2;         // of the gap closed per 16.7ms of real time

export default function Fig20({ items, render, label, aspect = 3 / 4, className = "", onSettle = null }) {
  const stageRef = useRef(null);
  const st = useRef({ pos: 0, target: 0, raf: 0, drag: null, moved: false, step: 1, snap: 0 });
  const n = items.length;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !n) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = st.current;
    // open in the middle, so the stacks either side hold every other card
    s.pos = s.target = Math.floor((n - 1) / 2);

    const layout = () => {
      const W = stage.clientWidth, H = stage.clientHeight;
      const cards = stage.children;
      if (!W || !H || !cards.length) return;
      const gap = Math.max(6, W * 0.012);
      const tall = H * aspect;                      // a card's width at the full height
      const flatN = Math.max(1, Math.min(FLAT, n, Math.floor((W * FLAT_SHARE + gap) / (tall + gap))));
      let cw = Math.min(tall, (W * FLAT_SHARE - (flatN - 1) * gap) / flatN);
      let ch = cw / aspect;
      if (ch > H) { ch = H; cw = ch * aspect; }
      const flatW = flatN * cw + (flatN - 1) * gap;
      const half = (flatN - 1) / 2;                 // a card is flat while |d| <= half
      const mid = W / 2, top = (H - ch) / 2;
      const vis = cw * Math.cos((EDGE_DEG * Math.PI) / 180); // a turned card's footprint
      const room = Math.max(0, (W - flatW) / 2 - gap - vis);   // what each stack has beyond its first card
      // each card's offset from the centre, the short way round the ring
      const offs = Array.from(cards, (_, i) => ringOffset(i, s.pos, n));
      const nL = offs.filter((d) => d < -half).length, nR = offs.filter((d) => d > half).length;
      const sl = Math.min(14, room / Math.max(1, Math.max(nL, nR) - 1));
      s.step = cw + gap;
      // the cards' size changes only with the stage's: per frame, only their
      // transforms move (28 Oct 2026, "EVERY ANIMATION SHOULD [BE] EXTREMELY
      // SMOOTH" — re-sizing every card every frame re-laid them all out)
      const size = cw.toFixed(1) + "x" + ch.toFixed(1) + "@" + top.toFixed(1);
      const resize = size !== s.size;
      s.size = size;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (resize || c.__f20 !== size) {
          c.style.width = cw.toFixed(1) + "px";
          c.style.height = ch.toFixed(1) + "px";
          c.style.top = top.toFixed(1) + "px";
          c.__f20 = size;
        }
        const d = offs[i];
        const a = Math.abs(d), sgn = d < 0 ? -1 : 1;
        if (a <= half) {
          c.style.transformOrigin = "center center";
          c.style.transform = `translateX(${(mid + d * (cw + gap) - cw / 2).toFixed(1)}px)`;
        } else {
          const e = a - half;                     // how far past the flat cards
          const t = Math.min(1, e), ease = t * t * (3 - 2 * t);
          // the card's OUTER edge: where it would lie flat, gliding to its place in the stack
          const flatEdge = mid + sgn * (a * (cw + gap) + cw / 2);
          const firstEdge = mid + sgn * (flatW / 2 + gap + vis);
          let edge = e < 1 ? flatEdge + (firstEdge - flatEdge) * ease : firstEdge + sgn * (e - 1) * sl;
          edge = sgn > 0 ? Math.min(W - 1, edge) : Math.max(1, edge);
          const left = sgn > 0 ? edge - cw : edge;
          // stands on its outer edge, tucked outward: with the origin on the
          // outer edge, -deg on the right and +deg on the left bring the inner
          // edge toward the viewer (it draws taller than the outer one)
          c.style.transformOrigin = sgn > 0 ? "right center" : "left center";
          c.style.transform = `translateX(${left.toFixed(1)}px) rotateY(${(-sgn * EDGE_DEG * ease).toFixed(1)}deg)`;
        }
        c.style.zIndex = String(1000 - Math.round(a * 10));
      }
    };
    // THE GLIDE, timed by the clock (28 Oct 2026): it closes GLIDE of the gap
    // every 16.7ms of real time, so it is the same glide at 60, 90 or 120 Hz
    // and a dropped frame catches up instead of stalling
    const glide = (now) => {
      s.raf = 0;
      const t = typeof now === "number" ? now : performance.now();
      const dt = Math.min(64, s.lastT ? t - s.lastT : 16.667);
      s.lastT = t;
      const diff = s.target - s.pos;
      if (still || Math.abs(diff) < 0.002) s.pos = s.target;
      else s.pos += diff * (1 - Math.pow(1 - GLIDE, dt / 16.667));
      layout();
      if (s.pos !== s.target) s.raf = requestAnimationFrame(glide);
      else { s.lastT = 0; stage.dispatchEvent(new CustomEvent("f20settle", { detail: { index: wrap(s.pos, n) } })); if (onSettle) onSettle(wrap(s.pos, n)); }
    };
    // the ring has no ends: any card, either way round
    const go = (to) => { s.target = to; if (!s.raf) s.raf = requestAnimationFrame(glide); };

    const down = (e) => {
      if (e.button) return;
      const now = performance.now();
      s.drag = { x: e.clientX, pos: s.pos, lastX: e.clientX, lastT: now, v: 0 };
      s.moved = false;
    };
    const move = (e) => {
      const g = s.drag;
      if (!g) return;
      const dx = e.clientX - g.x;
      if (!s.moved && Math.abs(dx) > 6) { s.moved = true; try { stage.setPointerCapture(e.pointerId); } catch {} }
      if (!s.moved) return;
      const now = performance.now();
      g.v = (e.clientX - g.lastX) / Math.max(1, now - g.lastT);
      g.lastX = e.clientX; g.lastT = now;
      // the hand moves the ring, held back a little across the seam
      s.pos = s.target = seamDrag(g.pos, -dx / s.step, n);
      if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; s.lastT = 0; }
      layout();
    };
    const up = () => {
      const g = s.drag;
      s.drag = null;
      if (!g || !s.moved) return;
      // a flick carries on a card or two, and stops on the card at the seam
      go(settleTarget(s.pos, -(g.v * 160) / s.step, n));
    };
    const click = (e) => {
      if (s.moved) { e.preventDefault(); e.stopPropagation(); s.moved = false; return; }
      const card = e.target.closest && e.target.closest(".f20card");
      if (!card) return;
      const i = Array.prototype.indexOf.call(stage.children, card);
      if (i >= 0 && i !== wrap(s.pos, n)) { e.preventDefault(); e.stopPropagation(); go(nearestTo(i, s.pos, n)); }
    };
    const wheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      s.target += e.deltaX / s.step;
      clearTimeout(s.snap);
      s.snap = setTimeout(() => go(Math.round(s.target)), 140);
      if (!s.raf) s.raf = requestAnimationFrame(glide);
    };
    const key = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(Math.round(s.target) + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(Math.round(s.target) - 1); }
    };
    // THE WHEEL turns a centred carousel (ControlCenter.jsx, 26 Oct 2026):
    // a step on or back, or to an end
    const step = (e) => {
      const d = (e && e.detail) || {};
      if (d.to === "first") go(nearestTo(0, s.target, n));
      else if (d.to === "last") go(nearestTo(n - 1, s.target, n));
      else if (Number.isFinite(d.by)) go(Math.round(s.target) + d.by);
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("click", click, true);
    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("keydown", key);
    stage.addEventListener("f20step", step);
    const ro = new ResizeObserver(layout);
    ro.observe(stage);
    layout();
    stage.dispatchEvent(new CustomEvent("f20settle", { detail: { index: wrap(s.pos, n) } }));
    if (onSettle) onSettle(wrap(s.pos, n));
    return () => {
      ro.disconnect();
      if (s.raf) cancelAnimationFrame(s.raf);
      clearTimeout(s.snap);
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
      stage.removeEventListener("click", click, true);
      stage.removeEventListener("wheel", wheel);
      stage.removeEventListener("keydown", key);
      stage.removeEventListener("f20step", step);
    };
  }, [n, aspect]);

  return (
    <div className={"fig20 " + className} role="group" aria-label={label}>
      <div className="f20stage" ref={stageRef} tabIndex={0} aria-roledescription="carousel">
        {items.map((it, i) => <div className="f20card" key={it.key || it.id || i}>{render(it, i)}</div>)}
      </div>
    </div>
  );
}
