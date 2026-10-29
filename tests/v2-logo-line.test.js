// tests/v2-logo-line.test.js — THE LOGO WITH THE MASTHEAD'S LINE INTEGRATED (owner, 29 Oct 2026: "new logo with the
// masthead line intergated"; docs/brand/asilum-logo-2026-10-29.jpg; lib/wordmark.js, app/components/Wordmark.jsx).
//
// Declared before measuring:
//   - lib/wordmark.js REF is the reference as it is: re-measured here from the image (the word's dark ink, the red
//     asterisk, the white brick's rows by column, the shoulder, the line), every number within 2px;
//   - the brick is that reference laid round the word as set: the word wholly inside it (its top above the
//     capitals, its foot below the baseline), the shoulder's slant the reference's within 1°, the line as thick as
//     drawn and flush with the brick's foot, the bends rounded;
//   - the brick runs off the screen's left edge; the box's numbers in the CSS (width, height) and the line's
//     thickness (--mh-line-h) are the module's own; the Masthead rests the brick's foot on the line's foot;
//   - three layers: the brick in the white glow, the word unlit in the artwork's black (both themes), the asterisk
//     in its red glow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REF, WORD, RUN, brickGeometry, brickPath, brickBox } from "../lib/wordmark.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const wm = read("app/components/Wordmark.jsx");

test("REF is the reference, re-measured from the image", async () => {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(new URL("../docs/brand/asilum-logo-2026-10-29.jpg", import.meta.url).pathname).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const p = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
  const white = (q) => q[0] > 235 && q[1] > 235 && q[2] > 235, dark = (q) => q[0] < 60 && q[1] < 60 && q[2] < 60, red = (q) => q[0] > 180 && q[1] < 90 && q[2] < 90;
  const box = (f) => { let a = [W, 0, H, 0]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f(p(x, y))) a = [Math.min(a[0], x), Math.max(a[1], x), Math.min(a[2], y), Math.max(a[3], y)]; return a; };
  const span = (x) => { let t = null, b = null; for (let y = 0; y < H; y++) if (white(p(x, y))) { if (t === null) t = y; b = y; } return [t, b]; };
  const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 2, `${what}: measured ${a}, REF ${b}`);
  const ink = box(dark), star = box(red);
  near(ink[0], REF.aLeft, "the A's left"); near(ink[1], REF.mRight, "the M's right"); near(ink[2], REF.capsTop, "the capitals' top"); near(ink[3], REF.base, "the baseline");
  near(star[0], REF.aLeft, "the asterisk's left, on the A's");
  const [bt, bf] = span(500);
  near(bt, REF.brickTop, "the brick's top"); near(bf, REF.foot, "the brick's foot");
  const [lt, lf] = span(1600);
  near(lt, REF.lineTop, "the line's top"); near(lf, REF.foot, "the line's foot, the brick's");
  // the slant's corners: a line fitted through its straight part, met with the brick's top and the line's top
  const xs = [], ys = []; for (let x = 1050; x <= 1150; x += 5) { xs.push(x); ys.push(span(x)[0]); }
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const m = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  near(Math.round(mx + (bt - my) / m), REF.shoulder, "the shoulder's corner");
  near(Math.round(mx + (lt - my) / m), REF.toe, "the toe's corner");
  assert.equal(span(0)[0] !== null, true, "the brick runs off the image's left edge");
});

test("the brick laid round the word as set", () => {
  const s = Number(wm.match(/set: Object\.freeze\(\{ s: ([\d.]+), dx: ([\d.]+) \}\)/)[1]), dx = Number(wm.match(/set: Object\.freeze\(\{ s: [\d.]+, dx: ([\d.]+) \}\)/)[1]);
  // WORD is the word as Wordmark.jsx sets it (Michroma's A ink from 5, the M's to 604.3 + 206, at 161)
  assert.ok(Math.abs(WORD.aInk - (dx + s * 5)) < 0.01 && Math.abs(WORD.mInk - (dx + s * (604.3 + 206))) < 0.01, "the word's ink, set");
  assert.ok(Math.abs(WORD.capsTop - (s * 0.25 + 60.625 * (1 - s))) < 0.01 && Math.abs(WORD.base - (s * 121 + 60.625 * (1 - s))) < 0.01, "its capitals, set");
  const g = brickGeometry();
  assert.ok(g.top < WORD.capsTop && g.foot > WORD.base, "the word wholly inside the brick");
  assert.ok(g.shoulder > WORD.mInk, "the shoulder past the M");
  const slope = (a, b, c, d) => Math.atan2(d - c, b - a) * 180 / Math.PI;
  assert.ok(Math.abs(slope(g.shoulder, g.toe, g.top, g.line) - slope(REF.shoulder, REF.toe, REF.brickTop, REF.lineTop)) < 1, "the slant the reference's, within a degree");
  const ratio = (REF.foot - REF.lineTop) / (REF.foot - REF.brickTop);
  assert.ok(Math.abs(g.thick / (g.foot - g.top) - ratio) < 0.01, "the line as thick as drawn, against the brick");
  assert.ok(Math.abs(g.foot - g.line - g.thick) < 0.01, "flush with the brick's foot");
  assert.ok(g.bend > 0, "the bends rounded");
  const d = brickPath(g, { end: brickBox(g).end });
  assert.ok(d.startsWith(`M-${RUN} `) && d.includes(`H-${RUN} Z`), "running off the screen's left edge");
  // wherever the logo sits (its box's left is inside the window), at the logo's smallest unit, the brick reaches
  // past the left edge of a window 3840px wide (at 800px the old 600 units stopped 75px short of the edge)
  const floor = Number(css.match(/--wm-w: clamp\(([\d.]+)px,/)[1]), unit = floor * 129 / 900 / 120.75;
  assert.match(css, /--wm-u: calc\(var\(--wm-w\) \* 129 \/ 900 \/ 120\.75\);/, "the unit as reckoned here");
  assert.ok((RUN + brickBox(g).x) * unit >= 3840, `the brick runs ${Math.round((RUN + brickBox(g).x) * unit)}px left of the box`);
  assert.equal((d.match(/Q/g) || []).length, 2, "two rounded bends");
});

test("the box, the line and the CSS agree", () => {
  const g = brickGeometry(), b = brickBox(g);
  const n = (v) => String(v).replace(".", "\\.");
  assert.match(css, new RegExp(`\\.wmart \\{[^}]*width: calc\\(var\\(--wm-u\\) \\* ${n(b.w)}\\); aspect-ratio: ${n(b.w)} / ${n(b.h)};`), "the box: " + b.w + " by " + b.h);
  assert.match(css, new RegExp(`--mh-line-h: calc\\(var\\(--wm-u\\) \\* ${n(g.thick)}\\);`), "the Masthead's line as thick as the brick's toe: " + g.thick);
  assert.match(css, new RegExp(`\\.brandfix \\{[^}]*margin-top: calc\\(var\\(--mh-line-top\\) \\+ var\\(--mh-line-h\\) - var\\(--wm-u\\) \\* ${n(b.h)}\\);`), "the brick's foot on the line's foot");
  assert.ok(Math.abs(b.h - (g.foot - b.top)) < 0.001 && b.top < g.top, "the box from above the brick (a breath for the glow) to its foot");
  assert.match(wm, /const VIEW = `\$\{BOX\.x\} \$\{BOX\.top\} \$\{BOX\.w\} \$\{BOX\.h\}`;/);
  assert.match(wm, /const PATH = brickPath\(BRICK, \{ end: BOX\.end \}\);/);
});

test("three layers: the brick in the white glow, the word unlit in the artwork's black, the asterisk in red", () => {
  const order = ['className="wmlit wmbrick"', 'className="wmtype"', 'className="wmlit wmlitstar"'].map((c) => wm.indexOf(c));
  assert.ok(order.every((v) => v > -1) && order[0] < order[1] && order[1] < order[2], "brick, word, asterisk");
  assert.match(wm, /<path className="wmbar" d=\{PATH\} \/>/);
  assert.match(css, /\.wmbrick \{ filter: var\(--wm-glow\); \}/);
  assert.match(css, /\.wmlitstar \{ filter: var\(--wm-glow-r\); \}/);
  assert.match(css, /:root \{[^}]*--wm-ink: #001512;/, "the artwork's black in dark");
  assert.match(css, /\[data-theme="light"\] \{[^}]*--wm-ink: #001512;/, "and in light");
});
