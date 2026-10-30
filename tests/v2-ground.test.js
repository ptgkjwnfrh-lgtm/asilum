// tests/v2-ground.test.js — THE GROUND'S INK (owner, 29 Oct 2026: "all text should be reactive, glow when background
// is dark, solid black or grey when background is light, so THE FEED should glow in light mode because its on a dark
// background"; lib/ink.js GROUND_TEXT, GROUND, groundLuma, groundMix; app/components/GroundInk.jsx).
//
// Declared before measuring:
//   - the ground the words are read against is the page's own: GROUND holds app/globals.css --bg-grad's linear
//     gradient stop for stop, in both themes;
//   - in light, a word at the screen's top (THE FEED, where the ground measured 0.53–0.60) takes the glowing white
//     outright, one on the ice of the middle (0.9 and more) the solid ink outright, and between them a blend that
//     never jumps: across the band the mix is smooth and moves no more than 0.35 for 6px of travel on a phone;
//   - in dark every word on the ground glows (the ground is near-black throughout);
//   - the words are read each scroll frame by arithmetic on their boxes (no hit test, no pixel), again when the layout
//     settles under them, when the theme turns; on iOS WebKit, which scrolls a fixed background, by the page's height;
//   - the CSS mixes colour and glow from --gl and puts no colour transition on them (it would trail the scroll);
//     Figure 20's head and foot, on the page, take it through --on-media and leave the card ink's watcher.
//   Measured in the page, 375px light (29 Oct 2026): every ground word on screen matched its model within 0.02 at
//   rest and every 30 frames of a scroll; THE FEED 0 (glowing); the largest change in a frame at 6px 0.24; 1 dropped
//   frame in 300, as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUND, GROUND_TEXT, GROUND_TURN, GROUND_BAND, groundLuma, groundMix, groundFrac, INK_ZONES } from "../lib/ink.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const raw = read("app/globals.css");

test("the ground is the page's own gradient, stop for stop, in both themes", () => {
  const grads = [...raw.matchAll(/--bg-grad:[\s\S]*?linear-gradient\(180deg, ([^)]+)\);/g)].map((m) => m[1]);
  assert.equal(grads.length, 2, "dark's and light's");
  const stops = (g) => g.split(",").map((x) => x.trim().split(/\s+/)).map(([c, p]) => [parseFloat(p) / 100, c]);
  assert.deepEqual(stops(grads[0]), GROUND.dark.map(([f, c]) => [f, c]), "dark (the :root block comes first)");
  assert.deepEqual(stops(grads[1]), GROUND.light.map(([f, c]) => [f, c]), "light");
  assert.match(raw, /html \{ background-color: var\(--bg\); background-image: var\(--bg-grad\); background-attachment: fixed;/, "fixed to the screen");
});

test("glowing white on the dark, solid on the ice, a smooth blend between", () => {
  const vh = 812, at = (y) => groundMix(groundLuma(groundFrac({ top: y - 10, height: 20 }, { vh }), "light"));
  assert.equal(at(92), 0, "THE FEED, at the top of a phone's light page, glows outright");
  assert.ok(at(134) < 0.15, "the modes under it all but glow (" + at(134).toFixed(3) + ")");
  assert.equal(at(406), 1, "the middle of the screen, the ice: the solid ink");
  assert.equal(at(780), 0, "the foot of the screen, the dark blue again: glowing");
  let worst = 0;
  for (let y = 60; y < vh - 60; y += 1) worst = Math.max(worst, Math.abs(at(y + 6) - at(y)));
  assert.ok(worst <= 0.35, `6px of travel moves the mix ${worst.toFixed(3)} at most`);
  for (let l = 0; l <= 1.0001; l += 0.01) { assert.ok(groundMix(l) >= 0 && groundMix(l) <= 1); if (l > 0) assert.ok(groundMix(l) >= groundMix(l - 0.01) - 1e-9, "never backwards"); }
  assert.equal(groundMix(NaN), 0); assert.equal(groundMix(null), 0);
  assert.ok(GROUND_TURN - GROUND_BAND > groundLuma(92 / vh), "the turn's dark edge above the ground behind THE FEED");
  assert.ok(GROUND_TURN + GROUND_BAND < groundLuma(0.5), "and its light edge under the ice");
  for (let f = 0; f <= 1; f += 0.05) assert.equal(groundMix(groundLuma(f, "dark")), 0, "dark: glowing everywhere");
  // iOS WebKit scrolls the ground with the page: the box by the page's height
  assert.equal(groundFrac({ top: 100, height: 20 }, { fixed: false, scrollY: 900, docH: 10000 }), 0.101);
});

test("the words on the ground, worked out each frame without a hit test", () => {
  assert.deepEqual([...GROUND_TEXT], [".headline", ".fmodes .fmode", ".fmodes .txtbtn", ".filters .toggle", ".f20post .p2head", ".f20post .p2foot", ".eqkey"]);
  assert.ok(INK_ZONES.every((z) => !/\.f20post \.p2(head|foot)$/.test(z)) && INK_ZONES.some((z) => /:not\(\.f20post\) \.p2head/.test(z)), "Figure 20's head and foot left to the ground");
  const g = read("app/components/GroundInk.jsx");
  assert.match(read("app/shell.js"), /<InkWatch \/>\n\s*<GroundInk \/>/, "mounted once by the shell");
  assert.ok(!/elementsFromPoint|getImageData|drawImage/.test(g), "arithmetic on boxes only");
  assert.match(g, /const gl = groundMix\(groundLuma\(groundFrac\(r, at\), theme\)\);/);
  assert.match(g, /if \(el\.__gl != null && Math\.abs\(el\.__gl - gl\) < 0\.01\) continue;/, "written only when it moves");
  assert.match(g, /el\.style\.setProperty\("--gl", gl\.toFixed\(3\)\);/);
  assert.match(g, /const off = subscribeFrame\(\{\s*name: "ground-ink",/, "every scroll frame, in the one frame (lib/frame.js): read, then write");
  assert.match(g, /const ro = new ResizeObserver\(ask\);\s*ro\.observe\(document\.body\);/, "again when the layout settles");
  assert.match(g, /document\.fonts\.ready\.then\(ask/);
  assert.match(g, /attributeFilter: \["data-theme"\]/, "and when the theme turns");
  assert.match(g, /CSS\.supports\("-webkit-touch-callout", "none"\)/, "iOS WebKit told by its own property, not a guess at the platform");
});

test("the CSS mixes the colour and the glow from --gl, and trails nothing", () => {
  assert.match(css, /\[data-ground\] \{\s*--g-ink: color-mix\(in srgb, var\(--g-ink-on-light\) calc\(var\(--gl, 0\) \* 100%\), var\(--g-ink-on-dark\)\);/);
  assert.match(css, /--g-glow: 0 0 1px color-mix\(in srgb, var\(--g-ink-on-dark\) calc\(\(1 - var\(--gl, 0\)\) \* 100%\), transparent\)/, "the glow fades as the ink darkens");
  assert.match(css, /\[data-theme="light"\] \.headline\[data-ground\] \{ color: var\(--g-ink\); text-shadow: var\(--g-glow\); \}/, "the headline in light (dark keeps its chrome, glowing)");
  const rule = css.match(/\[data-theme\] \.seg > \.fmode\[data-ground\]:not\(\.cur\)[^{]*\{([^}]*)\}/)[1];
  assert.match(rule, /color: var\(--g-ink\); text-shadow: var\(--g-glow\); transition: background var\(--dur-2\) var\(--ease-out\);/, "no colour transition to trail the scroll");
  assert.match(css, /\.f20post \.p2head\[data-ground\], \.f20post \.p2foot\[data-ground\] \{ --on-media: var\(--g-ink\); text-shadow: var\(--g-glow\); \}/);
  assert.match(css, /:root \{ --g-ink-on-light: #18232e; --g-ink-on-dark: #f4f9fc; \}/, "solid near-black, glowing white");
});
