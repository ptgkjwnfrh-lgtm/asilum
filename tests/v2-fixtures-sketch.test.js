// tests/v2-fixtures-sketch.test.js — THE FIXTURES AS DRAWN (the owner's
// fixture sketch, 19 Oct 2026, Figures 1, 1.2, 3 and 5). The deck's cuts
// sit exactly on the seams of its columns, the top fixtures line up with
// the deck's right edge, the tab indicator keeps the drawn timing, and the
// search key morphs the deck instead of opening the popup. Source reads
// where the markup is the law (a .jsx cannot be imported here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
const require_fs = () => ({ readdirSync, statSync });
import { doubleBlinkFrames, holdBlinkFrames, indicatorHeld, BLINK_ON_MS, BLINK_GAP_MS, FADE_MS } from "../lib/indicator.js";
import { PATTERNS } from "../lib/haptics.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const rules = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const deck = read("app/components/ControlCenter.jsx");
const fr = (sel) => {
  const m = rules.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{[^}]*grid-template-columns: ([^;]+);"));
  assert.ok(m, sel + " has a column template");
  return m[1].trim().split(/\s+/).map((v) => parseFloat(v));
};

test("the deck is the sketch's 745 × 175 and every cut sits on a seam between its columns", () => {
  assert.match(rules, /--dk-w: calc\(var\(--u\) \* 745\);/);
  assert.match(rules, /--dk-h: calc\(var\(--u\) \* 175\);/);
  const outer = fr(".ccrow");
  const keys = fr(".cctabs");
  assert.deepEqual(outer, [40, 665, 40], "two end caps of 40 around the keys");
  assert.equal(keys.reduce((a, b) => a + b, 0), 665, "the five keys fill the middle");
  assert.equal(outer[0] + outer[1] + outer[2], 745, "the deck is 745 wide");
  const seams = [outer[0]];
  for (const k of keys) seams.push(seams[seams.length - 1] + k);
  const cuts = JSON.parse(deck.match(/const CUTS = (\[[^\]]+\]);/)[1]);
  assert.deepEqual(cuts, seams, "a cut on every seam: after the left cap, between each key, before the right cap");
  assert.ok(keys[2] > Math.max(keys[0], keys[1], keys[3], keys[4]), "the POST cell is the widest (the disc)");
});

test("the carvings are carved into the glass: cuts, the disc's ring, the grill and the indicator bend the backdrop", () => {
  assert.match(deck, /className="cccut"[^>]*data-lens-shape="cut"/);
  assert.match(deck, /className="ccdisc" data-lens-shape="ring"/);
  assert.match(deck, /className="ccgrill" data-lens-shape="slot"/);
  // (19 Oct) the indicator is a light set in the pane, not a carving: the glass does not refract round it
  assert.ok(!/data-lens-shape/.test(read("app/components/TabIndicator.jsx")), "no lens round the indicator");
  assert.match(read("app/components/InfoDock.jsx"), /className="cccut idcut" data-lens-shape="cut"/, "the Info Dock is cut between its keys");
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export function lensFeatures\(el\)/);
  assert.match(glass, /drawRefractionMap\(mapRef\.current,[^\n]*, lensFeatures\(el\), bezel === "fixture" \? fixtureBezel\(\) : bezel, xRef\.current, yRef\.current\);/, "the map is drawn with the carvings, as two greys");
  // the grill sits centred under the POST disc: 40 + 123 + 127 + 162 / 2 = 371
  const g = rules.match(/\.ccgrill \{[^}]*left: calc\(var\(--u\) \* ([\d.]+)\); width: calc\(var\(--u\) \* ([\d.]+)\)/s);
  assert.ok(g, "the grill is placed in sketch units");
  assert.equal(Number(g[1]) + Number(g[2]) / 2, 371, "the grill is centred on the disc");
  assert.ok(!/<AdStrip/.test(deck), "nothing but the drawing on the deck: the ad strip left it");
});

test("the top fixtures sit at the top right, the Passport's right edge in line with the deck's, 8 apart (shrunk from the drawn 18)", () => {
  assert.match(rules, /\.passportbtn \{[^}]*right: var\(--dk-edge\); width: calc\(var\(--u\) \* 82\);/s);
  const off = Number(rules.match(/\.infodock \{ right: calc\(var\(--dk-edge\) \+ var\(--u\) \* (\d+)\); \}/)[1]);
  assert.equal(off, 82 + 8, "the Info Dock ends 8 short of the Passport (owner, 19 Oct: the gap shrunk)");
  assert.match(rules, /\.idkey \{[^}]*width: calc\(var\(--u\) \* 97\);/s, "three keys of the drawn 292");
  assert.ok(!/\.infodock \{[^}]*left:/s.test(rules.split(".infodock {")[1].split("}")[0]), "not the top left any more");
});

test("the tab indicator, paced like a DVD player's light: two blinks a visible beat apart; POST and the globe blink once and hold", () => {
  // declared before measuring (owner, 19 Oct 2026: "longer … like a DVD player indicator"): each blink lit
  // for at least 100ms, a dark beat between them that lasts two 60Hz frames or more (33ms), the whole
  // double blink under 600ms, the light's own afterglow rather than a hard cut
  const d = doubleBlinkFrames();
  // the opacity at t, linear between keyframes; at a shared offset the later keyframe wins (a step)
  const at = (anim, t) => {
    const f = anim.frames.map((k) => ({ t: k.offset * anim.duration, o: k.opacity }));
    let o = f[0].o;
    for (let i = 0; i < f.length - 1; i++) {
      if (t >= f[i].t && t < f[i + 1].t) return f[i].o + (f[i + 1].o - f[i].o) * ((t - f[i].t) / (f[i + 1].t - f[i].t));
      if (t >= f[i + 1].t) o = f[i + 1].o;
    }
    return o;
  };
  const runs = (anim, lit) => { const out = []; let start = null; for (let t = 0; t <= anim.duration; t += 1) { const on = lit(at(anim, t)); if (on && start === null) start = t; if (!on && start !== null) { out.push([start, t]); start = null; } } if (start !== null) out.push([start, anim.duration]); return out; };
  const litRuns = runs(d, (o) => o > 0.5);
  assert.equal(litRuns.length, 2, "two blinks");
  for (const [a, b] of litRuns) assert.ok(b - a >= 100, "each blink is lit 100ms or more (" + (b - a) + ")");
  const dark = runs(d, (o) => o < 0.05).filter(([a, b]) => a > litRuns[0][0] && b < litRuns[1][1]);
  assert.ok(dark.length === 1 && dark[0][1] - dark[0][0] >= 33, "a dark beat of two frames or more between them");
  assert.ok(d.duration < 600, "an indicator, not a show");
  assert.ok(at(d, BLINK_ON_MS + FADE_MS / 2) > 0.05 && at(d, BLINK_ON_MS + FADE_MS / 2) < 0.95, "it fades out like an LED, not a hard cut");
  assert.equal(BLINK_ON_MS + BLINK_GAP_MS, PATTERNS.blink2[0] + PATTERNS.blink2[1], "the second vibration lands with the second blink");
  const h = holdBlinkFrames();
  assert.equal(h.duration, BLINK_ON_MS + BLINK_GAP_MS);
  assert.ok(at(h, 50) === 1 && at(h, h.duration - 1) === 0, "one blink, the break, then the hold's own light takes over");
  assert.equal(indicatorHeld({ sheetId: "postselect" }), true);
  assert.equal(indicatorHeld({ sheetId: "post" }), true);
  assert.equal(indicatorHeld({ hubOpen: true }), true);
  assert.equal(indicatorHeld({ onPassport: true }), true);
  assert.equal(indicatorHeld({ sheetId: "likes" }), false, "a utility's popup does not hold the light");
  assert.equal(indicatorHeld({}), false);
  assert.equal(PATTERNS.blink.length, 1, "one subtle vibration on the hold's blink");
  assert.equal(PATTERNS.blink2.filter((_, i) => i % 2 === 0).length, 2, "one per blink of the double");
  const ind = read("app/components/TabIndicator.jsx");
  assert.match(ind, /prefers-reduced-motion: reduce/, "reduced motion: no blinking");
  assert.match(rules, /--warn: #ff4136;[^\n]*\n\[data-theme="light"\] \{ --warn: #d22f22;/, "red in both palettes (--warn)");
  assert.match(rules, /\.tabind \{[^}]*width: max\(11px, calc\(var\(--u\) \* 26\)\);/s, "a little bigger than drawn (owner, 19 Oct)");
});

test("search morphs the deck upward; the popup waits for the first character; one field on screen", () => {
  const press = deck.slice(deck.indexOf("function press(id)"), deck.indexOf('if (id === "post")'));
  assert.ok(!/openSheet\("search"\)/.test(press), "the search key does not open the popup");
  assert.match(deck, /if \(scope\.id === "global" && v\.trim\(\) && !searchPopupUp\) openSheet\("search"\);/, "typing opens it");
  assert.match(rules, /\.ccenter\.ccsearching \{ height: calc\(var\(--dk-h\) \+ var\(--dk-rise\)\); \}/, "the deck extends upward");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{ \.ccenter \{ transition: none; \} \.ccsearch \{ animation: none; \} \}/);
  assert.match(read("app/components/SearchSheet.jsx"), /\{dock\.mode !== "search" \? \(\n\s*<label className="srchfield">/, "the popup hides its own field while the deck's bar is up");
  assert.match(read("app/components/SheetHost.jsx"), /useFocusTrap\(ref, open, \{ companion: "\.ccsearch" \}\)/, "the popup does not steal the caret");
});

test("the September recipe on the fixtures: full pull split 80/86/92, the Safari page bend, the lamps and the meniscus", () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export const PULL = \[80, 86, 92\];/);
  assert.match(glass, /export const BEZEL = 56;/);
  assert.match(glass, /const GLASS_N = 1\.5;/);
  assert.match(glass, /const bez = Math\.max\(6, Math\.min\(BEZEL, Math\.min\(w, h\) \/ 2, bezel \? \(bezel < 1 \? Math\.min\(w, h\) \* bezel : bezel\) : Infinity\)\);/, "56px at most, never past the middle, and as thin as the pane asks (a fraction, or px)");
  for (const [f, id] of [["app/components/InfoDock.jsx", "lg-infodock"], ["app/components/PassportButton.jsx", "lg-passportbtn"], ["app/components/ControlCenter.jsx", "lg-deck"]]) {
    const src = read(f);
    assert.match(src, new RegExp(`useLiquidGlass\\(glassRef, \\{ id: "${id}", strength: 1, bend: FIXTURE_BEND`), f + " runs the header's full strength, no extra prism, and bends the page on WebKit");
    assert.match(src, /useGlassLamps\(glassRef/, f + " carries the lamp under the water");
    assert.match(src, /shine: false/, f + " does not answer the pointer");
  }
  // (19 Oct, fourth pass) no surface hover reactions: no dome, no hovered lamp, no pointer shine, no hover fills
  assert.ok(!/DOME|ripple|pointerover/.test(glass.slice(glass.indexOf("export function useGlassLamps"))), "the lamp hook does not listen to the pointer");
  assert.match(glass, /if \(!still && shine\) \{/, "the pane's pointer shine can be turned off");
  assert.match(rules, /\.ccenter::before \{ background: var\(--glass-sheen\); \}/, "the gloss only");
  assert.ok(!/--fx-sheen-half:[^;]*var\(--g[xy]/s.test(rules), "the top fixtures' gloss does not follow the pointer either");
  assert.ok(!/(\.ccenter \.tabl|\.idkey|\.passportbtn|\.ccenter \.mailbtn|\.ccclose):hover/.test(rules), "no hover fills on the fixtures' keys");
  // the glow spread cut by 45% (owner, 19 Oct): the lamp, the glyphs, the disc, the indicator
  assert.match(rules, /\.glass-light \{[^}]*filter: blur\(7\.7px\);[^}]*radial-gradient\(77px 29px/s, "the lamp at 55% of September's 14px blur and 140 × 52 halo");
  assert.match(rules, /drop-shadow\(0 0 2\.75px color-mix/, "the glyph glow at 55% of 5px");
  assert.match(rules, /0 0 3\.85px color-mix\(in srgb, currentColor 35%/, "the disc's glow at 55% of 7px");
  // the press shades a whisper, and the fixtures are 10% more opaque
  assert.match(rules, /color-mix\(in srgb, var\(--shade\) 7%, transparent\)\);\n  box-shadow: inset 0 -1px 0 color-mix\(in srgb, var\(--shade\) 10%, transparent\);/);
  assert.match(rules, /--fx-tint: rgba\(0, 0, 0, 0\.275\);/, "27.5% black in dark");
  assert.match(rules, /--fx-tint: rgba\(255, 255, 255, 0\.275\);/, "27.5% white in light");
  // one glow for every key (the dock's, the globe's, the deck's), its strength cut 25%: 45% -> 33.75%
  assert.match(rules, /drop-shadow\(0 0 2\.75px color-mix\(in srgb, currentColor 33\.75%, transparent\)\)/);
  assert.ok(!/\.ccgrill \{[^}]*box-shadow/s.test(rules), "the vent casts no shadow");
  // the indicator: its ring 65% thinner (1.5px -> 0.525px), its light brighter, not wider
  assert.match(rules, /\.tabind \{[^}]*border: 0\.525px solid/s);
  assert.match(rules, /\.tabindlamp \{[^}]*background: var\(--warn\);/s, "solid red (owner, 19 Oct)");
});

test("the owner's second pass (19 Oct): hairline cuts, the 15% touch, the dark glow, Michroma everywhere", () => {
  assert.match(rules, /\.cccut \{[^}]*width: 1px;[^}]*background: color-mix\(in srgb, var\(--ink\) 14%, transparent\);/s, "a cut is the search field's outline");
  assert.match(rules, /\.ccfield \{[^}]*border: 1px solid color-mix\(in srgb, var\(--ink\) 14%, transparent\);/s, "…which is this");
  assert.match(deck, /data-lens-shape="cut" data-lens-band="6" data-lens-gain="0\.08"/, "and barely bends");
  assert.match(rules, /background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);/);
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) :is\(\.ccenter \.tabl, \.ccenter \.mailbtn, \.idkey, \.passportbtn\) \.ic \{\n  filter: drop-shadow/, "the keys glow in dark only");
  for (const tok of ["--helv", "--serif", "--mono", "--mich"]) {
    assert.match(rules, new RegExp(tok + ': "Michroma"'), tok + " is Michroma");
  }
});

test("the third pass (19 Oct): hinged keys, short cuts, a vent with no outline, a thin bezel, one stroke, the shine rim", () => {
  // every key but POST is a flap hinged on its top edge; the hinge is never drawn
  for (const [f, n] of [["app/components/ControlCenter.jsx", 3], ["app/components/InfoDock.jsx", 1], ["app/components/PassportButton.jsx", 1]]) {
    const src = read(f);
    assert.match(src, /useHingedKeys\(glassRef/, f + " holds the pressed state");
    assert.ok((src.match(/\bhkey\b/g) || []).length >= n, f + " hinges its keys");
    assert.match(src, /bezel: "fixture"/, f + " runs the one fixture bezel");
    assert.match(src, /<i className="fxrim" aria-hidden="true" \/>/, f + " wears the shine rim");
  }
  assert.ok(!/ccpost[^"]*hkey|hkey[^"]*ccpost/.test(deck), "the upload disc is not hinged");
  assert.match(rules, /\.hkey \{\n  transform-origin: 50% 0;/, "hinged on the top edge");
  assert.match(rules, /\.hkey\[data-pressed\] \{\n  transform: perspective\(220px\) rotateX\(-17deg\)/, "the lower edge tips into the glass");
  assert.match(rules, /\.hkey, \.hkey\[data-pressed\], \.hkey \.ic, \.hkey\[data-pressed\] \.ic \{ transform: none; transition: none; \}/, "reduced motion: no tipping");
  const hinge = read("app/components/hinge.js");
  assert.match(hinge, /export const MIN_PRESS_MS = 110;/, "a quick tap still shows");
  assert.match(hinge, /e\.key !== " " && e\.key !== "Enter"/, "the keyboard presses the same way");
  // the cuts are shorter, the vent has no outline
  assert.match(rules, /top: calc\(var\(--u\) \* 58\); bottom: calc\(var\(--u\) \* 52\);/);
  assert.ok(!/\.ccgrill \{[^}]*border:/s.test(rules), "the vent carries no outline");
  assert.match(rules, /\.fixture \.ic \*, \.ccenter \.ic \* \{ vector-effect: non-scaling-stroke; stroke-width: 1\.5px; \}/, "one stroke on every glyph");
  assert.match(rules, /\.fxrim \{[^}]*padding: 0\.75px;[^}]*linear-gradient\(135deg, var\(--fx-rim-hi\)/s, "a hairline that catches the light at two corners");
});

test("the bend is centred: no coloured map ever reaches a displacement, and the three fixtures share one bezel", () => {
  // (19 Oct) the owner saw the warp curve to the left; a grid under the deck showed every vertical line
  // hooking left along its lips. A colour map is colour-managed even inside the filter, which leaks the
  // up-and-down pull into a sideways one. Declared: every displacement reads a GREY map (lgxa / lgya), and
  // each pass reads the direction it leaves alone from the alpha channel, held at one half.
  const glass = read("app/components/LiquidGlass.jsx");
  const defs = glass.slice(glass.indexOf("export function LiquidGlassDefs"), glass.indexOf("export function restrictLens"));
  const passes = [...defs.matchAll(/<feDisplacementMap [^>]*\/>/g)].map((m) => m[0]);
  assert.equal(passes.length, 6, "two passes for each of red, green and blue");
  for (const p of passes) {
    assert.match(p, /in2="lg[xy]a"/, "a grey map: " + p);
    assert.match(p, /(xChannelSelector="R" yChannelSelector="A")|(xChannelSelector="A" yChannelSelector="R")/, "one direction a pass: " + p);
  }
  assert.match(defs, /<feColorMatrix in="lgx" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0\.5" result="lgxa" \/>/, "the alpha held at a half");
  assert.ok(!/in2="lgmap"/.test(defs), "the colour map is off the chain");
  assert.match(glass, /export const FIXTURE_BEZEL_UNITS = 175 \* 0\.26;/, "one bezel for the deck, the Info Dock and the globe");
  assert.match(glass, /Math\.min\(0\.5, Math\.max\(0\.4, [^\n]*\* 0\.001\)\)/, "in the same --u as globals.css");
  assert.match(rules, /--u: clamp\(0\.4px, 0\.1vw, 0\.5px\);/);
});

test("the top fixtures shine like the deck: their gloss is the deck's at their half height, the rim calmer", () => {
  // declared: the top specular and bottom light reach half as deep (16px -> 8px, 8px -> 4px), the diagonal
  // band at half strength, in both palettes; the deck keeps September's own gloss
  assert.match(rules, /\.ccenter::before \{ background: var\(--glass-sheen\); \}/);
  assert.match(rules, /\.fixture::before \{ background: var\(--fx-sheen-half\); \}/);
  const halves = [...rules.matchAll(/--fx-sheen-half:\s*\n\s*linear-gradient\(180deg,[^)]*\)[^)]*\)[^)]*\) (\d+(?:\.\d+)?)px\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(halves, [8, 8], "half the 16px top specular, both palettes");
  assert.equal((rules.match(/--fx-sheen-half:/g) || []).length, 2);
  assert.match(rules, /\.fixture \.fxrim \{ opacity: 0\.6; \}/);
});


test("another key leaves search: the deck rises only for SEARCH, and every other fixture key brings it down", async () => {
  const D = await import("../lib/dockstate.js");
  // the state module is pure enough to drive: open search, then a utility
  D.setMode("search");
  D.leaveSearch();
  assert.equal(D.getDock().mode, "base", "leaving search drops the deck");
  D.leaveSearch(); // a no-op outside search: it must not close a popup that is not search's
  assert.equal(D.getDock().mode, "base");
  const src = read("lib/dockstate.js");
  assert.match(src, /export function leaveSearch\(\) \{ if \(state\.mode === "search"\) closeSearch\(\); \}/);
  assert.match(src, /if \(id === "search"\) state\.mode = "search";/, "only the search popup enters search mode");
  assert.ok(!/id === "likes" \|\| id === "messages"/.test(src), "Likes and Messages no longer raise the deck by themselves");
  // the three fixtures call it, the deck on the press itself (before POST or MESSAGES act)
  assert.match(deck, /onPointerDownCapture=\{keyDown\}/);
  assert.match(deck, /t\.getAttribute\("aria-label"\) === "search"\) return;\n[^\n]*\n\s*leaveSearch\(\);/, "every key but SEARCH itself");
  assert.match(read("app/components/InfoDock.jsx"), /if \(dock\.mode === "search"\) \{ leaveSearch\(\); openSheet\(id\); return; \}/);
  assert.match(read("app/components/PassportButton.jsx"), /onClick=\{leaveSearch/);
});

test("the wordmark is a fixture in the top-left corner, and nothing on the site is italic", () => {
  assert.match(rules, /\.brandfix \{\n  position: fixed; z-index: 66; left: var\(--dk-edge\);/, "fixed, its left edge on the deck's");
  assert.match(rules, /\.brandfix \{[^}]*height: calc\(var\(--u\) \* 88\);[^}]*flex-direction: column; justify-content: center;/s, "its middle on the top fixtures' middle");
  // (19 Oct) the name in metal, a touch bolder; the asterisk smaller, at the top of the capitals; a
  // thick translucent bar and one square under the word, within its width
  // the metal and its halo on the capitals only, so the red asterisk takes none of the green glow
  assert.match(rules, /\.wmcaps \{[^}]*background: var\(--metal\);[^}]*-webkit-text-stroke: 0\.5px var\(--metal-edge\);/s);
  assert.match(rules, /\.wordmark \.wmcaps \{ filter: drop-shadow/);
  assert.ok(!/\.wmword \{[^}]*(filter|background):/s.test(rules));
  // the asterisk small and up in the corner, plain red: no stroke, no glow
  assert.match(rules, /\.wmword i \{[^}]*font-size: 0\.6em;[^}]*top: -0\.68em;[^}]*color: var\(--warn\);[^}]*text-shadow: none; \}/s);
  assert.ok(!/\.wmword i \{[^}]*-webkit-text-stroke/s.test(rules), "not bolded");
  assert.match(rules, /\.wmbar::before \{ content: ""; flex: 1;[^}]*background: var\(--wm-bar\); \}/, "the bar fills the word's width");
  assert.match(rules, /\.wmsq \{ flex: none; aspect-ratio: 1; height: 100%;/, "one square, as thick as the bar");
  assert.equal((rules.match(/--metal: linear-gradient/g) || []).length, 2, "metal in both palettes");
  assert.ok(!/\n\.wordmark \{[^}]*filter:/.test(rules), "no glow in light: the phosphor glow is dark-only");
  const wm = read("app/components/Wordmark.jsx");
  assert.match(wm, /<span className="wmword"><i>\*<\/i><span className="wmcaps">ASILUM<\/span><\/span>/);
  // one load in ten the line is a chevron run that fills it, measured
  assert.match(wm, /export const CHEVRON_CHANCE = 0\.1;/);
  assert.match(wm, /useEffect\(\(\) => \{ if \(Math\.random\(\) < CHEVRON_CHANCE\) setChev\(true\); \}, \[\]\);/, "after hydration, never during the server render");
  assert.match(wm, /setCount\(Math\.max\(MIN_CHEVRONS, Math\.floor\(run\.clientWidth \/ one\)\)\)/, "as many as fill the line");
  // no red glows anywhere (owner, 19 Oct 2026)
  for (const sel of ["\\.wmsq", "\\.tabindlamp"]) assert.ok(!new RegExp(sel + " \\{[^}]*box-shadow: 0 0").test(rules), sel + " does not glow");
  assert.ok(!/text-shadow: 0 0 \d+px color-mix\(in srgb, var\(--warn\)/.test(rules), "no red text glows");
  assert.ok(!/box-shadow: 0 0 \d+px var\(--warn\)/.test(rules), "no red light glows");
  assert.match(wm, /<span className=\{"wmbar" \+ \(chev \? " chev" : ""\)\} aria-hidden="true">/, "the bar, decorative");
  assert.match(wm, /<b className="wmsq" \/>/, "and its one square");
  assert.match(rules, /\[data-popup\] \.brandfix \{ transform: scale\(0\.92\); opacity: 0\.55; \}/, "it dims with the fixtures under a popup");
  assert.ok(!/\.feedmark/.test(rules), "the Feed's masthead mark is gone");
  // nothing italic: no rule, no default slant, no synthesized oblique
  const css = read("app/globals.css");
  assert.ok(!/italic|oblique/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "no rule slants anything");
  assert.match(rules, /:where\(em, i, cite, var, dfn, address, q\) \{ font-style: normal; \}/);
  assert.match(rules, /html \{ font-synthesis-style: none; \}/);
  const { readdirSync, statSync } = require_fs();
  const offenders = [];
  const walk = (d) => { for (const f of readdirSync(new URL("../" + d, import.meta.url))) { const q = d + "/" + f; if (statSync(new URL("../" + q, import.meta.url)).isDirectory()) walk(q); else if (/\.(jsx?|mjs|css)$/.test(f) && /fontStyle:\s*["']italic|font-style:\s*italic/.test(read(q))) offenders.push(q); } };
  walk("app");
  assert.deepEqual(offenders, [], "no component slants a word inline either");
});

