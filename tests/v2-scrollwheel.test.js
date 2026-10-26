// tests/v2-scrollwheel.test.js — THE SCROLL WHEEL (owner, 26 Oct 2026: "the
// upload button should extend out like a cd player ejecting a disc and the
// scroll wheel should morph and appear"; the sketch 6.jpg).
//
// Declared before measuring:
//   - the mapping (lib/scrollwheel.js): a swipe up of 24px or more is an
//     eject; angles run clockwise from twelve o'clock; a turn is taken the
//     short way round; clockwise scrolls down; a whole turn scrolls one
//     viewport height; a tick every 30°; a flick coasts, slowing by the
//     Disc's friction, stops under 6°/s, and is capped so a coast never runs
//     past about one screen; arrows turn a notch, Page keys a whole turn,
//     Home / End go to the ends;
//   - the states (ControlCenter.jsx, globals.css): the deck carries
//     data-wheel="open" only while the tray is out; a swipe up or ArrowUp
//     opens it, never while a popup or search is up; Escape, a click away,
//     a popup, search or another page close it; the ejected plus still
//     posts; open, the plus rides up by the eject distance, the tray grows
//     to hold it, the dark disc shows in the slot and the wheel grows from a
//     fifth of its size round the tray; closed, all of it is folded away and
//     the wheel takes no pointer; reduced motion drops the travel; the glass
//     rules hold (no rainbow on the wheel).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "../lib/scrollwheel.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => {
  const i = rules.indexOf("\n" + sel + " {");
  return i < 0 ? null : rules.slice(i, rules.indexOf("}", i) + 1);
};

test("the scroll wheel's mapping: eject, angles, the short way round, a screen a turn, ticks", () => {
  assert.equal(W.isEject(-24), true);
  assert.equal(W.isEject(-23.9), false, "a wobble is not an eject");
  assert.equal(W.isEject(30), false, "down is not an eject");
  assert.equal(W.isEject(NaN), false);
  assert.deepEqual([[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, y]) => Math.round(W.angleOf(x, y))), [0, 90, 180, 270], "clockwise from twelve");
  assert.equal(W.deltaDeg(350, 10), 20, "past twelve clockwise is +20, not -340");
  assert.equal(W.deltaDeg(10, 350), -20);
  assert.equal(W.deltaDeg(0, 180), 180);
  assert.equal(W.scrollFor(360, 800), 800, "a whole turn, one screen");
  assert.equal(W.scrollFor(90, 800), 200, "a quarter turn, a quarter screen");
  assert.equal(W.scrollFor(-45, 800), -100, "anticlockwise scrolls up");
  assert.equal(W.scrollFor(90, 0), 0);
  assert.equal(W.scrollFor(NaN, 800), 0);
  assert.equal(W.notches(0, 95), 3, "30, 60 and 90 crossed");
  assert.equal(W.notches(29, 31), 1);
  assert.equal(W.notches(31, 59), 0);
  assert.equal(W.notches(5, -5), 1, "back over twelve");
});

test("the scroll wheel's coast and keys: the Disc's friction, a stop, a cap, a notch a key", () => {
  assert.ok(Math.abs(W.coast(600, 16) - 600 * W.FRICTION) < 1e-9, "a frame keeps FRICTION of the speed");
  assert.ok(W.coast(600, 160) < W.coast(600, 16), "longer, slower");
  assert.equal(W.coast(5, 16), 0, "under STOP it is at rest");
  assert.equal(W.coast(-5, 16), 0);
  assert.equal(W.flickSpeed(90, 100), 900);
  assert.equal(W.flickSpeed(90, 1), W.MAX_DEG_PER_S, "a hair-apart sample is not a hurricane");
  assert.equal(W.flickSpeed(-90, 1), -W.MAX_DEG_PER_S);
  assert.equal(W.flickSpeed(4, 1), 500, "timed over at least 8ms");
  // the longest coast: the cap's speed lost geometrically, frame by frame, is at most about one screen
  let v = W.MAX_DEG_PER_S, total = 0;
  while (v) { total += (v * 16) / 1000; v = W.coast(v, 16); }
  assert.ok(total <= W.DEG_PER_SCREEN, `a coast runs ${Math.round(total)}° at most, under a turn`);
  assert.equal(W.keyTurn("ArrowDown"), 30);
  assert.equal(W.keyTurn("ArrowRight"), 30);
  assert.equal(W.keyTurn("ArrowUp"), -30);
  assert.equal(W.keyTurn("PageDown"), 360);
  assert.equal(W.keyTurn("PageUp"), -360);
  assert.equal(W.keyTurn("Home"), "home");
  assert.equal(W.keyTurn("End"), "end");
  assert.equal(W.keyTurn("a"), null);
});

test("the scroll wheel's states: the deck opens and closes it, one transformation in CSS", () => {
  const cc = read("app/components/ControlCenter.jsx");
  assert.match(cc, /data-wheel=\{wheel \? "open" : undefined\}/, "the deck says when the tray is out");
  assert.match(cc, /const canWheel = !popupUp && !inSearch;/, "never over a popup or in search");
  assert.match(cc, /if \(!h \|\| h\.fired \|\| wheel \|\| !isEject\(e\.clientY - h\.y\)\) return;/, "a swipe up ejects");
  assert.match(cc, /onPointerMove=\{holdMove\}/);
  assert.match(cc, /if \(e\.key === "ArrowUp" && !wheel && canWheel\) \{ e\.preventDefault\(\); openWheel\(true\); \}/, "ArrowUp ejects from the keyboard");
  assert.match(cc, /useEscape\(\(\) => closeWheel\(true\), wheel\);/, "Escape puts it away");
  assert.match(cc, /useClickAway\(wrapRef, closeWheel, \{ active: wheel \}\);/, "a click away puts it away");
  assert.match(cc, /useEffect\(\(\) => \{ if \(!canWheel\) setWheel\(false\); \}, \[canWheel\]\);/, "a popup or search puts it away");
  assert.match(cc, /useEffect\(\(\) => \{ setWheel\(false\); \}, \[pathname\]\);/, "another page puts it away");
  assert.match(cc, /if \(wheel\) setWheel\(false\);\n\s*press\("post"\);/, "the ejected plus still posts");
  assert.match(cc, /className="ccspindle" aria-label="put the scroll wheel away"/, "the dark disc puts it away");
  assert.match(cc, /<ScrollWheel open=\{wheel\} onClose=\{closeWheel\} \/>/, "always mounted: no popup fading in");
  // open
  const open = '.ccenter[data-wheel="open"]';
  assert.match(rules, new RegExp(open.replace(/[[\]."=]/g, "\\$&") + " \\.ccpostwrap \\.tabl\\.ccpost \\{ transform: translateY\\(calc\\(-1 \\* var\\(--eject\\)\\)\\);"), "the plus rides up the eject distance");
  assert.match(rules, /\.ccenter\[data-wheel="open"\] \.cctray \{[^}]*height: calc\(var\(--disc\) \+ var\(--eject\) \+ 6px\); opacity: 1;/s, "the tray grows to hold it");
  assert.match(rules, /\.ccenter\[data-wheel="open"\] \.ccspindle \{[^}]*scale\(1\); opacity: 1; pointer-events: auto;/s, "the dark disc shows in the slot");
  assert.match(rules, /\.ccenter\[data-wheel="open"\] \.ccwheel \{[^}]*top: calc\(var\(--cy\) - var\(--eject\) \/ 2\); transform: translate\(-50%, -50%\) scale\(1\); opacity: 1; pointer-events: auto;/s, "the wheel round the tray, centred between the plus and the disc");
  // closed
  const wheel = rule(".ccwheel");
  assert.match(wheel, /top: var\(--cy\);/, "folded into the plus's ring");
  assert.match(wheel, /scale\(0\.2\); opacity: 0; pointer-events: none;/, "folded away, taking no pointer");
  assert.match(rule(".ccspindle"), /scale\(0\.3\); opacity: 0; pointer-events: none;/);
  assert.match(rules, /--wheel-d: calc\(var\(--dk-h\) \* 2\.25\);/, "about 2.25 deck heights across");
  // the ticks: four, at twelve, three, six and nine, in the accent
  assert.match(read("app/components/ScrollWheel.jsx"), /const TICKS = \[0, 90, 180, 270\];/);
  assert.match(rule(".ccwtick"), /background: var\(--red\);[^}]*transform: rotate\(var\(--tick\)\);/s);
  // reduced motion: no travel
  assert.match(rules, /prefers-reduced-motion: reduce\) \{\n\s*\.ccenter \.ccpostwrap \.tabl\.ccpost, \.cctray, \.ccspindle, \.ccwheel,\n[^}]*\{ transition: none; \}/);
  // the glass rules: the ring is a drawn line, no rainbow
  assert.match(wheel, /border: 1\.5px solid color-mix\(in srgb, var\(--ink\) 78%, transparent\);/);
  for (const sel of [".ccwheel", ".ccwring", ".cctray", ".ccspindle"]) assert.ok(!/iris|conic-gradient|--holo/.test(rule(sel) || ""), sel + " carries no rainbow");
});

test("the scroll wheel turns the page: a slider for assistive technology, the keys, the Disc's coast", () => {
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /role="slider"/);
  assert.match(sw, /aria-label="scroll wheel: turn clockwise to scroll down"/);
  assert.match(sw, /const px = scrollFor\(deg, window\.innerHeight\);\n\s*if \(px\) window\.scrollBy\(0, px\);/, "a turn scrolls the page by the mapping");
  assert.match(sw, /if \(notches\(before, s\.angle\)\) haptic\("tick"\);/, "a tick at each notch");
  assert.match(sw, /const k = keyTurn\(e\.key\);/, "the keys");
  assert.match(sw, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); onClose\(true\); return; \}/);
  assert.match(sw, /const still = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;\n\s*if \(still \|\|/, "reduced motion: no coast");
  assert.match(sw, /d\.v = flickSpeed\(da, now - d\.t\);/, "the flick is measured and capped");
});
