// tests/v2-scroll-motion.test.js — THE DECK THAT SHRINKS, THE KEY THAT COMES BACK (owner, 29 Oct 2026: "let the toggle
// button be in liquid glass and have its little symbol glow and make the symbol match the rest of the symbols and put it
// in the right corner of the screen inline with the fee[d]. also i would still want reactive shrinking on the center
// fixture so when a user scrolls down the fixture should shrink 15% seamlessly and if a button on the fixture is pressed
// it should go back to orignial size seamlessly and smoothly however the disc and upload button should stay the same
// size … if a user scrolls up the size of the fixture should go back seamlessly. the toggle button should appear if the
// user scrolls up and if the user scrolls back down the toggle button should remain where it is so it appears like its
// being scrolled back up"; then "make the EQ reactive like the text and make it into a curved square").
//
// Declared before measuring:
//   - the deck: 15% smaller (0.85) once the reader has run SHRINK_AFTER px down, whole once they have run as far up,
//     near the top, at a press on any key, and never while searching; by `scale` (no layout), about the plus's own
//     centre, the plus's place scaled back by as much about the same point, so the disc, the wheel and the POST cards
//     keep their size and place; reduced motion makes it instant;
//   - the key: in its place at the right of THE FEED at the top; scrolled down it leaves with the page; scrolled up it
//     comes down into view by exactly the distance scrolled, holds under the Masthead, and scrolled down again leaves at
//     the page's pace; one box read and one transform a frame;
//   - the key is a curved square of the fixtures' liquid glass, its symbol the house's (the fixtures' stroke), a ground
//     word: the words' blend of ink and the words' glow; floating over a bright card, the solid ink and no glow.
//   Measured in the page, 375px (29 Oct 2026): the key's top 80 at rest; −52 after 600 down; −22 after 30 up; 74 (held)
//   after 150 more; 54 after 20 down. The deck 0.85 of its width scrolled down; the plus's size unchanged (0px), its
//   centre moved (0.1, 0.48) px; whole on the way up and at a press. 1 dropped frame in 300 at 6px a frame, as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECK_SHRINK, SHRINK_AFTER, SHRINK_TOP, shrinkStep, quickReturn, quickOffset } from "../lib/scrollmotion.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const cc = read("app/components/ControlCenter.jsx");
const eq = read("app/components/FeedEq.jsx");

test("the deck's shrink: down shrinks, up, the top and a press restore, jitter does nothing", () => {
  assert.equal(DECK_SHRINK, 0.85, "15% smaller");
  const run = (ys, s0) => ys.reduce((s, y) => shrinkStep(s, y), s0 || { last: ys[0], acc: 0, shrunk: false });
  assert.equal(run([400, 404, 408]).shrunk, false, "8px is not a direction yet");
  assert.equal(run([400, 406, 412, 418]).shrunk, true, "18px down shrinks it");
  const down = run([400, 420]);
  assert.equal(run([420, 414, 408, 402], down).shrunk, false, "18px back up restores it");
  assert.equal(run([420, 423, 418, 422, 417, 421], down).shrunk, true, "a finger's jitter neither way changes it");
  assert.equal(run([100, 30], { last: 100, acc: 40, shrunk: true }).shrunk, false, "near the top it is whole");
  assert.ok(SHRINK_AFTER >= 8 && SHRINK_TOP > 0);
  // the deck: a press restores, searching never shrinks
  assert.match(cc, /function keyDown\(e\) \{\n\s*unshrink\(\); \/\/ a press brings the deck back to its size/);
  assert.match(cc, /data-shrunk=\{shrunk && !inSearch \? "1" : undefined\}/);
  assert.match(cc, /name: "deck-shrink",\s*read\(\) \{ shrinkRef\.current = shrinkStep\(shrinkRef\.current, window\.scrollY\); return shrinkRef\.current\.shrunk; \},\s*write\(on\) \{ setShrunk\(on\); \},/, "read once a scroll frame, in the one frame");
});

test("the deck scales about the plus's centre; the plus is scaled back, its size and place kept", () => {
  assert.match(css, /\.ccenter\[data-shrunk\] \{ scale: 0\.85; translate: 0 calc\(var\(--ad-h\) \* 0\.15\); \}/);
  // (the ads wink, 29 Oct 2026) the foot holds still while the ticker opens or folds on a shrunk deck: lowered by 15% of
  // the ticker's height, on the height's own duration and curve. Folded (--ad-h 0) the plus keeps its place exactly; open,
  // it shrinks about a point 15% of the ticker's height lower (measured 3.8px at 375) — a rigid scale cannot keep both
  // the foot still through the wink and the plus still through the shrink, and the wink is the one the eye follows.
  assert.match(css, /\.fixture, \.ccenter \{[^}]*height var\(--dur-3\) var\(--ease-deck\)[^}]*translate var\(--dur-3\) var\(--ease-deck\);/s, "the translate on the height's own timing");
  assert.match(css, /\.ccenter\[data-shrunk\] \.ccpostwrap \{ scale: calc\(1 \/ 0\.85\); \}/, "the disc, the wheel and the cards keep their size");
  assert.match(css, /\.ccenter \{ transform-origin: 50% calc\(var\(--dk-h\) \/ 2 \+ var\(--u\) \* 3\); \}/, "about the plus's centre in the row");
  assert.match(css, /\.ccpostwrap \{ transform-origin: 50% var\(--cy\); transition: scale var\(--dur-3\) var\(--ease-out\); \}/, "scaled back about the same point");
  assert.match(css, /\.fixture, \.ccenter \{[^}]*transition: [^;]*scale var\(--dur-3\) var\(--ease-out\)[,;]/s, "seamless, both ways");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.ccpostwrap \{ transition: none; \} \}/);
  assert.ok(!/\.ccenter\[data-shrunk\][^{]*\{[^}]*(width|height|top|bottom|left|right|padding|margin)\s*:/.test(css), "no layout moves");
});

test("the key comes back: by the distance scrolled up, held under the Masthead, away at the page's pace", () => {
  const stick = 74, hide = stick + 44 + 8;
  // a reader at the top, then 600 down, 30 up, 150 up, 20 down; the key's place on the screen is 80 - scrollY
  let q = -hide, y = 0;
  const at = (dy) => { y += dy; q = quickReturn(q, dy, hide); const natural = 80 - y; return natural + quickOffset(natural, stick, q); };
  assert.equal(at(0), 80, "at rest in its place, inline with THE FEED");
  assert.equal(at(600), -hide + stick, "scrolled down: out of sight above the Masthead");
  assert.equal(at(-30), -hide + stick + 30, "up 30: down into view by 30");
  assert.equal(at(-150), stick, "up 150 more: held under the Masthead");
  assert.equal(at(20), stick - 20, "down 20: away at the page's pace, as if scrolled");
  assert.equal(at(-500), 80 - y > stick ? 80 - y : stick, "back near the top: in its place again");
  // the component: one box read, one transform written a frame
  assert.match(eq, /q = quickReturn\(q, d, hide\);/);
  assert.match(eq, /const next = quickOffset\(natural, stick, q\);/);
  assert.match(eq, /el\.style\.transform = offset \? `translate3d\(0, \$\{offset\.toFixed\(1\)\}px, 0\)` : "";/);
  assert.match(eq, /if \(q === -Infinity\) q = -hide; \/\/ it starts out of sight: only scrolling up brings it/);
  assert.match(eq, /const mast = document\.querySelector\("\.masthead"\);/, "under the Masthead as it stands (a phone's notch counts)");
  assert.match(css, /\.feq \{ position: relative; z-index: 60; display: inline-flex; align-self: center; flex: none; will-change: transform; \}/, "over the cards, under the fixtures");
});

test("the key: a curved square of the fixtures' glass, the house's symbol, reactive like the words", () => {
  assert.match(eq, /const glass = useLiquidGlass\(keyRef, \{ id: "lg-eqkey", strength: 0\.8, shine: false, bezel: "fixture" \}\);/, "the fixtures' liquid glass");
  assert.match(eq, /<Icon name="eq" size=\{20\} \/>/, "the house's symbol");
  assert.match(read("app/components/Icons.jsx"), /\n  eq: <g \{\.\.\.P\}>/, "drawn in the house hand");
  assert.match(css, /\.eqkey \{[^}]*border-radius: var\(--radius-card\);/s, "a curved square");
  assert.match(css, /\.eqkey \{[^}]*background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);[^}]*box-shadow: var\(--glass-shadow\), var\(--glass-lip\);/s, "the fixtures' glass");
  assert.match(css, /\.eqkey\[data-refract="1"\] \{[^}]*var\(--lg-filter\)/);
  assert.match(css, /\.eqkey \.ic \* \{ vector-effect: non-scaling-stroke; stroke-width: 1\.5px; \}/, "the fixtures' stroke");
  assert.match(css, /\.eqkey \{ --eq-glow-a: calc\(1 - var\(--gl, 0\)\); \}/, "its glow fades as the words' does");
  assert.match(css, /\.eqkey\[data-ground\] \{ color: var\(--g-ink\); \}/, "the words' blend of ink");
  assert.match(css, /\.eqkey\[data-ground\]\[data-bright\] \{ color: var\(--g-ink-on-light\); --eq-glow-a: 0; \}/, "over a bright card: the solid ink, no glow");
  assert.match(eq, /const bright = next > 0 && !!brightSurfaceAt\(box\.left \+ box\.width \/ 2, natural \+ next \+ h \/ 2, el, TINT_BRIGHT\);/, "one point under where it will be drawn, only while it floats, read before anything is written");
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{ \.eqkey, \.eqkey\[data-refract="1"\] \{[^}]*backdrop-filter: none;/);
});
