"use client";

// app/components/InkWatch.jsx — THE REACTIVE INK, measured (owner, 28 Oct
// 2026: "for all the text and symbols they must be reactive to go from dark
// to light depending on the background to strengthen ledibility";
// lib/ink.js). Mounted once by the shell. For each Feed cell that comes into
// view, each block of words or marks over it (INK_ZONES) is read against
// what is really under it — at six points across the block, the picture
// there (its own pixels, sampled once per picture on a small grid) or, where
// no picture is, the page — and wears data-ink="dark" or "light"; the CSS
// turns that into the ink (and flips a scrim). Read again when a picture
// loads, when Figure 20 settles on another card, when the theme turns and
// when the window is resized. A picture that cannot be read (another site's,
// served without CORS) leaves its block as it was: the ink the card's
// ground gave it, on its scrim. Nothing here moves on scroll.

import { useEffect } from "react";
import { INK_ZONES, lumaGrid, regionLuma, zoneOnPicture, inkOn, luma } from "../../lib/ink.js";

const GRID = 24;
export const QUIET_MS = 140; // how long the page rests before the blocks are read
// a picture's src -> its pixels on the small grid (or null: cannot be read). The pixels, not a brightness: a
// picture's clear parts show what is behind it, which turns with the theme (measured 28 Oct 2026: a tile's
// half-clear foot read bright in the light theme and kept its dark ink over the dark one)
const grids = new Map();

function draw(source, nw, nh) {
  const cv = document.createElement("canvas");
  cv.width = GRID; cv.height = GRID;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(source, 0, 0, GRID, GRID);
  const { data } = cx.getImageData(0, 0, GRID, GRID); // throws on a picture another site will not share
  return { data, nw, nh };
}

function gridOf(media) {
  const video = media.tagName === "VIDEO";
  const src = media.currentSrc || media.src || media.poster;
  if (!src) return null;
  if (grids.has(src)) return grids.get(src);
  const nw = video ? media.videoWidth : media.naturalWidth, nh = video ? media.videoHeight : media.naturalHeight;
  if (!(nw > 0) || !(nh > 0) || (video && media.readyState < 2) || (!video && !media.complete)) return null; // not yet: read on load
  let out = null;
  try { out = draw(media, nw, nh); } catch { out = null; }
  if (!out && !video && !/^data:/.test(src)) {
    // the element itself is tainted: ask again with CORS, once; the answer comes on its own load
    grids.set(src, null);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => { try { grids.set(src, draw(im, im.naturalWidth, im.naturalHeight)); window.dispatchEvent(new Event("asilum:ink")); } catch { /* stays unreadable */ } };
    im.src = src;
    return null;
  }
  grids.set(src, out);
  return out;
}

// a colour's brightness and opacity, as the browser resolves it
let pen = null;
function colourLuma(css) {
  pen = pen || document.createElement("canvas").getContext("2d");
  pen.fillStyle = "#010203"; // a mark: a colour the pen cannot read leaves it, and is no reading
  pen.fillStyle = css || "transparent";
  const v = pen.fillStyle;
  if (v === "#010203") return null;
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); return luma((n >> 16) & 255, (n >> 8) & 255, n & 255); }
  const r = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(v);
  return r && !(r[4] != null && +r[4] < 0.5) ? luma(+r[1], +r[2], +r[3]) : null;
}
// the page's own brightness, from its paper token
const pageLuma = () => colourLuma(getComputedStyle(document.documentElement).getPropertyValue("--paper").trim()) ?? 1;
// what is behind a picture: the first box under it with a ground of its own, else the page
function behind(media, ground) {
  for (let el = media.parentElement; el && el !== document.body; el = el.parentElement) {
    const l = colourLuma(getComputedStyle(el).backgroundColor);
    if (l != null) return l;
  }
  return ground;
}

// the picture under a point: the first in the stack there, or one a wrapper holds (a picture that ignores the
// pointer, as Figure 20's do, is not in the stack itself)
const isMedia = (el) => el.tagName === "IMG" || el.tagName === "VIDEO";
function mediaAt(x, y, zone) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (zone.contains(el)) continue;
    if (isMedia(el)) return el;
    for (const m of el.querySelectorAll(":scope > img, :scope > video, :scope > picture > img")) {
      const b = m.getBoundingClientRect();
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return m;
    }
  }
  return null;
}

// THE BRIGHT CARD UNDER A POINT, for the logo's tint (Wordmark.jsx; lib/ink.js TINT_BRIGHT): looking down through
// the stack below `skip` (the Masthead), the first thing with a ground of its own. A block this watcher has read
// answers with its reading (data-ink "dark" sits on a bright ground: a light photograph's foot under its scrim);
// otherwise a picture or a gradient is no answer, and a plain colour as bright as TINT_BRIGHT, on a card, is. The
// answer is that box. This reads styles and the watcher's own marks and hit tests a handful of points; it runs on
// scroll frames, so it reads no pixels itself.
export function brightSurfaceAt(x, y, skip, bright) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (skip && skip.contains(el)) continue;
    const zone = el.closest("[data-ink]");
    if (zone && !(skip && skip.contains(zone))) return zone.dataset.ink === "dark" ? zone : null;
    if (isMedia(el)) return null;
    for (const m of el.querySelectorAll(":scope > img, :scope > video, :scope > picture > img")) {
      const b = m.getBoundingClientRect();
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return null;
    }
    const cs = getComputedStyle(el);
    if (cs.backgroundImage !== "none") return null;
    const l = colourLuma(cs.backgroundColor);
    if (l == null) continue; // clear: what shows is further down
    return l >= bright && el.closest(".card, .brdcst") ? el : null;
  }
  return null;
}
function measureZone(zone, ground) {
  const r = zone.getBoundingClientRect();
  if (!(r.width > 0) || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
  const ls = [];
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.3, 0.7]) {
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width * fx)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height * fy));
    const media = mediaAt(x, y, zone);
    if (!media) { ls.push(ground); continue; }
    const g = gridOf(media);
    if (!g) { ls.push(null); continue; }
    const grid = lumaGrid(g.data, GRID, GRID, behind(media, ground));
    const box = media.getBoundingClientRect();
    const fit = getComputedStyle(media).objectFit === "contain" ? "contain" : "cover";
    const cell = { left: x - r.width / 6, top: y - r.height / 4, width: r.width / 3, height: r.height / 2 };
    const at = zoneOnPicture(cell, box, g.nw, g.nh, fit);
    ls.push(at ? regionLuma(grid, GRID, GRID, at) : ground);
  }
  if (ls.some((l) => l == null)) return; // a picture not read yet (or never): leave the block as it is
  const ink = inkOn(ls.reduce((a, b) => a + b, 0) / ls.length);
  if (ink && zone.dataset.ink !== ink) zone.dataset.ink = ink;
}

export default function InkWatch() {
  useEffect(() => {
    const SEL = INK_ZONES.join(", ");
    // each block is watched itself and read once it is mostly in view (a cell's own entry came while its far
    // block was still off the screen, and was not read again)
    const pending = new Set();
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (performance.now() - lastScroll < QUIET_MS) { later(); return; }
      const ground = pageLuma();
      for (const z of pending) if (z.isConnected) measureZone(z, ground);
      pending.clear();
    };
    // READ WHEN THE PAGE IS STILL (measured 28 Oct 2026: reading while the drum turned — every reading a hit
    // test against the moving cards — dropped 23 frames in 300 at a brisk scroll; none once deferred). The
    // blocks asked for wait until the scroll has rested QUIET_MS, then are read in idle time.
    let quiet = 0;
    const later = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        if (typeof requestIdleCallback === "function") raf = requestIdleCallback(flush, { timeout: 400 });
        else raf = setTimeout(flush, 0);
      }, QUIET_MS);
    };
    const ask = (z) => { if (z) { pending.add(z); later(); } };
    let lastScroll = 0;
    const onScroll = () => { lastScroll = performance.now(); if (pending.size) later(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    const seen = new Set();
    const io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) { seen.add(e.target); ask(e.target); } else seen.delete(e.target); } }, { threshold: [0, 0.6, 1] });
    const watch = () => document.querySelectorAll(SEL).forEach((z) => { if (!z.__ink) { z.__ink = true; io.observe(z); } });
    watch();
    let wr = 0;
    const mo = new MutationObserver(() => { if (!wr) wr = requestAnimationFrame(() => { wr = 0; watch(); }); }); // once a frame at most
    mo.observe(document.body, { childList: true, subtree: true });
    const inCell = (t) => { const cell = t && t.closest && t.closest(".fcell"); if (cell) cell.querySelectorAll(SEL).forEach((z) => { if (seen.has(z)) ask(z); }); };
    const again = () => seen.forEach(ask);
    const onLoad = (e) => inCell(e.target);
    const onSettle = (e) => inCell(e.target);
    document.addEventListener("load", onLoad, true);
    document.addEventListener("loadeddata", onLoad, true);
    document.addEventListener("f20settle", onSettle);
    window.addEventListener("asilum:ink", again);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(again, 200); };
    window.addEventListener("resize", onResize);
    const theme = new MutationObserver(again);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", again);
    return () => {
      io.disconnect(); mo.disconnect(); theme.disconnect();
      document.removeEventListener("load", onLoad, true);
      document.removeEventListener("loadeddata", onLoad, true);
      document.removeEventListener("f20settle", onSettle);
      window.removeEventListener("asilum:ink", again);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", again);
      clearTimeout(rt);
      window.removeEventListener("scroll", onScroll);
      clearTimeout(quiet);
      if (raf) { if (typeof cancelIdleCallback === "function") cancelIdleCallback(raf); clearTimeout(raf); }
      if (wr) cancelAnimationFrame(wr);
    };
  }, []);
  return null;
}
