// tests/v2-polish.test.js — TIGHTENING (owner, 28 Oct 2026: "tighten up all animations and loose ends").
//
// Declared before measuring:
//   - the theme turns in one place (lib/theme.js): a light or dark pick is pinned on the device, "system" hands
//     it back to the device, and an unknown pick does nothing; it cross-fades on the motion ladder unless motion
//     is reduced or the browser has no View Transitions;
//   - a block's ink eases when it flips (a registered colour, moved over --dur-2), the dots keeping their own
//     press transitions;
//   - no state of the deck restyles the page's root (v2-ticker.test.js pins the measurement and the rules);
//   - the Design Console's ticker test shows the test sent last, whoever sent it (the side button too);
//   - an off-screen Feed card is skipped by the browser (content-visibility), on the card, never the cell (the
//     cell's shadows lie outside it) and never Figure 20 (it reaches past its box).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { themeSteps, THEME_KEY, THEMES } from "../lib/theme.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const theme = read("lib/theme.js");

test("a theme pick: pinned, handed back, or nothing", () => {
  assert.equal(THEME_KEY, "asilum-theme");
  assert.deepEqual([...THEMES], ["light", "dark", "system"]);
  assert.deepEqual(themeSteps("light", false), { theme: "light", store: "light" });
  assert.deepEqual(themeSteps("dark", true), { theme: "dark", store: "dark" }, "a pick wins over the device");
  assert.deepEqual(themeSteps("system", true), { theme: "light", store: null }, "system follows the device and forgets the pick");
  assert.deepEqual(themeSteps("system", false), { theme: "dark", store: null });
  assert.equal(themeSteps("sepia", true), null, "an unknown pick does nothing");
  assert.match(read("app/layout.js"), /localStorage\.getItem\("asilum-theme"\)/, "the prepaint reads the same key");
});

test("the turn cross-fades on the ladder, and not when motion is reduced", () => {
  assert.match(theme, /const still = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;/);
  assert.match(theme, /if \(animate && !still && typeof document\.startViewTransition === "function"\) document\.startViewTransition\(turn\);\s*else turn\(\);/);
  assert.match(css, /::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation-duration: var\(--dur-2\); animation-timing-function: var\(--ease-out\); \}/);
});

test("the ink eases when it flips (a later reading; the first lands as it is, 29 Oct 2026)", () => {
  assert.match(css, /@property --on-media \{ syntax: "<color>"; inherits: true; initial-value: #ffffff; \}/);
  assert.match(css, /\[data-ink\]\[data-ink-ease\] \{ transition: --on-media var\(--dur-2\) var\(--ease-out\); \}/);
  assert.ok(!/var\(--on-media,/.test(css), "nothing reads --on-media with a fallback (registering would have swallowed it)");
  const dots = css.match(/\.fcell \.carddots\[data-ink\]\[data-ink-ease\] \{ transition: ([^;]+); \}/)[1];
  assert.match(dots, /background var\(--dur-1\) var\(--ease-out\), transform var\(--dur-1\) var\(--ease-out\)/, "the dots keep their press");
  assert.ok(!/@property --on-card/.test(css), "--on-card keeps its fallback (not registered)");
});

test("the console's ticker test follows the side button", () => {
  const dc = read("app/components/DesignConsole.jsx");
  assert.match(dc, /const heard = \(e\) => setTickerTest\(e && e\.detail && e\.detail\.mode \? e\.detail\.mode : null\);\s*window\.addEventListener\("asilum:ticker-test", heard\);/);
});

test("an off-screen card is skipped, its shadows and Figure 20 kept", () => {
  assert.match(css, /\.fcell > \.card:not\(\.f20post\) \{ content-visibility: auto; \}/);
  assert.ok(!/\.fcell \{[^}]*content-visibility/.test(css), "never on the cell: its overcast lies outside its box");
  assert.match(css, /\.fcell > \.card \{[^}]*overflow: hidden;/, "the card already clips its own content");
});
