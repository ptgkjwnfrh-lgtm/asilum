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
//
// READ AHEAD (owner, 29 Oct 2026: "the reactive fonts on the cards is slow and
// weird"). Measured: every block came on screen unread and took its ink a
// median 0.5s later (0.8s at worst), then faded into it — it waited for the
// scroll to rest, then for idle time, because it found the picture under a
// block by hit-testing the screen, which only works on screen and dropped
// frames mid-scroll. Now a block is read a screen before it arrives: the
// picture under it is found by geometry, among its own cell's pictures (no
// hit test, so off the screen works and nothing waits for the scroll to
// rest), in idle slices of the frame. The first reading lands as it is; only
// a later one (a settle, a theme turn, a picture loading late) eases.

import { useEffect } from "react";
import { INK_ZONES, lumaGrid, regionLuma, zoneOnPicture, inkOn, luma } from "../../lib/ink.js";

const GRID = 24;
export const AHEAD = "100% 0px 100% 0px"; // a block is read a screen before it comes on (and after it leaves)
const SLICE_MS = 3; // the idle time a reading needs left in the frame before it starts on another block
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

// the picture under a point, by geometry: among the pictures of the block's own cell (never the block's own), the
// ones drawn and showing there; where cards of a carousel overlap, the one whose card stacks highest (Figure 20
// sets each card's z-index, the front one's 1000), and on a tie the one most centred on the point. No hit test,
// so a block off the screen is read as well as one on it. (Checked against the hit test on the screen, 29 Oct
// 2026: the most-centred rule alone chose a card behind the front one at 6 of 138 points.)
const isMedia = (el) => el.tagName === "IMG" || el.tagName === "VIDEO";
function stackOf(el, cell) {
  for (let p = el; p && p !== cell; p = p.parentElement) {
    const z = parseInt(getComputedStyle(p).zIndex, 10);
    if (Number.isFinite(z)) return z;
  }
  return 0;
}
function mediaUnder(x, y, zone) {
  const cell = zone.closest(".fcell") || zone.closest(".card");
  if (!cell) return null;
  let best = null, bz = -Infinity, bd = Infinity;
  for (const m of cell.querySelectorAll("img, video")) {
    if (zone.contains(m) || !(m.offsetWidth > 0)) continue;
    const b = m.getBoundingClientRect();
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
    const cs = getComputedStyle(m);
    if (cs.visibility === "hidden" || +cs.opacity < 0.05) continue;
    const z = stackOf(m, cell), d = Math.hypot(x - (b.left + b.right) / 2, y - (b.top + b.bottom) / 2);
    if (z > bz || (z === bz && d < bd)) { bz = z; bd = d; best = m; }
  }
  return best;
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
  if (!(r.width > 0) || !(r.height > 0)) return;
  const ls = [];
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.3, 0.7]) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    const media = mediaUnder(x, y, zone);
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
  if (!ink || zone.dataset.ink === ink) return;
  const first = !zone.dataset.ink;
  zone.dataset.ink = ink;
  // the first reading lands as it is (read ahead, it lands off the screen); from the next frame a change eases
  if (first) requestAnimationFrame(() => { zone.dataset.inkEase = ""; });
}

export default function InkWatch() {
  useEffect(() => {
    const SEL = INK_ZONES.join(", ");
    // each block is watched itself and read as it comes within a screen of the view (AHEAD), in idle slices: a
    // block at a time while the frame has SLICE_MS to spare, the rest in the next slice. No reading hit-tests the
    // screen (mediaUnder works by geometry), so nothing waits for the scroll to rest (it did, 28 Oct, when a
    // reading hit-tested the moving cards and dropped 23 frames in 300).
    const pending = new Set();
    let raf = 0;
    const flush = (deadline) => {
      raf = 0;
      const ground = pageLuma();
      for (const z of pending) {
        if (deadline && deadline.timeRemaining() < SLICE_MS && !deadline.didTimeout) break;
        pending.delete(z);
        if (z.isConnected) measureZone(z, ground);
      }
      if (pending.size) later();
    };
    const later = () => {
      if (raf) return;
      if (typeof requestIdleCallback === "function") raf = requestIdleCallback(flush, { timeout: 120 });
      else raf = setTimeout(flush, 0);
    };
    const ask = (z) => { if (z) { pending.add(z); later(); } };
    const seen = new Set();
    const io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) { seen.add(e.target); ask(e.target); } else seen.delete(e.target); } }, { rootMargin: AHEAD, threshold: 0 });
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
      if (raf) { if (typeof cancelIdleCallback === "function") cancelIdleCallback(raf); clearTimeout(raf); }
      if (wr) cancelAnimationFrame(wr);
    };
  }, []);
  return null;
}
