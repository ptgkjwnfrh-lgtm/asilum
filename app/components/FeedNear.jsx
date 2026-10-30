"use client";

// app/components/FeedNear.jsx — THE DRUM ONLY WHERE IT CAN BE SEEN (going live, 30 Oct 2026: iPhone Safari, "a problem
// repeatedly occurred on https://www.asilummagazine.com/"). The Feed's drum (app/globals.css, THE VERTICAL STACK) is a
// scroll-driven 3D turn on every cell, filled both ways, so every cell not yet on screen held its first keyframe —
// tilted — and every one of a Feed's cells (121 on the live page) stood as a 3D layer at once: about a gigabyte of
// layer memory at a phone's density, and iOS killed the page. Here a cell within a screen of the view wears
// data-near, and only those ride the drum; the rest are plain boxes no one can see. A screen's margin each way, so a
// cell is already turned before it shows (under the Masthead's and the deck's glass too) and nothing ever snaps.

import { useEffect } from "react";

export const NEAR_MARGIN = "100% 0px";

export default function FeedNear() {
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) e.target.dataset.near = "";
        else delete e.target.dataset.near;
      }
    }, { rootMargin: NEAR_MARGIN });
    const watched = new WeakSet();
    const watch = () => document.querySelectorAll(".fgrid > .fcell").forEach((c) => { if (!watched.has(c)) { watched.add(c); io.observe(c); } });
    watch();
    let wr = 0;
    const mo = new MutationObserver(() => { if (!wr) wr = requestAnimationFrame(() => { wr = 0; watch(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); if (wr) cancelAnimationFrame(wr); };
  }, []);
  return null;
}
