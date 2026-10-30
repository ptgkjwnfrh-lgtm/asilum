// tests/v2-vstack.test.js — THE VERTICAL STACK (owner, 28 Oct 2026, the
// stacking sketch: "Messages at the top are carouselled and overlapped same as
// the bottom however messages in the middle are layer flat"; "the scrolling
// verticle carousel stacking example should be applied to everything that
// scrolled verticley even the feed").
//
// Declared before measuring:
//   - one rule carries it, over the feed's cells and every vertical list the
//     app scrolls (the messages page's rows, a thread, likes, the bag,
//     notices, search results, BRDCST);
//   - the bend is the transform alone (the compositor's), the order a separate
//     z-index animation; nothing in script;
//   - flat in the middle: the bottom bend ends at the identity and the top
//     bend begins at it, and they ADD, so an item between the zones is
//     untouched; each zone is measured from the scroller's edge by the item's
//     leading edge (--stk-zone), never as a share of the item's own height
//     (a tall card would bend only once half hidden);
//   - at the bottom an item turns its bottom away and laps up; at the top the
//     mirror: its top away, lapping down;
//   - on the page the edges are the Masthead's foot and the deck's top; inside
//     a popup, a thread or an inner list, that scroller's own;
//   - reduced motion, or no scroll timelines: no stack at all;
//   - nothing fixed lives inside a stacked item (a transform would trap it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ITEMS = [".fcell", ".dmrow", ".likerow", ".bagrow", ".noticerow", ".srchgrid > li", ".mailthread > li", ".maillist > li", ".brdcstlist > li"];
const frames = (name) => {
  const at = css.indexOf(`@keyframes ${name} {`);
  assert.ok(at > -1, `@keyframes ${name}`);
  let depth = 0, i = css.indexOf("{", at);
  for (let j = i; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) return css.slice(i + 1, j); }
  return "";
};
const gate = css.slice(css.indexOf("@supports (animation-timeline: view())"));

test("one rule, over the feed and every vertical list", () => {
  const m = gate.match(/:is\(([^)]*(?:\([^)]*\))?[^)]*)\) \{\s*position: relative;\s*animation: vstackin linear both, vstackout linear both, vstackz linear both;/);
  assert.ok(m, "the stack's rule");
  const list = m[1].split(",").map((s) => s.trim());
  assert.deepEqual(list, ITEMS);
  assert.equal((css.match(/animation: vstackin /g) || []).length, 1, "and only one");
});

test("the bend is transform alone; the order a z-index of its own", () => {
  for (const k of ["vstackin", "vstackout"]) {
    const body = frames(k);
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
    assert.deepEqual([...new Set(props)], ["transform"], `${k} animates transform only`);
  }
  assert.deepEqual([...new Set([...frames("vstackz").matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]))], ["z-index"]);
  assert.match(frames("vstackz"), /0%, 100% \{ z-index: 1; \} 50% \{ z-index: 24; \}/, "the flatter one in front");
});

test("flat in the middle; each edge bends the way the sketch draws", () => {
  const vin = frames("vstackin"), vout = frames("vstackout");
  assert.match(vin, /to \{ transform: none; \}/, "the bottom bend ends at the identity");
  assert.match(vout, /from \{ transform: none; \}/, "the top bend begins at it");
  assert.match(vin, /from \{ transform: perspective\(var\(--stk-persp\)\) translateY\(calc\(-1 \* var\(--stk-lap\)\)\) rotateX\(calc\(-1 \* var\(--stk-tilt\)\)\) scale\(var\(--stk-s\)\); \}/, "bottom: laps up, its bottom turned away");
  assert.match(vout, /to \{ transform: perspective\(var\(--stk-persp\)\) translateY\(var\(--stk-lap\)\) rotateX\(var\(--stk-tilt\)\) scale\(var\(--stk-s\)\); \}/, "top: laps down, its top turned away");
  assert.match(gate, /animation-composition: replace, add, replace;/, "the two bends add");
  assert.match(gate, /animation-range: cover 0px cover var\(--stk-zone\), cover calc\(100% - var\(--stk-zone\)\) cover 100%, cover 0% cover 100%;/, "zones measured from the edges, not as a share of the item");
  const root = css.match(/:root \{ --stk-tilt: (\d+)deg; --stk-lap: (\d+)%; --stk-s: ([\d.]+);/);
  assert.ok(root, "the drum's numbers");
  assert.ok(+root[1] > 0 && +root[1] < 90, "a turn, not a flip");
  assert.ok(+root[3] > 0.5 && +root[3] < 1, "a little smaller at the edge, never gone");
});

test("the drum's edges: the fixtures on the page, a scroller's own inside it", () => {
  assert.match(gate, /animation-timeline: view\(block var\(--stk-top\) var\(--stk-bot\)\), view\(block var\(--stk-top\) var\(--stk-bot\)\), view\(block var\(--stk-top\) var\(--stk-bot\)\);/);
  assert.match(css, /\.main \{ --stk-top: var\(--head-h\); --stk-bot: calc\(var\(--cc-row-h\) \+ var\(--cc-bottom\)\); \}/);
  assert.match(css, /\.sheetpane, \.mailthread, \.maillist \{ --stk-top: 0px; --stk-bot: 0px;/);
});

test("reduced motion, or no scroll timelines: no stack", () => {
  assert.match(gate, /^@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{\s*:is\(/);
  const outside = css.slice(0, css.indexOf("@supports (animation-timeline: view())"));
  assert.ok(!/animation[^;{}]*vstack/.test(outside), "nothing runs the stack outside the gate");
});

test("nothing fixed lives inside a stacked item", () => {
  const fixed = [...css.matchAll(/([^{}]+)\{[^{}]*position:\s*fixed[^{}]*\}/g)].map((m) => m[1].trim().split("\n").pop());
  const bases = ITEMS.map((s) => s.split(" ")[0]);
  const inside = fixed.filter((sel) => sel.split(",").some((one) => bases.some((b) => new RegExp(`\\${b}(\\b|\\s|>)`).test(one.trim()) && one.trim() !== b)));
  assert.deepEqual(inside, []);
});

test("the Feed's drum is gentle (owner, 28 Oct 2026: \"the carousel stacking looks too extreme on the feed\")", () => {
  // declared: on the Feed every bend is less than the lists' — a smaller turn, a smaller lap, a smaller shrink
  const root = css.match(/:root \{ --stk-tilt: (\d+)deg; --stk-lap: (\d+)%; --stk-s: ([\d.]+);/);
  const feed = css.match(/\.fgrid \{ --stk-tilt: (\d+)deg; --stk-lap: (\d+)%; --stk-s: ([\d.]+);/);
  assert.ok(root && feed, "both sets of numbers");
  assert.ok(+feed[1] <= +root[1] / 2, `turn ${feed[1]}° against ${root[1]}°`);
  assert.ok(+feed[2] <= +root[2] / 4, `lap ${feed[2]}% against ${root[2]}%`);
  assert.ok(+feed[3] > +root[3] && +feed[3] < 1, `shrink to ${feed[3]} against ${root[3]}`);
  // (owner, 28 Oct 2026: "a large card on the bottom seems to be clipping over a little too much") a large card
  // stands in front of its neighbours, so it must not lap: measured with a fill centred, its lap drew it 15px over
  // the listings above; without, it stays 11px clear
  assert.match(css, /\.fcell\.large \{ --stk-lap: 0%; \}/, "a large card does not lap");
});

test("SHADOWS (owner, 28 Oct 2026): a faint Masthead, its shade on the cards under it, the large cards' overcast", () => {
  // declared before measuring:
  //  - the Masthead's own shadow is faint and close: at most a quarter of the shade, no further than 14px;
  //  - a Feed card turning up under the Masthead darkens from its top, only in the top bend's zone, and
  //    Figure 20 (no card) takes no shade;
  //  - a LARGE card casts its overcast past its top and bottom always, and stands in front of every other
  //    card to cast it; any other card casts only in the stack's zones (the same ranges as the bend), the
  //    two zones adding; every shadow layer is opacity only;
  //  - the page marks a large cell by the packer's own rule.
  const raw = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const mh = raw.match(/\.masthead\.fixture \{ box-shadow: 0 (\d+)px (\d+)px -\d+px color-mix\(in srgb, var\(--shade\) (\d+)%, transparent\), var\(--glass-lip\); \}/);
  assert.ok(mh, "the Masthead's own shadow");
  assert.ok(+mh[1] + +mh[2] <= 20 && +mh[3] <= 25, "faint and close");
  assert.match(raw, /\.fcell::before \{[^}]*opacity: 0;[^}]*linear-gradient\(to bottom, color-mix\(in srgb, var\(--shade\) \d+%, transparent\), transparent \d+%\);/, "the shade falls from the top");
  assert.match(gate, /\.fcell::before \{ animation: vcastout linear both; animation-timeline: --cell; animation-range: cover calc\(100% - var\(--stk-zone\)\) cover 100%; \}/, "only in the top zone");
  assert.match(raw, /\.fcell:has\(\.f20post\)::before \{ content: none; \}/);
  assert.match(raw, /\.fcell\.large::after \{ --cast-h: \d+px; left: 0; right: 0; opacity: 1; \}/, "a large card always casts");
  assert.match(gate, /\.fcell:not\(\.large\)::after \{\s*animation: vcastin linear both, vcastout linear both; animation-composition: replace, add; animation-timeline: --cell, --cell;\s*animation-range: cover 0px cover var\(--stk-zone\), cover calc\(100% - var\(--stk-zone\)\) cover 100%;/, "the others only where they stack");
  assert.match(gate, /\.fcell \{ view-timeline: --cell block; view-timeline-inset: var\(--stk-top\) var\(--stk-bot\); \}/, "the cell's own timeline, on the drum's edges");
  for (const k of ["vcastin", "vcastout"]) assert.deepEqual([...new Set([...frames(k).matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]))], ["opacity"], k + " is opacity only");
  const zl = frames("vstackzl").match(/z-index: (\d+);[^]*z-index: (\d+);/), z = frames("vstackz").match(/z-index: (\d+);[^]*z-index: (\d+);/);
  assert.ok(Math.min(+zl[1], +zl[2]) > Math.max(+z[1], +z[2]), "a large card stands in front of every other");
  assert.match(gate, /\.fcell\.large \{ animation-name: vstackin, vstackout, vstackzl; \}/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /\(isLarge\(c\.card\) \? " large" : ""\)/, "the page marks a large cell by the packer's rule");
});

// ONLY NEAR CELLS RIDE THE DRUM (going live, 30 Oct 2026: iPhone Safari, "a problem repeatedly occurred"). Measured on
// the live Feed: all 121 cells held a matrix3d transform (the drum's first keyframe, filled backwards while off
// screen), 384 composited layers, about 1.1 GB of layer memory at 3x — the page was killed. Declared: a Feed cell
// rides the drum only while FeedNear.jsx marks it (within a screen of the view); every other cell has no animation,
// so it is flat and no layer; the drum on near cells is unchanged.
test("only a Feed cell within a screen of the view rides the drum; far cells are flat and no layer", () => {
  const near = readFileSync(new URL("../app/components/FeedNear.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const sheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(near, /export const NEAR_MARGIN = "100% 0px";/, "a screen's margin each way: turned before it shows");
  assert.match(near, /if \(e\.isIntersecting\) e\.target\.dataset\.near = "";\s*else delete e\.target\.dataset\.near;/);
  assert.match(near, /document\.querySelectorAll\("\.fgrid > \.fcell"\)/, "the Feed's cells, as they come");
  assert.match(page, /import FeedNear from "\.\/components\/FeedNear\.jsx";/);
  assert.match(page, /<FeedNear \/>/, "mounted on the Feed");
  const block = sheet.slice(sheet.indexOf("@supports (animation-timeline: view())"));
  assert.match(block, /\.fcell:not\(\[data-near\]\), \.fcell:not\(\[data-near\]\)::before, \.fcell:not\(\[data-near\]\)::after \{ animation: none; \}/, "far cells: no drum, no shade");
  assert.ok(block.indexOf(".fcell:not([data-near])") > block.indexOf(".fcell.large { animation-name"), "after the large cells' rule, so it wins");
});
