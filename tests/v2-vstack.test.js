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
});
