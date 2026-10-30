// tests/v2-ink.test.js — THE REACTIVE INK, THE GLOWING LINES, THE CLEARER
// ACTIONS (owner, 28 Oct 2026: "for all the text and symbols they must be
// reactive to go from dark to light depending on the background to
// strengthen ledibility. also all the accent lines that arent directly on a
// card must glow so on the carousels the accent line underneath the username
// must glow. also the like, comment, stamp, and share button should be a
// little bit more visible lets bring the opacity up a bit").
//
// Declared before measuring:
//   - the ink is chosen by brightness: a bright ground takes the dark ink, a
//     dark one the light ink, at the tiles' own line (0.55); a picture's
//     transparent pixels read as the page under them;
//   - a block is mapped onto the picture as object-fit draws it (cover or
//     contain, centred), so the ink reads the part of the picture really
//     under the words;
//   - the watcher reads what is under each block — a picture's own pixels
//     over what is behind the picture at the time of reading (the theme turns it),
//     or the page where no picture is — never marks a block on a reading it
//     could not make; (29 Oct 2026, "the reactive fonts on the cards is slow
//     and weird": every block came on screen unread, its ink a median 0.5s
//     late, then faded in) a block is read a screen AHEAD of the view, the
//     picture under it found by geometry among its own cell's pictures (the
//     highest-stacked, then the most centred) — no hit test, so it works off
//     the screen and nothing waits for the scroll to rest — in idle slices;
//     the first reading lands as it is, only a later one eases. Measured:
//     31 of 31 blocks inked before they came on; 1 dropped frame in 300 as
//     before; the geometry chose the hit test's picture at 234 of 234 points;
//   - the scrim under dark ink turns pale (never on Figure 20, which has none);
//     the rule under a post's name takes its head's ink;
//   - Figure 20's rule, on the page and not on a card, is the Masthead's line:
//     the white bar in the same glow;
//   - the four actions are clearer: 0.78 -> 0.92, the quiet ones 0.45 -> 0.6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INK_ZONES, INK_TURN, luma, lumaGrid, regionLuma, zoneOnPicture, inkOn } from "../lib/ink.js";
import { INK_DARK, INK_LIGHT, inkFor } from "../lib/model/stills.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const watch = read("app/components/InkWatch.jsx");

test("brightness picks the ink, at the tiles' own line", () => {
  assert.equal(INK_TURN, 0.55);
  assert.equal(inkOn(luma(255, 255, 255)), "dark");
  assert.equal(inkOn(luma(0, 0, 0)), "light");
  assert.equal(inkOn(0.56), "dark");
  assert.equal(inkOn(0.55), "light");
  assert.equal(inkOn(null), null);
  assert.equal(inkOn(NaN), null);
  // the same verdict as the tiles' (stills.js inkFor) for every ground they draw
  for (const hex of ["#ffffff", "#000000", "#8a8a95", "#d99a3d", "#232326", "#c25a72"]) {
    const n = parseInt(hex.slice(1), 16);
    assert.equal(inkOn(luma((n >> 16) & 255, (n >> 8) & 255, n & 255)) === "dark" ? INK_DARK : INK_LIGHT, inkFor(hex), hex);
  }
});

test("a picture's grid: alpha reads as the page under it; a region is the mean of its cells", () => {
  // 2 x 1: an opaque black pixel, a fully transparent one over a white page
  const g = lumaGrid(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]), 2, 1, 1);
  assert.deepEqual([...g], [0, 1]);
  assert.equal(regionLuma(g, 2, 1, [0, 0, 1, 1]), 0.5);
  assert.equal(regionLuma(g, 2, 1, [0, 0, 0.5, 1]), 0);
  assert.equal(regionLuma(g, 2, 1, [0.5, 0, 1, 1]), 1);
  assert.equal(regionLuma(g, 2, 1, [1.2, 0, 1.5, 1]), null, "a region off the picture is no reading");
});

test("a block lands on the picture as object-fit draws it", () => {
  // a 200 x 100 picture covering a 100 x 100 box at (0, 0): scaled 1, its middle half shown
  const box = { left: 0, top: 0, width: 100, height: 100 };
  assert.deepEqual(zoneOnPicture({ left: 0, top: 0, width: 50, height: 100 }, box, 200, 100), [0.25, 0, 0.5, 1]);
  // contained instead: scaled 0.5, letterboxed top and bottom
  assert.deepEqual(zoneOnPicture({ left: 0, top: 25, width: 100, height: 50 }, box, 200, 100, "contain"), [0, 0, 1, 1]);
  assert.equal(zoneOnPicture({ left: 0, top: 0, width: 1, height: 1 }, { left: 0, top: 0, width: 0, height: 10 }, 10, 10), null);
});

test("the blocks that read their ground", () => {
  assert.deepEqual([...INK_ZONES], [
    ".card.piece.v-hero .pchead", ".card.piece.v-hero .pcfoot",
    // (29 Oct 2026) Figure 20's head and foot float on the page: they take the ground's ink (tests/v2-ground.test.js)
    ".card.wpostcard.p2.withmedia:not(.f20post) .p2head", ".card.wpostcard.p2.withmedia:not(.f20post) .p2foot",
    ".card.placecard.withphoto .placeopen", ".card.bstrip.withphoto .bsopen", ".fcell .carddots",
  ]);
});

test("the watcher: what is really under the words, read a screen ahead, never on a missing reading", () => {
  assert.match(read("app/shell.js"), /<InkWatch \/>/, "mounted once by the shell");
  const under = watch.slice(watch.indexOf("function mediaUnder"), watch.indexOf("// THE BRIGHT CARD UNDER A POINT"));
  assert.match(under, /const cell = zone\.closest\("\.fcell"\) \|\| zone\.closest\("\.card"\);/, "among the block's own cell's pictures");
  assert.match(under, /if \(zone\.contains\(m\) \|\| !\(m\.offsetWidth > 0\)\) continue;/, "never the block's own, never one not drawn");
  assert.match(under, /if \(x < b\.left \|\| x > b\.right \|\| y < b\.top \|\| y > b\.bottom\) continue;/, "one that lies under the point");
  assert.match(under, /if \(cs\.visibility === "hidden" \|\| \+cs\.opacity < 0\.05\) continue;/, "and shows");
  assert.match(under, /if \(z > bz \|\| \(z === bz && d < bd\)\) \{ bz = z; bd = d; best = m; \}/, "the highest-stacked, then the most centred");
  assert.ok(!/elementsFromPoint/.test(under) && !/elementsFromPoint/.test(watch.slice(watch.indexOf("function measureZone"), watch.indexOf("export default function InkWatch"))), "no hit test in a reading: it works off the screen");
  assert.match(watch, /const media = mediaUnder\(x, y, zone\);/);
  assert.match(watch, /if \(!\(r\.width > 0\) \|\| !\(r\.height > 0\)\) return;/, "on the screen or off it");
  assert.match(watch, /if \(!media\) \{ ls\.push\(ground\); continue; \}/, "no picture: the page");
  assert.match(watch, /if \(ls\.some\(\(l\) => l == null\)\) return;/, "a reading it could not make leaves the block as it was");
  // a picture's clear parts show what is behind it, which turns with the theme: the pixels are kept, and the ground
  // behind the picture is mixed in at each reading (a baked-in ground kept the light theme's verdict in the dark)
  assert.match(watch, /return \{ data, nw, nh \};/, "the pixels are kept, not a brightness");
  assert.match(watch, /const grid = lumaGrid\(g\.data, GRID, GRID, behind\(media, ground\)\);/, "the ground behind the picture, at each reading");
  assert.match(watch, /if \(v === "#010203"\) return null;/, "a colour it cannot read is no reading");
  assert.match(watch, /export const AHEAD = "100% 0px 100% 0px";/, "a screen ahead");
  assert.match(watch, /\{ rootMargin: AHEAD, threshold: 0 \}/);
  assert.ok(!/QUIET_MS|lastScroll/.test(watch), "nothing waits for the scroll to rest");
  assert.match(watch, /if \(deadline && deadline\.timeRemaining\(\) < SLICE_MS && !deadline\.didTimeout\) break;/, "in idle slices of the frame");
  assert.match(watch, /requestIdleCallback\(flush, \{ timeout: 120 \}\)/);
  assert.match(watch, /if \(first\) requestAnimationFrame\(\(\) => \{ zone\.dataset\.inkEase = ""; \}\);/, "the first reading lands, later ones ease");
  assert.match(watch, /document\.addEventListener\("f20settle", onSettle\);/, "read again when Figure 20 settles");
  assert.match(watch, /attributeFilter: \["data-theme"\]/, "and when the theme turns");
  const fig = read("app/components/Fig20.jsx");
  assert.equal((fig.match(/new CustomEvent\("f20settle", \{ bubbles: true,/g) || []).length, 2, "the settle bubbles to the watcher");
});

test("the ink in the CSS: the tokens, the scrims, the rule under the name", () => {
  assert.match(css, /\[data-ink\]\[data-ink-ease\] \{ transition: --on-media var\(--dur-2\) var\(--ease-out\); \}/, "only a later reading eases");
  assert.ok(!/\[data-ink\] \{ transition/.test(css), "the first does not fade in");
  assert.match(css, /\[data-ink="dark"\] \{ --on-media: var\(--ink-on-bright\); --on-card: var\(--ink-on-bright\); \}/);
  assert.match(css, /\[data-ink="light"\] \{ --on-media: var\(--ink-on-dark\); --on-card: var\(--ink-on-dark\); \}/);
  assert.match(css, /\.card\.piece\.v-hero \.pchead\[data-ink="dark"\], \.card\.wpostcard\.p2\.withmedia:not\(\.f20post\) \.p2head\[data-ink="dark"\] \{\s*background: linear-gradient\(180deg, color-mix\(in srgb, var\(--paper\)/, "a pale scrim under dark ink, never on Figure 20");
  assert.match(css, /\.p2head\[data-ink="dark"\] \+ \.p2rule \{ --on-media: var\(--ink-on-bright\); \}/);
});

test("Figure 20's rule glows like the Masthead's line", () => {
  assert.match(css, /\.card\.wpostcard\.p2\.withmedia\.f20post \.p2rule::after \{ background: var\(--wm-bar\); \}/);
  assert.match(css, /\.card\.wpostcard\.p2\.withmedia\.f20post \.p2rule \{ filter: var\(--wm-glow\); \}/);
});

test("the like, comment, stamp and share buttons are clearer", () => {
  assert.match(css, /\.p2acts \{[^}]*opacity: 0\.92; \}/, "a post's actions");
  assert.match(css, /\.card\.piece\.v-hero \.pcacts \{[^}]*opacity: 0\.92;/, "a piece's actions");
  assert.match(css, /\.p2acts \.wpcact\.quiet \{ opacity: 0\.6;/, "the quiet ones too");
});
