// tests/v2-motion.test.js — THE MOTION SYSTEM (owner, 28 Oct 2026: "EVERY
// ANIMATION SHOULD [BE] EXTREMELY SMOOTH, LOCK DOWN THE TIMING AND MAKE SURE
// ITS ANIMATION STUDIO SMOOTH"; and "extend the warp bezel all the way to the
// upload button on the disc … the whole thing should get disorted").
//
// Declared before measuring:
//   - one ladder of durations and one set of curves, as tokens: no raw
//     cubic-bezier anywhere but the tokens themselves, and every transition's
//     duration a token unless it is a deliberate long ambient one (≥ 0.6s) or
//     a linear colour blend;
//   - nothing animates layout but five named exceptions, each a box that must
//     truly change size (the deck rising for search, the fixtures with it, a
//     caption opening to its text, the banner's reply field, and — since the
//     ticker folds to a line — the ad bubble, in step with the deck);
//   - the wheel and its tray move by transform, opacity and clip alone, and
//     the wheel's glass makes the same move in CSS — no script resizing it
//     every frame;
//   - a glass map is drawn at the pane's layout size (a transform cannot
//     shrink it) and redrawn only when a resize has settled, never per frame;
//     a % corner is a share of the box;
//   - every script glide is timed by the clock (the same at 60 and 120 Hz):
//     the carousel, the reactive rainbow; the carousel moves only transforms
//     per frame;
//   - the wheel's lens covers its whole face and its spokes start at the plus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const raw = read("app/globals.css");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));

test("one ladder of durations, one set of curves", () => {
  for (const t of ["--ease-out: cubic-bezier(0.22, 1, 0.36, 1);", "--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);", "--ease-in:", "--ease-spring:", "--ease-hinge:",
    "--dur-0: 60ms; --dur-1: 140ms; --dur-2: 220ms; --dur-3: 320ms; --dur-4: 460ms;"]) assert.ok(css.includes(t), t);
  const stray = rules.filter((r) => /cubic-bezier\(/.test(r.body) && !/^:root/.test(r.sel)).map((r) => r.sel);
  assert.deepEqual(stray, [], "no curve outside the tokens");
  const loose = [];
  for (const r of rules) {
    const t = (r.body.match(/transition:([^;]*)/) || [])[1];
    if (!t || t.trim() === "none") continue;
    for (const item of t.split(/,(?![^()]*\))/)) {
      if (/var\(--mc-blend/.test(item) || /\blinear\b/.test(item)) continue;
      const d = item.trim().split(/\s+/)[1] || "";
      const secs = /^\d*\.?\d+ms$/.test(d) ? parseFloat(d) / 1000 : /^\d*\.?\d+s$/.test(d) ? parseFloat(d) : null;
      if (!/^var\(--dur-[0-4]\)$/.test(d) && !(secs !== null && secs >= 0.6)) loose.push(r.sel + " → " + item.trim());
      if (!/var\(--ease-[a-z-]+\)/.test(item)) loose.push(r.sel + " (no curve) → " + item.trim());
    }
  }
  assert.deepEqual(loose, [], "every transition on the ladder, with a curve");
});

test("nothing animates layout but five boxes that truly change size", () => {
  const LAYOUT = /(^|[\s,])(top|left|width|height|max-height|min-height|margin[a-z-]*|padding[a-z-]*|bottom|right|inset)\s/;
  const offenders = rules.filter((r) => { const t = (r.body.match(/transition:([^;]*)/) || [])[1]; return t && LAYOUT.test(t); }).map((r) => r.sel).sort();
  // (28 Oct 2026) and the ad bubble opening and folding, in step with the deck's own height
  assert.deepEqual(offenders, [".ccad", ".ccenter", ".dmbreply", ".fixture, .ccenter", ".mfcaption"].sort(), "the deck rising for search, the fixtures with it, the ad bubble, a caption opening, the reply field");
});

test("the wheel moves by transform alone, and its glass makes the same move in CSS", () => {
  const body = (sel) => rules.filter((r) => r.sel === sel).map((r) => r.body).join(";"); // every rule of that selector
  for (const sel of [".ccwheel", '.ccenter[data-wheel="open"] .ccwheel', ".ccwglass", ".ccwglass[data-open]"]) {
    const t = body(sel).match(/transition:([^;]*)/)[1];
    assert.ok(!/(^|\s)(top|left|width|height)\s/.test(t), sel + " moves by transform and opacity");
  }
  assert.equal(body(".ccwglass").match(/transition:([^;]*)/)[1], body(".ccwheel").match(/transition:([^;]*)/)[1], "closing: the same timing");
  assert.equal(body(".ccwglass[data-open]").match(/transition:([^;]*)/)[1], body('.ccenter[data-wheel="open"] .ccwheel').match(/transition:([^;]*)/)[1], "opening: the same timing");
  assert.match(body(".cctray"), /clip-path: inset\(var\(--eject\) 0 0 0 round 999px\);/, "the tray revealed by a clip");
  // THE CHOREOGRAPHY, exact: opening, the plus lifts and the tray grows, the wheel blooms 60ms behind them;
  // closing, the wheel folds first and the plus and the tray follow 60ms later
  assert.match(body('.ccenter[data-wheel="open"] .ccwheel'), /transition: transform var\(--dur-4\) 60ms var\(--ease-out\), opacity var\(--dur-3\) 60ms var\(--ease-out\);/, "the wheel blooms 60ms behind");
  assert.match(body(".ccwheel"), /transition: transform var\(--dur-3\) var\(--ease-in-out\), opacity var\(--dur-2\) var\(--ease-in\);/, "and folds first");
  assert.match(body('.ccenter[data-wheel="open"] .ccpostwrap .tabl.ccpost'), /transition: transform var\(--dur-4\) var\(--ease-out\);/, "the plus lifts at once");
  assert.match(body(".ccenter .ccpostwrap .tabl.ccpost"), /transition: transform var\(--dur-3\) 60ms var\(--ease-in-out\);/, "and returns 60ms after the wheel folds");
  assert.match(body(".cctray"), /transition: clip-path var\(--dur-3\) 60ms var\(--ease-in-out\), opacity var\(--dur-2\) 120ms var\(--ease-in\);/);
  assert.match(body('.ccenter[data-cards="open"] .pcring'), /transition: transform var\(--dur-4\) 120ms var\(--ease-out\), opacity var\(--dur-3\) 120ms var\(--ease-out\);/, "the cards rise after the wheel");
  const sw = read("app/components/ScrollWheel.jsx");
  assert.ok(!/requestAnimationFrame\(sync\)|until = performance\.now\(\)/.test(sw), "no script resizing the glass every frame");
  assert.match(sw, /pane\.style\.setProperty\("--ej", `\$\{lift\}px`\);/, "its lift measured once");
});

test("a glass map: the pane's own size, drawn when a resize settles; a % corner is a share", () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /const w = el\.offsetWidth \|\| r\.width, h = el\.offsetHeight \|\| r\.height;/);
  assert.match(glass, /settle = setTimeout\(\(\) => fit\(true\), MAP_SETTLE_MS\);/, "redrawn when it settles, a few rows a frame");
  // measured (28 Oct 2026): the redraw after the deck rose held one 69ms frame, 59ms of it the map's loop;
  // now the loop reads its profile from a table and runs at most MAP_SLICE_MS a frame, and a scroll only
  // re-places the Safari bend, never redraws the map
  assert.match(glass, /export const MAP_SLICE_MS = 6;/);
  assert.match(glass, /while \(py < H && performance\.now\(\) - t0 < MAP_SLICE_MS\) row\(py\+\+\);/, "a few rows a frame");
  assert.match(glass, /if \(inside >= 0 && inside < bez\) m = profile\(inside \/ bez\);/, "the profile from its table");
  assert.match(glass, /if \(!skip\) raf = requestAnimationFrame\(placeBend\);/, "a scroll only places the bend");
  assert.ok(!/new ResizeObserver\(\(\) => \{ if \(!raf\) raf = requestAnimationFrame\(fit\); \}\)/.test(glass), "never once a frame");
  assert.ok(!/requestAnimationFrame\(fit\)/.test(glass), "nothing redraws the map per frame");
  assert.match(glass, /const rad = \(v\) => \(\/%\\s\*\$\/\.test\(v\) \? \(parseFloat\(v\) \/ 100\) \* Math\.min\(w, h\) : parseFloat\(v\)\) \|\| 0;/, "the wheel's 50% is its circle, not 50px");
  assert.match(glass, /const sx = \(el\.offsetWidth \? box\.width \/ el\.offsetWidth : 1\) \|\| 1/, "the carvings in layout pixels too");
});

test("every script glide timed by the clock; the carousel moves only transforms per frame", () => {
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /s\.pos \+= diff \* \(1 - Math\.pow\(1 - GLIDE, dt \/ 16\.667\)\);/);
  assert.ok(!/s\.pos \+= diff \* 0\.2;/.test(fig), "not a share per frame");
  assert.match(fig, /if \(resize \|\| c\.__f20 !== size\) \{/, "a card's size set only when the stage's changes");
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /s\.a \+= \(s\.ta - s\.a\) \* \(1 - Math\.pow\(1 - 0\.18, dt \/ 16\.667\)\);/, "the reactive rainbow too");
  assert.match(read("lib/scrollwheel.js"), /const pull = Math\.min\(1, \(tuning\(DETENTS\)\.snap \* \(1 - Math\.abs\(v\) \/ SLOW_DEG_PER_S\) \* dt\) \/ 16\);/, "the wheel's magnet already was");
});

test("the wheel's warp runs all the way in to the plus", () => {
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /dispersion: V1_RAINBOW, bezel: "full" \}\);/, "the lens is the whole face");
  assert.match(sw, /export const SPOKES = Object\.freeze\(\{ hub: 0\.2,/, "the spokes start at the plus's rim");
  assert.match(read("app/components/LiquidGlass.jsx"), /const bez = bezel === "full" \? Math\.max\(6, Math\.min\(w, h\) \/ 2\)/);
});
