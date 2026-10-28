// tests/v2-finish.test.js — THE RING AND THE FINISH (owner, 28 Oct 2026: "for
// carousels they should be infinite, however the first and last card should
// have a slight magnetic drag … all the effects on the app look really pixely
// and raw … make it look professional like apple level rendering … ever so
// slightly widen the center fixture. the notification bubble on the direct
// message button should sit overtop of the button on its left corner").
//
// Declared before measuring:
//   - a carousel is a ring: no ends, past the last card the first; every card
//     placed by its offset the short way round;
//   - the seam between the last card and the first holds the hand back
//     (SEAM_DRAG of its travel) and stops a flick on the seam's card; from
//     that card the next swipe crosses; elsewhere the hand moves the ring 1:1;
//   - the glass maps are drawn at the screen's own pixels (up to 2×, bounded),
//     and only the bent band is smoothed (a blur reads the bent picture, never
//     the clear source);
//   - a turned card is never frozen at its flat raster (no will-change), its
//     edges smoothed;
//   - the DM count sits over the envelope's top-left corner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../lib/fig20.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("the ring: no ends, every card by its offset the short way round", () => {
  assert.equal(R.wrap(-1, 6), 5);
  assert.equal(R.wrap(13, 6), 1);
  assert.equal(R.ringOffset(0, 5, 6), 1, "past the last, the first");
  assert.equal(R.ringOffset(5, 0, 6), -1, "before the first, the last");
  assert.equal(R.ringOffset(3, 0, 6), -3, "the far side, once");
  assert.equal(R.nearestTo(0, 11, 6), 12, "the first card, the near way from the last");
  assert.equal(R.nearestTo(5, 12, 6), 11);
  const fig = read("app/components/Fig20.jsx");
  assert.ok(!/Math\.max\(0, Math\.min\(n - 1/.test(fig), "no clamp to the ends");
  assert.match(fig, /const offs = Array\.from\(cards, \(_, i\) => ringOffset\(i, s\.pos, n\)\);/);
  assert.match(fig, /const go = \(to\) => \{ s\.target = to;/);
});

test("the seam's magnet: the hand is held back across it, and a flick stops on its card", () => {
  const n = 6;
  assert.equal(R.inSeam(5.5, n), true);
  assert.equal(R.inSeam(4.5, n), false);
  assert.ok(Math.abs(R.seamDrag(2, 1, n) - 3) < 1e-6, "away from the seam the hand moves the ring 1:1");
  assert.ok(Math.abs(R.seamDrag(5, 1, n) - (5 + R.SEAM_DRAG)) < 1e-6, "across it, SEAM_DRAG of the travel");
  assert.ok(Math.abs(R.seamDrag(6, -1, n) - (6 - R.SEAM_DRAG)) < 1e-6, "either way");
  assert.ok(R.SEAM_DRAG >= 0.4 && R.SEAM_DRAG < 1, "a slight drag, never a wall");
  assert.equal(R.settleTarget(2.1, 9, n), 5, "a big flick from the middle stops on the last card");
  assert.equal(R.settleTarget(5, 1, n), 6, "from the last card the next swipe crosses to the first");
  assert.equal(R.settleTarget(3, -9, n), 0, "and the other way, on the first");
  assert.equal(R.settleTarget(2.4, 0, n), 2, "no throw: the nearest card");
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /s\.pos = s\.target = seamDrag\(g\.pos, -dx \/ s\.step, n\);/, "the drag passes through the magnet");
  assert.match(fig, /go\(settleTarget\(s\.pos, -\(g\.v \* 160\) \/ s\.step, n\)\);/, "so does the flick");
  assert.match(fig, /else if \(Number\.isFinite\(d\.by\)\) go\(Math\.round\(s\.target\) \+ d\.by\);/, "the deck's wheel goes round freely");
});

test("the finish: maps at the screen's pixels, the bent band alone smoothed", async () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export function drawRefractionMap\([^)]*, scale = 1\) \{/);
  assert.match(glass, /const S = Math\.max\(1, scale \|\| 1\);/, "the scale is the one asked for");
  assert.match(glass, /const W = Math\.max\(1, Math\.round\(w \* S\)\), H = Math\.max\(1, Math\.round\(h \* S\)\);/, "the canvas at the scale");
  assert.match(glass, /const x = \(px \+ 0\.5\) \/ S - 0\.5;/, "distances in CSS pixels, samples finer");
  global.window = { devicePixelRatio: 2 };
  const { mapScale, MAP_MAX_PX, LENS_SMOOTH } = await import("../app/components/LiquidGlass.jsx").catch(() => ({}));
  if (mapScale) {
    assert.equal(mapScale(375, 66), 2, "a phone's bar at its 2×");
    assert.ok(mapScale(2560, 400) * mapScale(2560, 400) * 2560 * 400 <= MAP_MAX_PX, "a wide pane stays bounded");
    assert.ok(LENS_SMOOTH > 0 && LENS_SMOOTH < 1, "a hairline");
  } else {
    assert.match(glass, /export const LENS_SMOOTH = 0\.45;/);
    assert.match(glass, /let s = Math\.min\(2, Math\.max\(1, dpr\)\);\n\s*while \(s > 1 && w \* h \* s \* s > MAP_MAX_PX\) s -= 0\.25;/);
  }
  delete global.window;
  // (then: "smooth out the pixels even more … apple quality") two filters, and only ever inside the bent
  // band: the backdrop PRE-FILTERED before it is bent (a squeeze then averages, rather than skipping
  // pixels — a texture minified with its mipmaps), and the bent picture eased after; the clear middle
  // reads the untouched source
  const rainbow = read("app/components/RainbowGlass.jsx");
  const blurs = [...(glass + rainbow).matchAll(/<feGaussianBlur[^>]*>/g)].map((m) => m[0]);
  const pre = blurs.filter((b) => /in="SourceGraphic"/.test(b)), post = blurs.filter((b) => !/in="SourceGraphic"/.test(b));
  assert.equal(pre.length, 4, "the backdrop pre-filtered in all four chains (the panes, the page bend, the rainbow, its page chain)");
  assert.equal(post.length, 4, "and the bend eased after, in all four");
  for (const b of pre) {
    assert.match(b, /data-(lens|pb)="1"/, "only inside the bent band: " + b);
    assert.match(b, /stdDeviation=(\{LENS_PREFILTER\}|"\$\{LENS_PREFILTER\}") result="src"/, b);
  }
  for (const b of post) assert.match(b, /stdDeviation=(\{LENS_SMOOTH\}|"\$\{LENS_SMOOTH\}")/, "the one hairline: " + b);
  const bends = [...(glass + rainbow).matchAll(/<feDisplacementMap[^>]*>/g)].map((m) => m[0]).filter((b) => /data-(lens|pb)="1"/.test(b) && !/in="(sx|src|bent\w*)"/.test(b));
  assert.deepEqual(bends, [], "every bend reads the pre-filtered backdrop (or the pass before it)");
  assert.match(glass, /<feComposite in="SourceGraphic" in2="iw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="frostW" \/>/, "the clear middle: the untouched source");
  assert.match(glass, /export const LENS_PREFILTER = 0\.6;/);
});

// (then: "lets make the disc 15% bigger and slightly reposition it. the two ticks on the left and right and
// the horizontal line in of the upload button should lie directly on the top edge of the center fixture
// making sure all the lines line up and everything is flush") — the plus's lift is exactly its disc's
// depth in its key, so its centre, the wheel's centre and its 3 and 9 o'clock marks sit on the deck's top
// edge (measured in the browser: 702.39–702.41 against the edge's 702.41 at 375px)
test("the disc: 15% bigger, its centre and its side marks on the deck's top edge", () => {
  assert.match(css, /--eject: calc\(var\(--dk-h\) \/ 2 \+ var\(--u\) \* 3\);/, "lifted by exactly its depth in the key");
  assert.match(css, /--cy: calc\(50% \+ var\(--u\) \* 3\);/, "which is where its disc sits (the key is --dk-h tall)");
  assert.match(css, /\.ccrow \{ position: relative; flex: none; height: var\(--dk-h\);/, "the key's row is the deck's top --dk-h");
  assert.match(css, /--wheel-d: calc\(var\(--dk-h\) \* 2\.25 \* 1\.15\);/, "15% bigger");
  assert.match(css, /\.ccenter\[data-wheel="open"\] \.ccwheel \{\n  top: calc\(var\(--cy\) - var\(--eject\)\);/, "the wheel centred on the plus");
});

test("the cards crisp, the deck a touch wider, the DM count on the envelope's top-left", () => {
  const card = css.match(/\.f20card \{([^}]*)\}/)[1];
  assert.ok(!/will-change/.test(card), "a turned card re-rasters at the size it shows");
  assert.match(card, /outline: 1px solid transparent;/);
  assert.match(card, /backface-visibility: hidden;/);
  assert.ok(!/\.floatcard \{[^}]*will-change/.test(css) && !/\.pfloatcard \{[^}]*will-change/.test(css), "nor the floating cards that tilt");
  assert.match(css, /--dk-sx: 1\.14;/);
  const badge = css.match(/\.dmcount \{([^}]*)\}/)[1];
  assert.match(badge, /top: calc\(50% - var\(--u\) \* 34\); right: calc\(50% \+ var\(--u\) \* 14\);/, "over the envelope's top-left corner");
});
