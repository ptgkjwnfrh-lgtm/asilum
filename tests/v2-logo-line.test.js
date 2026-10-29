// tests/v2-logo-line.test.js — THE LOGO WITH THE MASTHEAD'S LINE INTEGRATED (owner, 29 Oct 2026: "new logo with the
// masthead line intergated"; docs/brand/asilum-logo-2026-10-29.jpg; lib/wordmark.js, app/components/Wordmark.jsx),
// and the same evening's two rounds: "lets make the masthead line thinner and the lines under the buttons … make
// the font a little bolder and make the [text] negative, and keep the asterisk full and red", then "i still want
// the button breaks, make the circled area flush the curve kind of looks jagged and the glow doesnt look
// consistent throughout the whole thing … make the glow consistent. also can you add a thin white bezel line along
// the edge of the disc".
//
// Declared before measuring:
//   - lib/wordmark.js REF is the reference as it is: re-measured here from the image (the word's dark ink, the red
//     asterisk, the white brick's rows by column, the shoulder, the line), every number within 2px; the brick laid
//     with nothing changed (line and bend null) is the reference's, line and bends as drawn;
//   - the brick as set: the word wholly inside it, the slant the reference's within 1°, the line LINE thick (thinner
//     than drawn) and flush with the brick's foot, the bends BEND (wider than drawn); the brick runs off the left
//     edge of a window 3840px wide and ENDS where its toe's curve lands on the line (no white of its own past it);
//   - the glow comes off the brick's rim, LINE deep: its inner outline the outer drawn in by LINE on every side
//     (top, slant, and along the foot exactly the line), so the halo round the brick is the line's; it is clipped
//     away from a window round the word (padded by the bold stroke) that lies wholly inside the brick;
//   - the word is CUT out of the brick by a mask, bolder by a BOLD stroke; the brick itself does not glow; the
//     asterisk is whole and red in its own red glow; no ink token is left for the word;
//   - the Masthead's line is LINE thick, starts a pixel under the brick's end, still broken at the keys;
//   - the CSS box numbers are the module's;
//   - the disc (the wheel's pane) wears the fixtures' shine rim, lit along its visible top;
//   - ("tint the letters but i want the transition as smooth as possible, seamless, fast and reactive") under the
//     cut lies the word again, fuller than the hole, in a TRANSLUCENT dark the glass shows through: in light, laid
//     over white it sets the letters at least 3:1 (at most 5:1) against the white brick, and laid over the light
//     glass it comes out darker still — it follows what is behind; in dark it is clear; no blend mode (a multiply
//     was measured flat in the page: 121,126,135 over the glass and over a white card alike); a theme turn eases
//     it, never under reduced motion;
//   - ("i still wanted the negative logo to be see through however i wanted it to be seemlessly reactive to tint
//     once passing over a really bright card") the tint is hidden until read and then clipped to the bright
//     cards behind the word — their own boxes, cut to the logo's — re-read on every scroll frame (the page's and a
//     carousel's), a resize, a load, a settle and a theme turn; "bright" is a plain ground at TINT_BRIGHT or more
//     on a card, or a block InkWatch has read as sitting on a bright ground; pictures and gradients are not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REF, WORD, RUN, LINE, BEND, BOLD, TINT_BLEED, brickGeometry, brickPath, rimPath, brickBox, glowWindow } from "../lib/wordmark.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const wm = read("app/components/Wordmark.jsx");
const nums = (d) => d.match(/-?[\d.]+/g).map(Number);

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
  const slope = (a, b, c, d) => Math.atan2(d - c, b - a) * 180 / Math.PI;
  const drawnSlope = slope(REF.shoulder, REF.toe, REF.brickTop, REF.lineTop);
  // as drawn: nothing changed
  const d0 = brickGeometry(REF, WORD, null, null), fx = (WORD.mInk - WORD.aInk) / (REF.mRight - REF.aLeft);
  const ratio = (REF.foot - REF.lineTop) / (REF.foot - REF.brickTop);
  assert.ok(Math.abs(d0.thick / (d0.foot - d0.top) - ratio) < 0.01, "as drawn: the line as thick as drawn, against the brick");
  assert.ok(Math.abs(d0.bend - REF.bend * fx) < 0.01, "as drawn: the bends as drawn");
  assert.ok(Math.abs(slope(d0.shoulder, d0.toe, d0.top, d0.line) - drawnSlope) < 1, "as drawn: the slant");
  // as set
  const g = brickGeometry();
  assert.ok(g.top < WORD.capsTop && g.foot > WORD.base, "the word wholly inside the brick");
  assert.ok(g.shoulder > WORD.mInk, "the shoulder past the M");
  assert.ok(Math.abs(slope(g.shoulder, g.toe, g.top, g.line) - drawnSlope) < 1, "the slant the reference's, within a degree");
  assert.equal(g.thick, LINE); assert.ok(LINE < d0.thick * 0.7, "the line thinner than drawn");
  assert.ok(Math.abs(g.foot - g.line - g.thick) < 0.01, "flush with the brick's foot");
  assert.equal(g.bend, BEND); assert.ok(BEND >= 2 * d0.bend, "the bends wider than drawn: a curve, not a kink");
  const d = brickPath(g);
  assert.ok(d.startsWith(`M-${RUN} `) && d.endsWith(`H-${RUN} Z`), "running off the screen's left edge");
  assert.equal((d.match(/Q/g) || []).length, 2, "two rounded bends");
  // the brick ends on the line: the toe's curve lands level on the line's top, then straight down to the foot
  const box = brickBox(g), tail = d.match(/Q([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) V([-\d.]+) H/);
  assert.ok(tail, "the toe's curve, then down to the foot: " + d);
  const [cx, cy, ex, ey, foot] = tail.slice(1).map(Number);
  assert.ok(Math.abs(cy - g.line) < 0.01 && Math.abs(ey - g.line) < 0.01, "the curve's tangent level with the line's top");
  assert.ok(Math.abs(ex - box.end) < 0.01 && Math.abs(foot - g.foot) < 0.01, "and the brick ends there, its box with it");
  assert.ok(ex > cx, "past the corner");
  const floor = Number(css.match(/--wm-w: clamp\(([\d.]+)px,/)[1]), unit = floor * 129 / 900 / 120.75;
  assert.match(css, /--wm-u: calc\(var\(--wm-w\) \* 129 \/ 900 \/ 120\.75\);/, "the unit as reckoned here");
  assert.ok((RUN + box.x) * unit >= 3840, `the brick runs ${Math.round((RUN + box.x) * unit)}px left of the box`);
});

test("the glow comes off the brick's rim, the line's depth, and keeps out of the word", () => {
  const g = brickGeometry(), d = rimPath(g);
  const [outer, inner] = d.split(" Z ").map((p, i) => (i === 0 ? p + " Z" : p));
  assert.equal(outer, brickPath(g), "the outline");
  const pts = nums(inner); // M l y0 H x1 L x2 y2 H l Z
  const [l, y0, x1, x2, y2, l2] = pts;
  assert.ok(l === -RUN && l2 === -RUN, "the rim runs off the screen too");
  assert.ok(Math.abs(y0 - (g.top + LINE)) < 0.01, "along the top, LINE deep");
  assert.ok(Math.abs(y2 - g.line) < 0.01, "along the foot, the line exactly: LINE deep");
  // the slant drawn in: the inner slant parallel to the outer, LINE away from it
  const ux = g.toe - g.shoulder, uy = g.line - g.top, len = Math.hypot(ux, uy);
  const dist = (x, y) => Math.abs((x - g.shoulder) * uy - (y - g.top) * ux) / len;
  assert.ok(Math.abs(dist(x1, y0) - LINE) < 0.01 && Math.abs(dist(x2, y2) - LINE) < 0.01, `the slant, LINE deep: ${dist(x1, y0)}, ${dist(x2, y2)}`);
  assert.match(wm, /<svg className="wmlit wmglow" viewBox=\{VIEW\} focusable="false" style=\{\{ clipPath: WINDOW \}\}>\s*<path className="wmbar" d=\{RIM\} fillRule="evenodd" \/>/, "the rim glows, evenodd, clipped");
  assert.match(css, /\.wmglow \{ filter: var\(--wm-glow\); \}/, "in the line's own glow");
  // the window: round the word and its bold stroke, wholly inside the brick
  const box = brickBox(g), w = glowWindow(box);
  assert.match(w, /^polygon\(evenodd, -9999% -9999%, 9999% -9999%, 9999% 9999%, -9999% 9999%, -9999% -9999%, /, "the whole plane but the window");
  const [x0p, y0p, x1p, , , y1p] = nums(w.slice(w.lastIndexOf("-9999% -9999%, ") + 15));
  const X = (p) => box.x + (p / 100) * box.w, Y = (p) => box.top + (p / 100) * box.h;
  assert.ok(X(x0p) <= WORD.aInk - BOLD / 2 && X(x1p) >= WORD.mInk + BOLD / 2, "across the word and its stroke");
  assert.ok(Y(y0p) <= WORD.capsTop - BOLD / 2 && Y(y1p) >= WORD.base + BOLD / 2, "down the word and its stroke");
  assert.ok(Y(y0p) > g.top && Y(y1p) < g.foot && X(x1p) < g.shoulder - g.bend, "inside the brick, which covers the glow it leaves");
});

test("the word cut out of the brick, bolder; the asterisk whole and red", () => {
  const order = ['className="wmlit wmglow"', 'className="wmtint"', 'className="wmbrick"', 'className="wmlit wmlitstar"'].map((c) => wm.indexOf(c));
  assert.ok(order.every((v) => v > -1) && order.every((v, i) => i === 0 || order[i - 1] < v), "glow, tint, brick, asterisk");
  assert.match(wm, /const cut = "wmc" \+ useId\(\)\.replace\(\/:\/g, ""\);/, "a mask of its own per logo");
  assert.match(wm, /<mask id=\{cut\} maskUnits="userSpaceOnUse"/);
  assert.match(wm, /<rect className="wmplane" x=\{PLANE\.x\} y=\{PLANE\.y\} width=\{PLANE\.w\} height=\{PLANE\.h\} \/>/);
  assert.match(wm, /<text className="wmcut" x=\{WM\.x\.join\(" "\)\} y=\{WM\.base\} strokeWidth=\{BOLD \/ WM\.set\.s\}>ASILUM<\/text>/, "bolder by BOLD in the logo's units, whatever the set's scale");
  assert.match(wm, /<path className="wmbar" d=\{PATH\} mask=\{`url\(#\$\{cut\}\)`\} \/>/, "the brick, the word cut from it");
  assert.match(wm, /const PLANE = \{ x: -RUN - 100, y: BOX\.top - 100, w: RUN \+ BOX\.end \+ 200, h: BOX\.h \+ 200 \};/, "the mask's plane covers the brick's whole run");
  assert.match(css, /\.wmplane \{ fill: #fff; \}/);
  assert.match(css, /\.wmcut \{ font: 400 161px var\(--mich\); fill: #000; stroke: #000; stroke-linejoin: miter; \}/);
  assert.ok(BOLD > 0 && BOLD <= 8, "a little bolder");
  assert.ok(!/\.wmbrick \{[^}]*filter/.test(css), "the brick itself does not glow: its rim does");
  assert.match(css, /\.wmlitstar \{ filter: var\(--wm-glow-r\); \}/);
  assert.match(css, /\.wmstar \{ font: 400 131px var\(--helvetica\); fill: var\(--wm-star\); \}/, "the asterisk filled");
  assert.ok(!/--wm-ink|wmink|wmtype/.test(css + wm.replace(/\/\/[^\n]*/g, "")), "no ink left for a word that is a hole");
});

test("the box, the line and the CSS agree; the line starts at the brick's end, broken at the keys", () => {
  const g = brickGeometry(), b = brickBox(g);
  const n = (v) => String(v).replace(".", "\\.");
  assert.match(css, new RegExp(`\\.wmart \\{[^}]*width: calc\\(var\\(--wm-u\\) \\* ${n(b.w)}\\); aspect-ratio: ${n(b.w)} / ${n(b.h)};`), "the box: " + b.w + " by " + b.h);
  assert.match(css, new RegExp(`--mh-line-h: calc\\(var\\(--wm-u\\) \\* ${LINE}\\);`), "the Masthead's line LINE thick, the brick's: " + LINE);
  assert.match(css, new RegExp(`\\.brandfix \\{[^}]*margin-top: calc\\(var\\(--mh-line-top\\) \\+ var\\(--mh-line-h\\) - var\\(--wm-u\\) \\* ${n(b.h)}\\);`), "the brick's foot on the line's foot");
  assert.ok(Math.abs(b.h - (g.foot - b.top)) < 0.001 && b.top < g.top, "the box from above the brick (a breath for the glow) to its foot");
  assert.match(wm, /const VIEW = `\$\{BOX\.x\} \$\{BOX\.top\} \$\{BOX\.w\} \$\{BOX\.h\}`;/);
  assert.match(wm, /const PATH = brickPath\(BRICK\);/);
  const mast = read("app/components/Masthead.jsx");
  assert.match(mast, /mastLine\(art \? art\.getBoundingClientRect\(\)\.right - o - 1 : NaN, keys\)/, "from a pixel under the brick's end");
  assert.match(css, /\.mhline i \{[^}]*left: calc\(var\(--a\) \+ var\(--gl\) \* var\(--mh-break\) \/ 2\);/, "still broken at the keys");
  assert.match(css, /--mh-break: calc\(var\(--u\) \* 14\);/);
});

test("the disc wears the fixtures' shine rim, lit along its visible top", () => {
  const sw = read("app/components/ScrollWheel.jsx");
  const pane = sw.slice(sw.indexOf('className="ccwglass"'), sw.indexOf("</span>, host)"));
  assert.match(pane, /<i className="fxrim" aria-hidden="true" \/>/, "the deck's own rim, inside the disc's pane");
  assert.match(css, /\.ccwglass \.fxrim \{ background: linear-gradient\(180deg, var\(--fx-rim-hi\) 0%, var\(--fx-rim-lo\) 50%, var\(--fx-rim-lo\) 100%\); \}/, "bright at the top, never fading to nothing");
  assert.match(css, /\.ccwglass \{[^}]*border-radius: 50%;/, "round, so the rim (border-radius: inherit) is");
  assert.match(css, /\.fxrim \{[^}]*border-radius: inherit;/);
});

test("the cut letters tinted by a translucent dark under them: per pixel, every frame, no script", () => {
  assert.match(wm, /<svg ref=\{tintRef\} className="wmtint" viewBox=\{VIEW\} focusable="false">\s*<g transform=\{SET\}><text className="wmtintink" x=\{WM\.x\.join\(" "\)\} y=\{WM\.base\} strokeWidth=\{\(BOLD \+ TINT_BLEED\) \/ WM\.set\.s\}>ASILUM<\/text><\/g>/, "the word again, as set, fuller than the cut");
  assert.ok(TINT_BLEED > 0, "past the hole's soft edge");
  assert.ok(!/mix-blend-mode/.test(css.match(/\.wmtint[^{]*\{[^}]*\}/g).join(" ")), "no blend: a blend inside the glass never sees the page");
  assert.match(css, /\.wmtintink \{ font: 400 161px var\(--mich\); fill: var\(--wm-cut-tint\); stroke: var\(--wm-cut-tint\); stroke-linejoin: miter; transition: fill var\(--dur-2\) var\(--ease-out\), stroke var\(--dur-2\) var\(--ease-out\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.wmtintink \{ transition: none; \} \}/);
  const tok = (src) => (src.match(/--wm-cut-tint: ([^;]+);/) || [])[1];
  const root = css.match(/:root \{([^}]*--wm-star[^}]*)\}/)[1];
  const light = css.match(/\[data-theme="light"\] \{([^}]*--ad-cloud[^}]*)\}/)[1];
  const media = css.match(/@media \(prefers-color-scheme: light\) \{ :root:not\(\[data-theme="dark"\]\) \{([^}]*--ad-cloud[^}]*)\} \}/)[1];
  assert.equal(tok(root), "transparent", "dark: clear");
  assert.ok(tok(light) && tok(light) === tok(media), "light: one tint, both ways");
  const m = tok(light).match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  assert.ok(m, "translucent: " + tok(light));
  const [r, g, b, a] = m.slice(1).map(Number);
  assert.ok(a > 0.2 && a < 0.8, "the glass shows through it");
  const over = (bg) => [r, g, b].map((c, i) => c * a + bg[i] * (1 - a));
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = ([x, y, z]) => 0.2126 * lin(x) + 0.7152 * lin(y) + 0.0722 * lin(z);
  const white = 1.05 / (L(over([255, 255, 255])) + 0.05);
  assert.ok(white >= 3 && white <= 5, `over a white card the letters ${white.toFixed(2)}:1 against the brick, a tint not ink`);
  const glass = [143, 158, 174]; // the light glass through the cut, measured at 375px before the tint
  assert.ok(L(over(glass)) < L(over([255, 255, 255])) * 0.7, "over the glass darker still: it follows what is behind");
});

test("the tint shows only over a really bright card, clipped to its box, read every scroll frame", async () => {
  const { TINT_BRIGHT, TINT_NONE, tintPoints, tintClip } = await import("../lib/ink.js");
  const { wordFrac } = await import("../lib/wordmark.js");
  assert.match(css, /\.wmtint \{ clip-path: inset\(50%\); \}/, "hidden until read: see-through by default");
  assert.ok(TINT_BRIGHT >= 0.8 && TINT_BRIGHT < 0.92, "really bright: the white cards (0.92–1), not the glass");
  // the points: along the word's top and its foot, across it
  const word = { left: 40, top: 30, width: 100, height: 16 };
  const pts = tintPoints(word);
  assert.equal(pts.length, 8);
  assert.deepEqual([...new Set(pts.map((p) => p[1]))], [31, 45], "the top and the foot, 1px inside");
  assert.ok(pts.every(([x]) => x > 40 && x < 140), "across the word");
  assert.deepEqual(tintPoints({ left: 0, top: 0, width: 0, height: 10 }), [], "no word, no points");
  // the clip: the cards' boxes cut to the logo's, in its own pixels; none, nothing shows
  const box = { left: 10, top: 20, width: 140, height: 20 };
  assert.equal(tintClip(box, []), TINT_NONE);
  assert.equal(tintClip(box, [{ left: 0, top: 100, right: 300, bottom: 400 }]), TINT_NONE, "a card below the logo tints nothing");
  assert.equal(tintClip(box, [{ left: 0, top: 31.5, right: 300, bottom: 400 }]), 'path("M0 11.5H140V20H0Z")', "a card coming up under the word: only the part over it");
  assert.equal(tintClip(box, [{ left: 0, top: 0, right: 300, bottom: 24 }, { left: 0, top: 32, right: 300, bottom: 90 }]), 'path("M0 0H140V4H0ZM0 12H140V20H0Z")', "two cards, the gap between them clear");
  // the words: hidden until read, then the hook writes the clip each frame it changes
  const fr = wordFrac();
  assert.ok(fr.x0 > 0 && fr.x1 < 1 && fr.y0 > 0 && fr.y1 < 1, "the word inside the logo's box");
  assert.match(wm, /<svg ref=\{tintRef\} className="wmtint"/);
  assert.match(wm, /<span ref=\{artRef\} className="wmart"/);
  assert.match(wm, /for \(const \[x, y\] of tintPoints\(word\)\) \{ const el = brightSurfaceAt\(x, y, skip, TINT_BRIGHT\); if \(el\) found\.add\(el\); \}/);
  assert.match(wm, /set\(tintClip\(a, \[\.\.\.found\]\.map\(\(el\) => el\.getBoundingClientRect\(\)\)\)\);/);
  assert.match(wm, /window\.addEventListener\("scroll", ask, \{ passive: true, capture: true \}\);/, "every scroll frame, the page's and a carousel's");
  for (const ev of ['window.addEventListener("resize", ask)', 'document.addEventListener("load", ask, true)', 'document.addEventListener("f20settle", ask)', 'attributeFilter: ["data-theme"]']) assert.ok(wm.includes(ev), ev);
  assert.match(wm, /const ask = \(\) => \{ if \(!raf\) raf = requestAnimationFrame\(run\); \};/, "once a frame at most");
  assert.match(wm, /const set = \(v\) => \{ if \(v !== last\) \{ last = v; tint\.style\.clipPath = v; \} \};/, "written only when it changes");
  assert.match(wm, /getPropertyValue\("--wm-cut-tint"\)\.trim\(\) === "transparent"\) \{ set\(TINT_NONE\); return; \}/, "nothing to do in dark");
  // what counts as bright: InkWatch's reading of a block, else a plain bright ground on a card; never a picture or gradient
  const ink = read("app/components/InkWatch.jsx");
  const fn = ink.slice(ink.indexOf("export function brightSurfaceAt"), ink.indexOf("function measureZone"));
  assert.match(fn, /if \(skip && skip\.contains\(el\)\) continue;/, "looking through the Masthead");
  assert.match(fn, /return zone\.dataset\.ink === "dark" \? zone : null;/, "a read block: dark ink sits on a bright ground");
  assert.match(fn, /if \(isMedia\(el\)\) return null;/);
  assert.match(fn, /if \(cs\.backgroundImage !== "none"\) return null;/);
  assert.match(fn, /return l >= bright && el\.closest\("\.card, \.brdcst"\) \? el : null;/);
  assert.ok(!/getImageData|drawImage/.test(fn), "no pixels read on a scroll frame");
});
