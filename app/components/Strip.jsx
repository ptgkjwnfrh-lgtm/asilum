"use client";

// app/components/Strip.jsx — THE STRIP (owner's reference, 25 Oct 2026,
// evening: X's "Videos for you" — tall cards side by side in one row, the
// next one peeking at the edge, a plain sideways scroll). The row of
// recommended motions is this strip; a post's carousel of stills went back
// to Figure 20 (Fig20.jsx) at the owner's word, 25 Oct 2026, late.
//
// Native scrolling with snap points, so the page still scrolls through it
// and a flick behaves the way the phone's own does. `onSettle(index)` says
// which card sits at the left edge after a scroll settles — the counter
// and the motion row's player read it. Reduced motion changes nothing: the
// strip never animates on its own.

import { useEffect, useRef } from "react";

export default function Strip({ items, render, label, aspect = 9 / 16, className = "", onSettle = null }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSettle) return undefined;
    let t = 0;
    const settle = () => {
      const card = el.firstElementChild;
      if (!card) return;
      const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || "0");
      onSettle(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / Math.max(1, step)))));
    };
    const onScroll = () => { clearTimeout(t); t = setTimeout(settle, 90); };
    el.addEventListener("scroll", onScroll, { passive: true });
    settle();
    return () => { clearTimeout(t); el.removeEventListener("scroll", onScroll); };
  }, [items.length, onSettle]);
  return (
    <div className={"strip " + className} role="group" aria-label={label} ref={ref} style={{ "--asp": aspect }}>
      {items.map((it, i) => <div className="stripcard" key={it.key || it.id || i}>{render(it, i)}</div>)}
    </div>
  );
}
